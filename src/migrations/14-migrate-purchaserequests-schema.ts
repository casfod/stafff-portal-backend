/**
 * migrate-purchaserequests-schema.ts
 *
 * Migrates documents in the `purchaserequests` collection to match the new
 * schema in PurchaseRequest.model.ts (+ shared comment.schema.ts /
 * itemGroup.schema.ts).
 *
 * WHAT IT DOES
 *
 * 1. Drops any top-level field with no equivalent in the new schema. In
 *    practice this is two fields:
 *      - `requestedBy` (a plain-text name snapshot) — same pattern as
 *        staffName/requestBy in the other collections; derive from the
 *        populated `createdBy` ref instead.
 *      - `reviewedBy` (a single ObjectId) — the new schema has DELETED
 *        this field entirely (the commented-out
 *        `// reviewedBy?: mongoose.Types.ObjectId;` in the interface
 *        confirms it was a deliberate removal, not an oversight) and
 *        replaced it with a SPLIT review workflow:
 *        financeReviewBy/financeReviewStatus and
 *        procurementReviewBy/procurementReviewStatus. There is no way to
 *        tell from the old data alone whether a given `reviewedBy` was
 *        the finance reviewer or the procurement reviewer, so this
 *        script does NOT guess — it drops the field (logged in
 *        `summary.droppedFields`) rather than silently assigning it to
 *        one track or the other.
 *
 * 2. Backfills the new split-review fields to the schema's own defaults
 *    wherever they're missing: financeReviewStatus/procurementReviewStatus
 *    default to 'pending', financeReviewBy/procurementReviewBy default to
 *    null. This mirrors exactly what Mongoose would do for any document
 *    that never touches these fields — it is NOT an attempt to
 *    reconstruct history.
 *
 * 3. Flags documents where that default creates a visible inconsistency:
 *    if the document's overall `status` is already 'reviewed' or
 *    'approved' (i.e. a review clearly happened, per the dropped
 *    `reviewedBy`), but both new review-status fields now read 'pending'
 *    because we couldn't attribute the historical review to a track —
 *    these are listed in `summary.reviewStatusAmbiguous` for a manual
 *    decision (e.g. asking the business which department actually
 *    reviewed these, or just accepting the gap for pre-migration records).
 *
 * 4. Strips `_id` from each `itemGroups[]` entry — the shared
 *    `itemGroupSchema` (used here) DOES declare `{ _id: false }`, unlike
 *    PurchaseOrder's separate `poItemGroupSchema`, which does not. Don't
 *    confuse the two when reasoning about this collection vs.
 *    purchaseorders.
 *
 * 5. Backfills missing `comments[]` subdocument fields (edited, deleted,
 *    createdAt, updatedAt) — this collection uses the standard shared
 *    commentSchema, same as AdvanceRequest/ConceptNote/ExpenseClaims/
 *    Leave/PaymentRequest.
 *
 * 6. Flags (does not fabricate) documents missing `pcrNumber`. Same class
 *    of issue as the other doc-numbered collections: `pcrNumber` is
 *    `unique: true` WITHOUT `sparse: true`.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the pcrNumber-generating pre-save
 *   hook during a bulk backfill.
 *
 * USAGE
 *   import { migratePurchaseRequests } from './migrate-purchaserequests-schema';
 *   await migratePurchaseRequests({ dryRun: true });   // inspect first
 *   await migratePurchaseRequests({ dryRun: false });  // then apply
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

interface ReviewAmbiguousEntry {
  _id: unknown;
  status: string;
  droppedReviewedBy: unknown;
}

interface MigrationSummary {
  scanned: number;
  matched: number;
  modified: number;
  skipped: number;
  errors: { _id: unknown; error: string }[];
  droppedFields: DroppedField[];
  reviewStatusAmbiguous: ReviewAmbiguousEntry[];
  missingPcrNumber: unknown[];
}

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'pcrNumber',
  'department',
  'suggestedSupplier',
  'address',
  'finalDeliveryPoint',
  'city',
  'periodOfActivity',
  'activityDescription',
  'expenseChargedTo',
  'accountCode',
  'project',
  'financeReviewBy',
  'financeReviewStatus',
  'procurementReviewBy',
  'procurementReviewStatus',
  'approvedBy',
  'reviewedBy', // dropped, but still present in old docs
  'itemGroups',
  'comments',
  'copiedTo',
  'status',
  'createdBy',
  'createdAt',
  'updatedAt',
  '__v',
]);

const STATUSES_IMPLYING_REVIEW = new Set(['reviewed', 'approved']);

function buildUpdateForDoc(
  doc: Record<string, any>,
  summary: MigrationSummary,
): { $set?: Record<string, any>; $unset?: Record<string, ''> } | null {
  const $set: Record<string, any> = {};
  const $unset: Record<string, ''> = {};

  const droppedReviewedByValue = doc.reviewedBy;

  // 1. Drop stray fields not in the new schema (requestedBy, reviewedBy, etc.)
  for (const key of Object.keys(doc)) {
    if (!ALLOWED_FIELDS.has(key)) {
      summary.droppedFields.push({ _id: doc._id, field: key, value: doc[key] });
      $unset[key] = '';
    }
  }

  // 2. Backfill split-review fields to schema defaults where missing
  if (doc.financeReviewBy === undefined) $set.financeReviewBy = null;
  if (doc.financeReviewStatus === undefined) $set.financeReviewStatus = 'pending';
  if (doc.procurementReviewBy === undefined) $set.procurementReviewBy = null;
  if (doc.procurementReviewStatus === undefined) $set.procurementReviewStatus = 'pending';

  // 3. Flag status/review-track inconsistency created by dropping reviewedBy
  const effectiveFinanceStatus =
    $set.financeReviewStatus !== undefined ? $set.financeReviewStatus : doc.financeReviewStatus;
  const effectiveProcurementStatus =
    $set.procurementReviewStatus !== undefined ? $set.procurementReviewStatus : doc.procurementReviewStatus;

  if (
    typeof doc.status === 'string' &&
    STATUSES_IMPLYING_REVIEW.has(doc.status) &&
    droppedReviewedByValue !== undefined &&
    effectiveFinanceStatus === 'pending' &&
    effectiveProcurementStatus === 'pending'
  ) {
    summary.reviewStatusAmbiguous.push({
      _id: doc._id,
      status: doc.status,
      droppedReviewedBy: droppedReviewedByValue,
    });
  }

  // 4. Strip _id from itemGroups[] entries (shared itemGroupSchema uses _id: false)
  if (Array.isArray(doc.itemGroups)) {
    let changed = false;
    const newItemGroups = doc.itemGroups.map((item: Record<string, any>) => {
      if (item && typeof item === 'object' && '_id' in item) {
        const { _id, ...rest } = item;
        changed = true;
        return rest;
      }
      return item;
    });
    if (changed) $set.itemGroups = newItemGroups;
  }

  // 5. Backfill comment subdocument defaults
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

  // 6. Flag missing pcrNumber (informational only — see header comment)
  if (doc.pcrNumber === undefined || doc.pcrNumber === null || doc.pcrNumber === '') {
    summary.missingPcrNumber.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migratePurchaseRequests(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('purchaserequests');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    reviewStatusAmbiguous: [],
    missingPcrNumber: [],
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
    `[migratePurchaseRequests] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migratePurchaseRequests] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.reviewStatusAmbiguous.length) {
    console.warn(
      `[migratePurchaseRequests] ${summary.reviewStatusAmbiguous.length} document(s) had status implying a review ` +
        `already happened, but the old reviewedBy couldn't be attributed to finance vs. procurement, so both new ` +
        `review-status fields now read 'pending'. Needs a manual decision:`,
      summary.reviewStatusAmbiguous,
    );
  }
  if (summary.missingPcrNumber.length) {
    console.warn(
      `[migratePurchaseRequests] ${summary.missingPcrNumber.length} document(s) have no pcrNumber. ` +
        `pcrNumber is unique WITHOUT sparse — if this count is > 1, building/rebuilding that index will ` +
        `throw E11000 on duplicate nulls. Recommend adding sparse: true. _ids:`,
      summary.missingPcrNumber,
    );
  }
  if (summary.errors.length) {
    console.error('[migratePurchaseRequests] Errors:', summary.errors);
  }

  return summary;
}

   async function main() {
     await mongoose.connect(env.MONGODB_URI!);
     const dry = await migratePurchaseRequests({ dryRun: true });
     console.log(dry.droppedFields, dry.reviewStatusAmbiguous, dry.missingPcrNumber);
     await migratePurchaseRequests({ dryRun: false });
     await mongoose.disconnect();
   }
