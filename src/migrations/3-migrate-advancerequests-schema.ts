/**
 * migrate-advancerequests-schema.ts
 *
 * Migrates documents in the `advancerequests` collection to match the new
 * schema in AdvanceRequest.model.ts (+ shared comment.schema.ts / itemGroup.schema.ts).
 *
 * Unlike the users/projects migrations, most field NAMES here already match
 * (the old data was already camelCase). What's actually needed:
 *
 * 1. Strip any top-level field not declared in the new schema (e.g. legacy
 *    `requestedBy`, which has no equivalent in IAdvanceRequest). The removed
 *    key/value is logged per document before being unset, so nothing
 *    disappears silently — check `summary.droppedFields` before trusting
 *    the delete.
 *
 * 2. Backfill missing fields on each `comments[]` subdocument
 *    (edited, deleted, createdAt, updatedAt) to match commentSchema's
 *    declared defaults. Mongoose applies schema defaults for undefined
 *    paths at runtime, but they are not physically stored until the
 *    document is re-saved — this writes them for real so raw
 *    aggregations/exports see consistent shapes too.
 *      - edited/deleted default to false.
 *      - createdAt/updatedAt fall back to the parent AdvanceRequest's own
 *        createdAt/updatedAt, since the original comments were never
 *        timestamped individually. This is a best-effort approximation,
 *        not the true comment time — flagged in the summary so you can
 *        decide if that's acceptable.
 *
 * 3. Flag (do NOT fabricate) documents missing `arNumber`. The schema
 *    declares `arNumber: { unique: true }` WITHOUT `sparse: true`. Mongo's
 *    default unique index treats every missing field as `null`, so more
 *    than one document without `arNumber` will throw E11000 the moment
 *    that index is (re)built. This script does not invent AR numbers —
 *    doing so would require replicating generateDocNumber()'s real
 *    counter logic. Recommended fix: add `sparse: true` next to
 *    `unique: true` on `arNumber` in AdvanceRequest.model.ts, mirroring
 *    the earlier bankSortCode fix, so only documents that actually have
 *    a value are constrained to be unique.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the arNumber-generating pre-save
 *   hook or schema validation during a bulk backfill.
 *
 * USAGE
 *   import { migrateAdvanceRequests } from './migrate-advancerequests-schema';
 *   await migrateAdvanceRequests({ dryRun: true });   // inspect first
 *   await migrateAdvanceRequests({ dryRun: false });  // then apply
 */

import mongoose from 'mongoose';
import { env } from '../config/env';

interface MigrationOptions {
  dryRun?: boolean;
  batchSize?: number;
}

interface DroppedField {
  _id: unknown;
  field: string;
  value: unknown;
}

interface MigrationSummary {
  scanned: number;
  matched: number;
  modified: number;
  skipped: number;
  errors: { _id: unknown; error: string }[];
  droppedFields: DroppedField[];
  missingArNumber: unknown[]; // list of _ids lacking arNumber
}

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'arNumber',
  'department',
  'suggestedSupplier',
  'address',
  'finalDeliveryPoint',
  'city',
  'accountNumber',
  'accountName',
  'bankName',
  'expenseChargedTo',
  'accountCode',
  'project',
  'periodOfActivity',
  'activityDescription',
  'approvedBy',
  'reviewedBy',
  'itemGroups',
  'comments',
  'copiedTo',
  'status',
  'createdBy',
  'createdAt',
  'updatedAt',
  '__v',
]);

function buildUpdateForDoc(
  doc: Record<string, any>,
  summary: MigrationSummary,
): { $set?: Record<string, any>; $unset?: Record<string, ''> } | null {
  const $set: Record<string, any> = {};
  const $unset: Record<string, ''> = {};

  // 1. Strip fields not in the new schema
  for (const key of Object.keys(doc)) {
    if (!ALLOWED_FIELDS.has(key)) {
      summary.droppedFields.push({ _id: doc._id, field: key, value: doc[key] });
      $unset[key] = '';
    }
  }

  // 2. Backfill comment subdocument defaults
  if (Array.isArray(doc.comments) && doc.comments.length > 0) {
    let changed = false;
    const fallbackCreatedAt = doc.createdAt ?? new Date();
    const fallbackUpdatedAt = doc.updatedAt ?? fallbackCreatedAt;

    const newComments = doc.comments.map((c: Record<string, any>) => {
      const updated = { ...c };
      if (updated.edited === undefined) {
        updated.edited = false;
        changed = true;
      }
      if (updated.deleted === undefined) {
        updated.deleted = false;
        changed = true;
      }
      if (updated.createdAt === undefined) {
        updated.createdAt = fallbackCreatedAt;
        changed = true;
      }
      if (updated.updatedAt === undefined) {
        updated.updatedAt = fallbackUpdatedAt;
        changed = true;
      }
      return updated;
    });

    if (changed) {
      $set.comments = newComments;
    }
  }

  // 3. Flag missing arNumber (informational only — see header comment)
  if (doc.arNumber === undefined || doc.arNumber === null || doc.arNumber === '') {
    summary.missingArNumber.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateAdvanceRequests(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('advancerequests');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    missingArNumber: [],
  };

  const cursor = collection.find({});
  let batch: { updateOne: { filter: { _id: any }; update: any } }[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;
    if (dryRun) {
      summary.modified += batch.length;
      batch = [];
      return;
    }
    try {
      const result = await collection.bulkWrite(batch, { ordered: false });
      summary.modified += result.modifiedCount ?? 0;
    } catch (err: any) {
      const writeErrors = err?.writeErrors ?? [];
      if (writeErrors.length) {
        for (const we of writeErrors) {
          summary.errors.push({ _id: batch[we.index]?.updateOne.filter._id, error: we.errmsg ?? String(we) });
        }
        summary.modified += batch.length - writeErrors.length;
      } else {
        summary.errors.push({ _id: 'batch', error: err?.message ?? String(err) });
      }
    }
    batch = [];
  };

  for await (const doc of cursor) {
    summary.scanned++;

    let update: ReturnType<typeof buildUpdateForDoc>;
    try {
      update = buildUpdateForDoc(doc as Record<string, any>, summary);
    } catch (err: any) {
      summary.errors.push({ _id: doc._id, error: err?.message ?? String(err) });
      continue;
    }

    if (!update) {
      summary.skipped++;
      continue;
    }

    summary.matched++;
    batch.push({ updateOne: { filter: { _id: doc._id }, update } });

    if (batch.length >= batchSize) {
      await flushBatch();
    }
  }

  await flushBatch();

  console.log(
    `[migrateAdvanceRequests] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateAdvanceRequests] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.missingArNumber.length) {
    console.warn(
      `[migrateAdvanceRequests] ${summary.missingArNumber.length} document(s) have no arNumber. ` +
        `The new schema's arNumber is unique but NOT sparse — if this count is > 1, building/rebuilding ` +
        `that index will throw E11000 on duplicate nulls. Recommend adding sparse: true to the schema. _ids:`,
      summary.missingArNumber,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateAdvanceRequests] Errors:', summary.errors);
  }

  return summary;
}


  
  async function main() {
    await mongoose.connect(env.MONGODB_URI!);
    const dry = await migrateAdvanceRequests({ dryRun: true });
    console.log(dry.droppedFields, dry.missingArNumber);
    await migrateAdvanceRequests({ dryRun: false });
     await mongoose.disconnect();
   }

