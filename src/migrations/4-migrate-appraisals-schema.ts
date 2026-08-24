/**
 * migrate-appraisals-schema.ts
 *
 * Migrates documents in the `appraisals` collection to match the new
 * schema in Appraisal.model.ts (+ shared comment.schema.ts).
 *
 * WHAT IT DOES
 *
 * 1. Strips any top-level field not declared in the new schema. In
 *    practice this mainly targets `staffName`, `position`, and
 *    `supervisorName` — the schema explicitly documents these as
 *    NOT stored (derive from the populated staffId/supervisorId instead,
 *    since a stored snapshot goes stale). Every removed key/value is
 *    logged per document in `summary.droppedFields` before being unset —
 *    check that before trusting the deletion, in case any of that data
 *    (e.g. a name at time-of-appraisal) actually needs preserving
 *    somewhere else first.
 *
 * 2. Strips `_id` from each `objectives[]` and `performanceAreas[]`
 *    subdocument, matching the new schema's `{ _id: false }` on both
 *    sub-schemas. Purely cosmetic/consistency — Mongoose ignores extra
 *    _ids on read, this just keeps stored shape matching declared shape.
 *
 * 3. Fixes `appraisalCode`. The new schema has `unique: true, sparse: true`
 *    with `default: ''`. Sparse indexes only exclude documents where the
 *    field is genuinely MISSING from the uniqueness constraint — an empty
 *    string is still an indexed value, so two documents both stored with
 *    `appraisalCode: ''` will throw E11000. This script unsets the field
 *    entirely wherever it's `''`, so the sparse index actually does its job.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the appraisalCode-generating and
 *   score-recomputing pre-save hooks during a bulk backfill.
 *
 * USAGE
 *   import { migrateAppraisals } from './migrate-appraisals-schema';
 *   await migrateAppraisals({ dryRun: true });   // inspect first
 *   await migrateAppraisals({ dryRun: false });  // then apply
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
  emptyAppraisalCodesCleared: unknown[]; // _ids where '' was unset
}

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'appraisalCode',
  'staffId',
  'department',
  'lengthOfTimeInPosition',
  'appraisalPeriod',
  'dateOfAppraisal',
  'supervisorId',
  'lengthOfTimeSupervised',
  'supervisorStatus',
  'objectives',
  'safeguarding',
  'performanceAreas',
  'supervisorComments',
  'overallRating',
  'futureGoals',
  'signatures',
  'scores',
  'comments',
  'createdBy',
  'staffStrategy',
  'status',
  'approvedBy',
  'copiedTo',
  'submittedByEmployee',
  'submittedBySupervisor',
  'completedAt',
  'pdfUrl',
  'cloudinaryId',
  'createdAt',
  'updatedAt',
  '__v',
]);

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

  // 1. Strip fields not in the new schema (staffName, position, supervisorName, etc.)
  for (const key of Object.keys(doc)) {
    if (!ALLOWED_FIELDS.has(key)) {
      summary.droppedFields.push({ _id: doc._id, field: key, value: doc[key] });
      $unset[key] = '';
    }
  }

  // 2. Strip _id from objectives[] / performanceAreas[] subdocuments
  if (Array.isArray(doc.objectives)) {
    const { result, changed } = stripSubdocIds(doc.objectives);
    if (changed) $set.objectives = result;
  }
  if (Array.isArray(doc.performanceAreas)) {
    const { result, changed } = stripSubdocIds(doc.performanceAreas);
    if (changed) $set.performanceAreas = result;
  }

  // 3. Fix appraisalCode: '' -> genuinely absent, so the sparse unique index works
  if (doc.appraisalCode === '') {
    $unset.appraisalCode = '';
    summary.emptyAppraisalCodesCleared.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateAppraisals(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('appraisals');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    emptyAppraisalCodesCleared: [],
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
    `[migrateAppraisals] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateAppraisals] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.emptyAppraisalCodesCleared.length) {
    console.warn(
      `[migrateAppraisals] ${summary.emptyAppraisalCodesCleared.length} document(s) had appraisalCode: '' unset ` +
        `so the sparse unique index won't collide on empty strings:`,
      summary.emptyAppraisalCodesCleared,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateAppraisals] Errors:', summary.errors);
  }

  return summary;
}

   async function main() {
     await mongoose.connect(env.MONGODB_URI!);
     const dry = await migrateAppraisals({ dryRun: true });
     console.log(dry.droppedFields, dry.emptyAppraisalCodesCleared);
     await migrateAppraisals({ dryRun: false });
     await mongoose.disconnect();
   }
