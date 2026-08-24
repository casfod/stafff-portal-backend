/**
 * migrate-conceptnotes-schema.ts
 *
 * Migrates documents in the `conceptnotes` collection to match the new
 * schema in ConceptNote.model.ts (+ shared comment.schema.ts).
 *
 * WHAT IT DOES
 *
 * 1. Renames:
 *      staff_name                    -> (dropped, no equivalent field)
 *      staff_role                    -> (dropped, no equivalent field)
 *      expense_Charged_To            -> expenseChargedTo
 *      account_Code                  -> accountCode
 *      activity_title                -> activityTitle
 *      activity_location             -> activityLocation
 *      activity_period               -> activityPeriod
 *      background_context            -> backgroundContext
 *      objectives_purpose            -> objectivesPurpose
 *      detailed_activity_description -> detailedActivityDescription
 *      strategic_plan                -> strategicPlan
 *      benefits_of_project           -> benefitsOfProject
 *      preparedBy                    -> createdBy   (semantic rename: the
 *                                                     new schema's required
 *                                                     `createdBy` ref is
 *                                                     what `preparedBy` was)
 *      activity_budget               -> activityBudget
 *      means_of_verification         -> meansOfVerification
 *
 * 2. Drops any other top-level field with no equivalent in the new schema
 *    (this generically catches `staff_name` / `staff_role`, which have no
 *    replacement — the new schema derives staff identity from the
 *    populated `createdBy` ref instead of storing a name/role snapshot).
 *    Every dropped key/value is logged in `summary.droppedFields` first.
 *
 * 3. Trims the string fields the new schema declares `trim: true` on
 *    (only matters because we're writing via the raw driver, which
 *    doesn't run Mongoose's trim on save).
 *
 * 4. Backfills missing `comments[]` subdocument fields (edited, deleted,
 *    createdAt, updatedAt) the same way as the AdvanceRequest migration —
 *    edited/deleted default to false, timestamps fall back to the parent
 *    document's own createdAt/updatedAt as a best-effort approximation.
 *
 * 5. Flags (does NOT fabricate) documents missing `cnNumber`. Like
 *    AdvanceRequest's `arNumber`, the schema declares
 *    `cnNumber: { unique: true }` WITHOUT `sparse: true`, and this sample
 *    document has no cnNumber at all despite being `approved`. If more
 *    than one document lacks a value, MongoDB will index them all as
 *    `null` and throw E11000 the moment the unique index is (re)built.
 *    Recommended fix: add `sparse: true` next to `unique: true` on
 *    `cnNumber`, same as the earlier arNumber/bankSortCode/appraisalCode
 *    fixes.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the cnNumber-generating pre-save
 *   hook or schema validation during a bulk backfill.
 *
 * USAGE
 *   import { migrateConceptNotes } from './migrate-conceptnotes-schema';
 *   await migrateConceptNotes({ dryRun: true });   // inspect first
 *   await migrateConceptNotes({ dryRun: false });  // then apply
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
  missingCnNumber: unknown[];
}

const FIELD_RENAMES: Record<string, string> = {
  expense_Charged_To: 'expenseChargedTo',
  account_Code: 'accountCode',
  activity_title: 'activityTitle',
  activity_location: 'activityLocation',
  activity_period: 'activityPeriod',
  background_context: 'backgroundContext',
  objectives_purpose: 'objectivesPurpose',
  detailed_activity_description: 'detailedActivityDescription',
  strategic_plan: 'strategicPlan',
  benefits_of_project: 'benefitsOfProject',
  preparedBy: 'createdBy',
  activity_budget: 'activityBudget',
  means_of_verification: 'meansOfVerification',
};

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
// Anything present on a doc that is NEITHER a key in FIELD_RENAMES NOR in this
// set is a stray legacy field (e.g. staff_name, staff_role) and gets dropped.
const ALLOWED_FIELDS = new Set([
  '_id',
  'cnNumber',
  'expenseChargedTo',
  'accountCode',
  'project',
  'activityTitle',
  'activityLocation',
  'activityPeriod',
  'backgroundContext',
  'objectivesPurpose',
  'detailedActivityDescription',
  'strategicPlan',
  'benefitsOfProject',
  'createdBy',
  'reviewedBy',
  'approvedBy',
  'status',
  'comments',
  'copiedTo',
  'activityBudget',
  'meansOfVerification',
  'createdAt',
  'updatedAt',
  '__v',
]);

const TRIM_FIELDS = [
  'cnNumber',
  'expenseChargedTo',
  'accountCode',
  'activityTitle',
  'activityLocation',
  'backgroundContext',
  'objectivesPurpose',
  'detailedActivityDescription',
  'strategicPlan',
  'benefitsOfProject',
  'meansOfVerification',
];

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

  // 2. Drop any remaining stray field not covered by a rename and not a
  //    field the new schema recognizes.
  for (const key of Object.keys(doc)) {
    if (key in FIELD_RENAMES) continue; // already handled above
    if (!ALLOWED_FIELDS.has(key)) {
      summary.droppedFields.push({ _id: doc._id, field: key, value: doc[key] });
      $unset[key] = '';
    }
  }

  const effective = (field: string) => ($set[field] !== undefined ? $set[field] : doc[field]);

  // 3. Trim string fields
  for (const field of TRIM_FIELDS) {
    const value = effective(field);
    if (typeof value === 'string') {
      const trimmed = value.trim();
      if (trimmed !== value) $set[field] = trimmed;
    }
  }
  const activityPeriod = effective('activityPeriod');
  if (activityPeriod && typeof activityPeriod === 'object') {
    const from = typeof activityPeriod.from === 'string' ? activityPeriod.from.trim() : activityPeriod.from;
    const to = typeof activityPeriod.to === 'string' ? activityPeriod.to.trim() : activityPeriod.to;
    if (from !== activityPeriod.from || to !== activityPeriod.to) {
      $set.activityPeriod = { ...activityPeriod, from, to };
    }
  }

  // 4. Backfill comment subdocument defaults
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

  // 5. Flag missing cnNumber (informational only — see header comment)
  const cnNumber = effective('cnNumber');
  if (cnNumber === undefined || cnNumber === null || cnNumber === '') {
    summary.missingCnNumber.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateConceptNotes(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('conceptnotes');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    missingCnNumber: [],
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
    `[migrateConceptNotes] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateConceptNotes] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.missingCnNumber.length) {
    console.warn(
      `[migrateConceptNotes] ${summary.missingCnNumber.length} document(s) have no cnNumber. ` +
        `The new schema's cnNumber is unique but NOT sparse — if this count is > 1, building/rebuilding ` +
        `that index will throw E11000 on duplicate nulls. Recommend adding sparse: true to the schema. _ids:`,
      summary.missingCnNumber,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateConceptNotes] Errors:', summary.errors);
  }

  return summary;
}

 
  async function main() {
   await mongoose.connect(env.MONGODB_URI!);
    const dry = await migrateConceptNotes({ dryRun: true });
    console.log(dry.droppedFields, dry.missingCnNumber);
     await migrateConceptNotes({ dryRun: false });
    await mongoose.disconnect();
   }
