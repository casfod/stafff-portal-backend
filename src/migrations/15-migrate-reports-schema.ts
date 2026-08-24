/**
 * migrate-reports-schema.ts
 *
 * The sample document you provided already matches Report.model.ts
 * field-for-field, including a fully-populated comment subdocument — no
 * renames needed. Like the leavebalances/paymentvouchers migrations,
 * this is a defensive pass rather than a structural one: it makes sure
 * every document in the collection is actually this complete, since one
 * representative sample hasn't guaranteed that for several other
 * collections in this app.
 *
 * WHAT IT DOES
 *
 * 1. Drops any top-level field with no equivalent in the new schema
 *    (none expected from your sample, included defensively).
 *
 * 2. Backfills missing `comments[]` subdocument fields (edited, deleted,
 *    createdAt, updatedAt) wherever a document has a comment that isn't
 *    as complete as your sample's.
 *
 * 3. Flags (does not fabricate) documents missing `reportNumber`. Same
 *    class of issue as arNumber/cnNumber/ecNumber/grdCode/leaveNumber/
 *    pmrNumber/pvNumber/pcrNumber in the other collections:
 *    `reportNumber` is `unique: true` WITHOUT `sparse: true`. Your
 *    sample document has one, but if any other documents don't, more
 *    than one missing value will throw E11000 on index (re)build.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the reportNumber-generating
 *   pre-save hook during a bulk backfill.
 *
 * USAGE
 *   import { migrateReports } from './migrate-reports-schema';
 *   await migrateReports({ dryRun: true });   // inspect first
 *   await migrateReports({ dryRun: false });  // then apply
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
  missingReportNumber: unknown[];
}

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'reportNumber',
  'activityType',
  'otherActivitySpecification',
  'reportType',
  'reportTitle',
  'reportingPeriod',
  'project',
  'reviewedBy',
  'approvedBy',
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

  // 1. Drop stray fields not in the new schema
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

    if (changed) $set.comments = newComments;
  }

  // 3. Flag missing reportNumber (informational only — see header comment)
  if (doc.reportNumber === undefined || doc.reportNumber === null || doc.reportNumber === '') {
    summary.missingReportNumber.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateReports(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('reports');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    missingReportNumber: [],
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
    `[migrateReports] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateReports] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.missingReportNumber.length) {
    console.warn(
      `[migrateReports] ${summary.missingReportNumber.length} document(s) have no reportNumber. ` +
        `reportNumber is unique WITHOUT sparse — if this count is > 1, building/rebuilding that index will ` +
        `throw E11000 on duplicate nulls. Recommend adding sparse: true. _ids:`,
      summary.missingReportNumber,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateReports] Errors:', summary.errors);
  }

  return summary;
}


   async function main() {
     await mongoose.connect(env.MONGODB_URI!);
     const dry = await migrateReports({ dryRun: true });
     console.log(dry.droppedFields, dry.missingReportNumber);
     await migrateReports({ dryRun: false });
     await mongoose.disconnect();
   }
