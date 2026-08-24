/**
 * migrate-leaves-schema.ts
 *
 * Migrates documents in the `leaves` collection to match the new schema
 * in Leave.model.ts (+ shared comment.schema.ts).
 *
 * WHAT IT DOES
 *
 * 1. Renames:
 *      staff_name -> staffName
 *      staff_role -> staffRole
 *
 * 2. Drops any top-level field with no equivalent in the new schema.
 *    In practice this is `reviewedBy` — it's on old documents but does
 *    not appear anywhere in the new ILeave interface or schema, so the
 *    review step for leave requests appears to have been removed from
 *    the workflow. Every dropped key/value is logged in
 *    `summary.droppedFields` before being unset, in case that data (who
 *    reviewed a past leave request) needs preserving somewhere else
 *    first — this script doesn't assume it's safe to just discard.
 *
 * 3. Backfills missing `comments[]` subdocument fields (edited, deleted,
 *    createdAt, updatedAt), same as the other collections with a
 *    commentSchema array. (Your sample's comments array is empty, but
 *    other documents in the collection may have populated comments
 *    missing these fields.)
 *
 * 4. Flags (does not fabricate) documents missing `leaveNumber`. Same
 *    class of issue as arNumber/cnNumber/ecNumber/grdCode in the other
 *    collections: `leaveNumber` is `unique: true` WITHOUT `sparse: true`,
 *    so more than one document lacking a value will throw E11000 on
 *    index (re)build. Recommend adding `sparse: true` if this turns up
 *    more than one affected document.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the leaveNumber-generating
 *   pre-save hook during a bulk backfill.
 *
 * USAGE
 *   import { migrateLeaves } from './migrate-leaves-schema';
 *   await migrateLeaves({ dryRun: true });   // inspect first
 *   await migrateLeaves({ dryRun: false });  // then apply
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
  missingLeaveNumber: unknown[];
}

const FIELD_RENAMES: Record<string, string> = {
  staff_name: 'staffName',
  staff_role: 'staffRole',
};

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'leaveNumber',
  'user',
  'staffName',
  'staffRole',
  'leaveType',
  'leaveTypeConfig',
  'startDate',
  'endDate',
  'totalDaysApplied',
  'leaveBalanceAtApplication',
  'amountAccruedLeave',
  'createdBy',
  'approvedBy',
  'status',
  'comments',
  'copiedTo',
  'leaveCover',
  'reasonForLeave',
  'contactDuringLeave',
  'isDeleted',
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

  // 1. Renames
  for (const [oldKey, newKey] of Object.entries(FIELD_RENAMES)) {
    if (doc[oldKey] !== undefined) {
      if (doc[newKey] === undefined) $set[newKey] = doc[oldKey];
      $unset[oldKey] = '';
    }
  }

  // 2. Drop any remaining stray field not covered by a rename and not
  //    recognized by the new schema (e.g. reviewedBy)
  for (const key of Object.keys(doc)) {
    if (key in FIELD_RENAMES) continue; // already handled above
    if (!ALLOWED_FIELDS.has(key)) {
      summary.droppedFields.push({ _id: doc._id, field: key, value: doc[key] });
      $unset[key] = '';
    }
  }

  const effective = (field: string) => ($set[field] !== undefined ? $set[field] : doc[field]);

  // 3. Backfill comment subdocument defaults
  const comments = effective('comments');
  if (Array.isArray(comments) && comments.length > 0) {
    let changed = false;
    const fallbackCreatedAt = doc.createdAt ?? new Date();
    const fallbackUpdatedAt = doc.updatedAt ?? fallbackCreatedAt;

    const newComments = comments.map((c: Record<string, any>) => {
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

  // 4. Flag missing leaveNumber (informational only — see header comment)
  const leaveNumber = effective('leaveNumber');
  if (leaveNumber === undefined || leaveNumber === null || leaveNumber === '') {
    summary.missingLeaveNumber.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateLeaves(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('leaves');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    missingLeaveNumber: [],
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
    `[migrateLeaves] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateLeaves] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.missingLeaveNumber.length) {
    console.warn(
      `[migrateLeaves] ${summary.missingLeaveNumber.length} document(s) have no leaveNumber. ` +
        `leaveNumber is unique WITHOUT sparse — if this count is > 1, building/rebuilding that index will ` +
        `throw E11000 on duplicate nulls. Recommend adding sparse: true. _ids:`,
      summary.missingLeaveNumber,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateLeaves] Errors:', summary.errors);
  }

  return summary;
}


  async function main() {
    await mongoose.connect(env.MONGODB_URI!);
    const dry = await migrateLeaves({ dryRun: true });
    console.log(dry.droppedFields, dry.missingLeaveNumber);
    await migrateLeaves({ dryRun: false });
    await mongoose.disconnect();
  }
