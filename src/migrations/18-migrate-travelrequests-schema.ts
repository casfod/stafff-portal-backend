/**
 * migrate-travelrequests-schema.ts
 *
 * Migrates documents in the `travelrequests` collection (Mongoose model
 * name `TravelRequests`, collection name intentionally kept as
 * `travelrequests`) to match the new schema in TravelRequest.model.ts
 * (+ shared comment.schema.ts / itemGroup.schema.ts's expenseItemSchema).
 *
 * This is structurally the twin of the ExpenseClaims migration — same
 * shared expenseItemSchema, same denormalized-name pattern.
 *
 * WHAT IT DOES
 *
 * 1. Drops `staffName` — no equivalent field in the new schema, same
 *    pattern as staffName/requestBy/staff_name in the other collections;
 *    derive from the populated `createdBy` ref instead. Logged in
 *    `summary.droppedFields` before removal.
 *
 * 2. Strips `_id` from each `expenses[]` line item, matching the shared
 *    `expenseItemSchema`'s `{ _id: false }` (same schema ExpenseClaims
 *    uses).
 *
 * 3. Trims the string fields the schema declares `trim: true` on
 *    (trNumber, travelRequest.from/to, expenseChargedTo, accountCode,
 *    travelReason, dayOfDeparture, dayOfReturn).
 *
 * 4. Backfills missing `comments[]` subdocument fields (edited, deleted,
 *    createdAt, updatedAt). (Your sample's comment is already fully
 *    populated, but other documents may not be.)
 *
 * 5. Flags (does not fabricate) documents missing `trNumber`. Same class
 *    of issue as the other doc-numbered collections: `trNumber` is
 *    `unique: true` WITHOUT `sparse: true`. Your sample has one, but
 *    other documents may not.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db) using the
 *   collection name `travelrequests`, not the Mongoose model, to avoid
 *   triggering the trNumber-generating pre-save hook during a bulk
 *   backfill.
 *
 * USAGE
 *   import { migrateTravelRequests } from './migrate-travelrequests-schema';
 *   await migrateTravelRequests({ dryRun: true });   // inspect first
 *   await migrateTravelRequests({ dryRun: false });  // then apply
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
  missingTrNumber: unknown[];
}

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'trNumber',
  'travelRequest',
  'expenseChargedTo',
  'accountCode',
  'project',
  'budget',
  'amountInWords',
  'travelReason',
  'dayOfDeparture',
  'dayOfReturn',
  'expenses',
  'createdBy',
  'reviewedBy',
  'approvedBy',
  'status',
  'comments',
  'copiedTo',
  'createdAt',
  'updatedAt',
  '__v',
]);

const TRIM_FIELDS = [
  'trNumber',
  'expenseChargedTo',
  'accountCode',
  'travelReason',
  'dayOfDeparture',
  'dayOfReturn',
];

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

  // 2. Strip _id from expenses[] line items
  if (Array.isArray(doc.expenses)) {
    let changed = false;
    const newExpenses = doc.expenses.map((item: Record<string, any>) => {
      if (item && typeof item === 'object' && '_id' in item) {
        const { _id, ...rest } = item;
        changed = true;
        return rest;
      }
      return item;
    });
    if (changed) $set.expenses = newExpenses;
  }

  // 3. Trim string fields
  for (const field of TRIM_FIELDS) {
    const value = doc[field];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== value) $set[field] = trimmed;
    }
  }
  if (doc.travelRequest && typeof doc.travelRequest === 'object') {
    const from = typeof doc.travelRequest.from === 'string' ? doc.travelRequest.from.trim() : doc.travelRequest.from;
    const to = typeof doc.travelRequest.to === 'string' ? doc.travelRequest.to.trim() : doc.travelRequest.to;
    if (from !== doc.travelRequest.from || to !== doc.travelRequest.to) {
      $set.travelRequest = { ...doc.travelRequest, from, to };
    }
  }

  // 4. Backfill comment subdocument defaults
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

  // 5. Flag missing trNumber (informational only — see header comment)
  const effectiveTrNumber = $set.trNumber !== undefined ? $set.trNumber : doc.trNumber;
  if (effectiveTrNumber === undefined || effectiveTrNumber === null || effectiveTrNumber === '') {
    summary.missingTrNumber.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateTravelRequests(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('travelrequests');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    missingTrNumber: [],
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
    `[migrateTravelRequests] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateTravelRequests] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.missingTrNumber.length) {
    console.warn(
      `[migrateTravelRequests] ${summary.missingTrNumber.length} document(s) have no trNumber. ` +
        `trNumber is unique WITHOUT sparse — if this count is > 1, building/rebuilding that index will ` +
        `throw E11000 on duplicate nulls. Recommend adding sparse: true. _ids:`,
      summary.missingTrNumber,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateTravelRequests] Errors:', summary.errors);
  }

  return summary;
}


   async function main() {
     await mongoose.connect(env.MONGODB_URI!);
     const dry = await migrateTravelRequests({ dryRun: true });
     console.log(dry.droppedFields, dry.missingTrNumber);
     await migrateTravelRequests({ dryRun: false });
     await mongoose.disconnect();
   }

