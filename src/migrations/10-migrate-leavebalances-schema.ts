/**
 * migrate-leavebalances-schema.ts
 *
 * The sample document you provided already matches LeaveBalance.model.ts
 * field-for-field — no renames needed. This script is therefore a
 * defensive backfill rather than a structural migration: it makes sure
 * EVERY document in the collection actually has the full shape the
 * sample implies, since (as seen with the goodsreceiveds/leaves
 * collections) a single representative sample doesn't guarantee every
 * document in a collection is equally complete — older or partially
 * written records may be missing a leave-type sub-object entirely, or
 * missing individual fields within one.
 *
 * WHAT IT DOES
 *
 * 1. For each of the 8 leave-type keys (annualLeave, compassionateLeave,
 *    sickLeave, maternityLeave, paternityLeave, emergencyLeave,
 *    studyLeave, leaveWithoutPay):
 *      - If the sub-object is missing entirely, creates it with the same
 *        defaults the schema itself declares (maxDays from the type's
 *        configured max, totalApplied: 0, accrued: 0, balance: maxDays,
 *        year: current year).
 *      - If the sub-object exists but is missing individual fields
 *        (maxDays / totalApplied / accrued / balance / year), backfills
 *        just those fields with the same defaults, leaving any existing
 *        values untouched.
 *
 * 2. Backfills `lastResetYear` with the current year if missing.
 *
 * 3. Drops any top-level field not recognized by the new schema (none
 *    expected given your sample, but included for the same reason as #1
 *    — other documents may differ).
 *
 * 4. Does NOT touch `user` — it's required and unique on every document
 *    you'd expect to find here, so there's nothing to backfill. A
 *    separate helper, `findDuplicateUsers()`, is provided to check for
 *    pre-existing duplicate `user` values before you rely on the unique
 *    index (relevant if the index was added after some data already
 *    existed, i.e. before this schema/index was introduced).
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db).
 *
 * USAGE
 *   import { migrateLeaveBalances, findDuplicateUsers } from './migrate-leavebalances-schema';
 *   await migrateLeaveBalances({ dryRun: true });   // inspect first
 *   await migrateLeaveBalances({ dryRun: false });  // then apply
 *   await findDuplicateUsers();                     // before trusting the unique index
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

interface BackfilledLeaveType {
  _id: unknown;
  leaveType: string;
  fieldsBackfilled: string[];
}

interface MigrationSummary {
  scanned: number;
  matched: number;
  modified: number;
  skipped: number;
  errors: { _id: unknown; error: string }[];
  droppedFields: DroppedField[];
  backfilledLeaveTypes: BackfilledLeaveType[];
}

const LEAVE_TYPES: Record<string, number> = {
  annualLeave: 24,
  compassionateLeave: 10,
  sickLeave: 12,
  maternityLeave: 90,
  paternityLeave: 14,
  emergencyLeave: 5,
  studyLeave: 10,
  leaveWithoutPay: 365,
};

const ALLOWED_FIELDS = new Set([
  '_id',
  'user',
  ...Object.keys(LEAVE_TYPES),
  'lastResetYear',
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
  const currentYear = new Date().getFullYear();

  // 1. Ensure each leave-type sub-object is complete
  for (const [leaveType, maxDays] of Object.entries(LEAVE_TYPES)) {
    const existing = doc[leaveType];
    const defaults = { maxDays, totalApplied: 0, accrued: 0, balance: maxDays, year: currentYear };

    if (existing === undefined || existing === null || typeof existing !== 'object') {
      $set[leaveType] = defaults;
      summary.backfilledLeaveTypes.push({
        _id: doc._id,
        leaveType,
        fieldsBackfilled: ['(entire sub-object was missing)'],
      });
      continue;
    }

    const fieldsBackfilled: string[] = [];
    const merged = { ...existing };
    for (const [field, defaultValue] of Object.entries(defaults)) {
      if (merged[field] === undefined) {
        merged[field] = defaultValue;
        fieldsBackfilled.push(field);
      }
    }
    if (fieldsBackfilled.length) {
      $set[leaveType] = merged;
      summary.backfilledLeaveTypes.push({ _id: doc._id, leaveType, fieldsBackfilled });
    }
  }

  // 2. lastResetYear default
  if (doc.lastResetYear === undefined) {
    $set.lastResetYear = currentYear;
  }

  // 3. Drop stray top-level fields
  for (const key of Object.keys(doc)) {
    if (!ALLOWED_FIELDS.has(key)) {
      summary.droppedFields.push({ _id: doc._id, field: key, value: doc[key] });
      $unset[key] = '';
    }
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateLeaveBalances(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('leavebalances');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    backfilledLeaveTypes: [],
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
    `[migrateLeaveBalances] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.backfilledLeaveTypes.length) {
    console.warn(
      `[migrateLeaveBalances] ${summary.backfilledLeaveTypes.length} leave-type field/sub-object backfill(s):`,
      summary.backfilledLeaveTypes,
    );
  }
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateLeaveBalances] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateLeaveBalances] Errors:', summary.errors);
  }

  return summary;
}

/**
 * Checks for documents sharing the same `user` value before you rely on
 * the schema's `unique: true` index — only relevant if that index might
 * not have existed when some of this data was written.
 */
export async function findDuplicateUsers(): Promise<{ user: unknown; count: number; ids: unknown[] }[]> {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }
  const collection = db.collection('leavebalances');
  const dupes = await collection
    .aggregate([
      { $group: { _id: '$user', count: { $sum: 1 }, ids: { $push: '$_id' } } },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();

  const result = dupes.map((d: any) => ({ user: d._id, count: d.count, ids: d.ids }));
  if (result.length) {
    console.warn(`[findDuplicateUsers] ${result.length} user(s) with more than one leave balance document:`, result);
  } else {
    console.log('[findDuplicateUsers] No duplicates found — safe to rely on the unique index.');
  }
  return result;
}


   async function main() {
    await mongoose.connect(env.MONGODB_URI!);
     const dry = await migrateLeaveBalances({ dryRun: true });
     console.log(dry.backfilledLeaveTypes, dry.droppedFields);
    await migrateLeaveBalances({ dryRun: false });
    await findDuplicateUsers();
    await mongoose.disconnect();
   }
