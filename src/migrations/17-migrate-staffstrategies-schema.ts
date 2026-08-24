/**
 * migrate-staffstrategies-schema.ts
 *
 * Migrates documents in the `staffstrategies` collection to match the new
 * schema in StaffStrategy.model.ts (+ shared comment.schema.ts).
 *
 * WHAT IT DOES
 *
 * 1. Drops any top-level field with no equivalent in the new schema. In
 *    practice this is two fields, both explicitly called out as
 *    deliberate removals in the model's own comments:
 *      - `jobTitle` — derive from the populated `staffId` instead of
 *        storing a snapshot.
 *      - `supervisor` — the old `supervisor` (string) / `supervisorId`
 *        (ObjectId) pair was, per the model comment, "dead, misleading
 *        duplication" that was never actually written on create; the
 *        single `approvedBy` ref is what's actually used. Your sample
 *        confirms this: `supervisor: ''` while `approvedBy` holds the
 *        real reference.
 *    Every dropped key/value is logged in `summary.droppedFields`.
 *
 * 2. Strips `_id` from BOTH levels of the nested structure:
 *      - each `accountabilityAreas[]` entry (accountabilityAreaSchema
 *        declares `{ _id: false }`)
 *      - each `objectives[]` entry WITHIN each accountability area
 *        (objectiveSchema also declares `{ _id: false }`)
 *    Your sample has `_id` on both levels, so both need handling —
 *    this isn't just a single flat array like the other collections.
 *
 * 3. Backfills missing `comments[]` subdocument fields (edited, deleted,
 *    createdAt, updatedAt), same as the other collections using the
 *    shared commentSchema. (Your sample's comment is already fully
 *    populated, but other documents may not be.)
 *
 * 4. Fixes `strategyCode`: the schema has `default: '', unique: true,
 *    sparse: true`. Sparse only excludes genuinely MISSING values — an
 *    empty string is still indexed, so two documents both stored with
 *    `strategyCode: ''` will throw E11000. This unsets the field
 *    wherever it's `''`, same fix as appraisalCode/rfqCode.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the strategyCode-generating
 *   pre-save hook during a bulk backfill.
 *
 * USAGE
 *   import { migrateStaffStrategies } from './migrate-staffstrategies-schema';
 *   await migrateStaffStrategies({ dryRun: true });   // inspect first
 *   await migrateStaffStrategies({ dryRun: false });  // then apply
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
  emptyStrategyCodesCleared: unknown[];
}

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'strategyCode',
  'staffId',
  'department',
  'date',
  'period',
  'accountabilityAreas',
  'comments',
  'createdBy',
  'status',
  'approvedBy',
  'copiedTo',
  'pdfUrl',
  'cloudinaryId',
  'createdAt',
  'updatedAt',
  '__v',
]);

function stripId<T extends Record<string, any>>(obj: T): { result: Omit<T, '_id'>; changed: boolean } {
  if (obj && typeof obj === 'object' && '_id' in obj) {
    const { _id, ...rest } = obj;
    return { result: rest as Omit<T, '_id'>, changed: true };
  }
  return { result: obj, changed: false };
}

function buildUpdateForDoc(
  doc: Record<string, any>,
  summary: MigrationSummary,
): { $set?: Record<string, any>; $unset?: Record<string, ''> } | null {
  const $set: Record<string, any> = {};
  const $unset: Record<string, ''> = {};

  // 1. Drop stray fields not in the new schema (jobTitle, supervisor, etc.)
  for (const key of Object.keys(doc)) {
    if (!ALLOWED_FIELDS.has(key)) {
      summary.droppedFields.push({ _id: doc._id, field: key, value: doc[key] });
      $unset[key] = '';
    }
  }

  // 2. Strip _id from accountabilityAreas[] AND nested objectives[]
  if (Array.isArray(doc.accountabilityAreas)) {
    let changed = false;
    const newAreas = doc.accountabilityAreas.map((area: Record<string, any>) => {
      const { result: areaWithoutId, changed: areaChanged } = stripId(area);
      if (areaChanged) changed = true;

      let newObjectives = areaWithoutId.objectives;
      if (Array.isArray(areaWithoutId.objectives)) {
        let objectivesChanged = false;
        newObjectives = areaWithoutId.objectives.map((obj: Record<string, any>) => {
          const { result: objWithoutId, changed: objChanged } = stripId(obj);
          if (objChanged) objectivesChanged = true;
          return objWithoutId;
        });
        if (objectivesChanged) changed = true;
      }

      return { ...areaWithoutId, objectives: newObjectives };
    });
    if (changed) $set.accountabilityAreas = newAreas;
  }

  // 3. Backfill comment subdocument defaults
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

  // 4. Fix empty-string strategyCode so the sparse index behaves correctly
  const effectiveStrategyCode = $set.strategyCode !== undefined ? $set.strategyCode : doc.strategyCode;
  if (effectiveStrategyCode === '') {
    $unset.strategyCode = '';
    delete $set.strategyCode;
    summary.emptyStrategyCodesCleared.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateStaffStrategies(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('staffstrategies');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    emptyStrategyCodesCleared: [],
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
    `[migrateStaffStrategies] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateStaffStrategies] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.emptyStrategyCodesCleared.length) {
    console.warn(
      `[migrateStaffStrategies] ${summary.emptyStrategyCodesCleared.length} document(s) had strategyCode: '' unset ` +
        `so the sparse unique index won't collide on empty strings:`,
      summary.emptyStrategyCodesCleared,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateStaffStrategies] Errors:', summary.errors);
  }

  return summary;
}


   async function main() {
     await mongoose.connect(env.MONGODB_URI!);
     const dry = await migrateStaffStrategies({ dryRun: true });
     console.log(dry.droppedFields, dry.emptyStrategyCodesCleared);
     await migrateStaffStrategies({ dryRun: false });
     await mongoose.disconnect();
   }
