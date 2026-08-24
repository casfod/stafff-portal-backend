/**
 * migrate-expenseclaims-schema.ts
 *
 * Migrates documents in the `expenseclaims` collection to match the new
 * schema in ExpenseClaims.model.ts (+ shared comment.schema.ts /
 * itemGroup.schema.ts's expenseItemSchema).
 *
 * Field names in the old data already match the new schema almost
 * entirely — no snake_case renaming needed here. What's left:
 *
 * 1. Drops any top-level field with no equivalent in the new schema
 *    (in practice: `staffName`, which — like staffName/position/
 *    supervisorName/staff_name/staff_role in the other collections you've
 *    migrated — has no replacement field; derive it from the populated
 *    `createdBy` ref instead of storing a snapshot that goes stale).
 *    Every dropped key/value is logged in `summary.droppedFields`.
 *
 * 2. Strips `_id` from each `expenses[]` line item, matching the new
 *    `expenseItemSchema`'s `{ _id: false }`. Cosmetic/consistency only.
 *
 * 3. Trims the string fields the schema declares `trim: true` on
 *    (ecNumber, expenseClaim.from/to, expenseChargedTo, accountCode,
 *    expenseReason, dayOfDeparture, dayOfReturn) — matters because raw
 *    driver writes skip Mongoose's trim-on-save.
 *
 * 4. Backfills missing `comments[]` subdocument fields (edited, deleted,
 *    createdAt, updatedAt), same as the AdvanceRequest/ConceptNote
 *    migrations. (Your sample doc's comments array is empty, but other
 *    documents in the collection may have populated comments missing
 *    these fields.)
 *
 * 5. Flags (does NOT fabricate) documents missing `ecNumber`. Same issue
 *    as `arNumber` (AdvanceRequest) and `cnNumber` (ConceptNote): the
 *    schema declares `unique: true` WITHOUT `sparse: true`, and this
 *    sample document — despite being `approved` — has no ecNumber at all.
 *    If more than one document lacks a value, MongoDB indexes them all as
 *    `null` and (re)building the unique index throws E11000. Recommended
 *    fix: add `sparse: true` next to `unique: true` on `ecNumber`.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the ecNumber-generating pre-save
 *   hook or schema validation during a bulk backfill.
 *
 * USAGE
 *   import { migrateExpenseClaims } from './migrate-expenseclaims-schema';
 *   await migrateExpenseClaims({ dryRun: true });   // inspect first
 *   await migrateExpenseClaims({ dryRun: false });  // then apply
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
  missingEcNumber: unknown[];
}

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'ecNumber',
  'expenseClaim',
  'expenseChargedTo',
  'accountCode',
  'project',
  'budget',
  'amountInWords',
  'expenseReason',
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
  'ecNumber',
  'expenseChargedTo',
  'accountCode',
  'expenseReason',
  'dayOfDeparture',
  'dayOfReturn',
];

function stripSubdocIds(arr: any[]): { result: any[]; changed: boolean } {
  let changed = false;
  const result = arr.map((item) => {
    if (item && typeof item === 'object' && '_id' in item) {
      const { _id, ...rest } = item;
      changed = true;
      return rest;
    }
    return item;
  });
  return { result, changed };
}

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
    const { result, changed } = stripSubdocIds(doc.expenses);
    if (changed) $set.expenses = result;
  }

  // 3. Trim string fields
  for (const field of TRIM_FIELDS) {
    const value = doc[field];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== value) $set[field] = trimmed;
    }
  }
  if (doc.expenseClaim && typeof doc.expenseClaim === 'object') {
    const from = typeof doc.expenseClaim.from === 'string' ? doc.expenseClaim.from.trim() : doc.expenseClaim.from;
    const to = typeof doc.expenseClaim.to === 'string' ? doc.expenseClaim.to.trim() : doc.expenseClaim.to;
    if (from !== doc.expenseClaim.from || to !== doc.expenseClaim.to) {
      $set.expenseClaim = { ...doc.expenseClaim, from, to };
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

  // 5. Flag missing ecNumber (informational only — see header comment)
  if (doc.ecNumber === undefined || doc.ecNumber === null || doc.ecNumber === '') {
    summary.missingEcNumber.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateExpenseClaims(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('expenseclaims');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    missingEcNumber: [],
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
    `[migrateExpenseClaims] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateExpenseClaims] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.missingEcNumber.length) {
    console.warn(
      `[migrateExpenseClaims] ${summary.missingEcNumber.length} document(s) have no ecNumber. ` +
        `The new schema's ecNumber is unique but NOT sparse — if this count is > 1, building/rebuilding ` +
        `that index will throw E11000 on duplicate nulls. Recommend adding sparse: true to the schema. _ids:`,
      summary.missingEcNumber,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateExpenseClaims] Errors:', summary.errors);
  }

  return summary;
}

   async function main() {
     await mongoose.connect(env.MONGODB_URI!);
     const dry = await migrateExpenseClaims({ dryRun: true });
    console.log(dry.droppedFields, dry.missingEcNumber);
    await migrateExpenseClaims({ dryRun: false });
    await mongoose.disconnect();
  }
