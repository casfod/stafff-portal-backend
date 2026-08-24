/**
 * migrate-paymentvouchers-schema.ts
 *
 * Migrates documents in the `paymentvouchers` collection to match the new
 * schema in PaymentVoucher.model.ts.
 *
 * Field names in your sample already match the new schema exactly — no
 * renames needed. What this script handles:
 *
 * 1. Drops any top-level field with no equivalent in the new schema
 *    (none expected from your sample, included defensively — as seen
 *    with other collections, one sample document doesn't guarantee every
 *    document in the collection is equally clean).
 *
 * 2. Strips `_id` from each `comments[]` entry. NOTE: unlike the other
 *    collections you've migrated, PaymentVoucher does NOT use the shared
 *    commentSchema (which has edited/deleted/createdAt/updatedAt) — it
 *    defines its own inline shape: `{ user, text, _id: false }`. So there
 *    is no defaults-backfill step here; only the stray `_id` (if present
 *    on any legacy comment) needs removing to match `_id: false`.
 *
 * 3. Trims the string fields the schema declares `trim: true` on
 *    (pvNumber, payingStation, payTo, being, pvDate, amountInWords,
 *    accountCode, projectCode, project, chartOfAccountCategories,
 *    organisationalChartOfAccount, chartOfAccountCode) — matters because
 *    raw driver writes skip Mongoose's trim-on-save.
 *
 * 4. Flags (does not fabricate) documents missing `pvNumber`. Same class
 *    of issue as arNumber/cnNumber/ecNumber/leaveNumber/pmrNumber in the
 *    other collections: `pvNumber` is `unique: true` WITHOUT
 *    `sparse: true`. Your sample document does have one, but if any
 *    other documents don't, more than one missing value will throw
 *    E11000 on index (re)build. Recommend adding `sparse: true` if this
 *    turns up any hits.
 *
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the pvNumber-generating pre-save
 *   hook during a bulk backfill.
 *
 * USAGE
 *   import { migratePaymentVouchers } from './migrate-paymentvouchers-schema';
 *   await migratePaymentVouchers({ dryRun: true });   // inspect first
 *   await migratePaymentVouchers({ dryRun: false });  // then apply
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
  missingPvNumber: unknown[];
}

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'pvNumber',
  'payingStation',
  'payTo',
  'being',
  'pvDate',
  'amountInWords',
  'accountCode',
  'projectCode',
  'project',
  'grossAmount',
  'vat',
  'wht',
  'devLevy',
  'otherDeductions',
  'netAmount',
  'chartOfAccountCategories',
  'organisationalChartOfAccount',
  'chartOfAccountCode',
  'note',
  'createdBy',
  'reviewedBy',
  'approvedBy',
  'comments',
  'copiedTo',
  'status',
  'createdAt',
  'updatedAt',
  '__v',
]);

const TRIM_FIELDS = [
  'pvNumber',
  'payingStation',
  'payTo',
  'being',
  'pvDate',
  'amountInWords',
  'accountCode',
  'projectCode',
  'project',
  'chartOfAccountCategories',
  'organisationalChartOfAccount',
  'chartOfAccountCode',
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

  // 2. Strip _id from comments[] entries (inline schema uses _id: false)
  if (Array.isArray(doc.comments) && doc.comments.length > 0) {
    let changed = false;
    const newComments = doc.comments.map((c: Record<string, any>) => {
      if (c && typeof c === 'object' && '_id' in c) {
        const { _id, ...rest } = c;
        changed = true;
        return rest;
      }
      return c;
    });
    if (changed) $set.comments = newComments;
  }

  // 3. Trim string fields
  for (const field of TRIM_FIELDS) {
    const value = doc[field];
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== value) $set[field] = trimmed;
    }
  }

  // 4. Flag missing pvNumber (informational only — see header comment)
  const effectivePvNumber = $set.pvNumber !== undefined ? $set.pvNumber : doc.pvNumber;
  if (effectivePvNumber === undefined || effectivePvNumber === null || effectivePvNumber === '') {
    summary.missingPvNumber.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migratePaymentVouchers(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('paymentvouchers');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    missingPvNumber: [],
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
    `[migratePaymentVouchers] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migratePaymentVouchers] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.missingPvNumber.length) {
    console.warn(
      `[migratePaymentVouchers] ${summary.missingPvNumber.length} document(s) have no pvNumber. ` +
        `pvNumber is unique WITHOUT sparse — if this count is > 1, building/rebuilding that index will ` +
        `throw E11000 on duplicate nulls. Recommend adding sparse: true. _ids:`,
      summary.missingPvNumber,
    );
  }
  if (summary.errors.length) {
    console.error('[migratePaymentVouchers] Errors:', summary.errors);
  }

  return summary;
}


   async function main() {
     await mongoose.connect(env.MONGODB_URI!);
     const dry = await migratePaymentVouchers({ dryRun: true });
     console.log(dry.droppedFields, dry.missingPvNumber);
     await migratePaymentVouchers({ dryRun: false });
     await mongoose.disconnect();
   }
