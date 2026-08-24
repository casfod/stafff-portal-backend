/**
 * migrate-vendors-schema.ts
 *
 * Migrates documents in the `vendors` collection to match the new schema
 * in Vendor.model.ts (+ shared comment.schema.ts).
 *
 * WHAT IT DOES
 *
 * 1. Renames:
 *      operatingLGA -> operatingLga
 *
 * 2. Drops any top-level field with no equivalent in the new schema. In
 *    practice this is `isMigrated`, which has no field in IVendor.
 *    Logged in `summary.droppedFields` before removal.
 *
 * 3. Backfills missing `comments[]` subdocument fields (edited, deleted,
 *    createdAt, updatedAt) — same as the other collections using the
 *    shared commentSchema. (Your sample's comments array is empty, but
 *    other documents may have populated comments missing these fields.)
 *
 * IMPORTANT — SCHEMA-LEVEL CONFLICT, NOT JUST A DATA ISSUE:
 * The schema's own comment states the business rule as "multiple drafts,
 * pending, or rejected vendors can share these fields — only one
 * *approved* vendor can hold each," and that's what the PARTIAL unique
 * indexes on {businessName,status}, {businessRegNumber,status}, and
 * {email,status} (scoped to status:'approved') actually enforce.
 *
 * But `businessRegNumber` and `email` ALSO carry a plain field-level
 * `unique: true` in the schema — which enforces uniqueness across the
 * ENTIRE collection regardless of status, directly contradicting that
 * documented rule. If your data already has duplicate businessRegNumber
 * or email values among non-approved vendors (which the business logic
 * explicitly says should be allowed), building/rebuilding those
 * field-level unique indexes will fail outright.
 *
 * This script does NOT attempt to resolve that contradiction — that's a
 * product decision (should ALL vendors have globally-unique reg
 * numbers/emails, or only approved ones?). It gives you
 * `findDuplicateVendorFields()` to check which duplicates actually exist
 * before you decide, and before you rely on either index.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the vendorCode-generating
 *   pre-validate/pre-save hooks during a bulk backfill.
 *
 * USAGE
 *   import { migrateVendors, findDuplicateVendorFields } from './migrate-vendors-schema';
 *   await migrateVendors({ dryRun: true });   // inspect first
 *   await migrateVendors({ dryRun: false });  // then apply
 *   await findDuplicateVendorFields();        // before trusting either index
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
}

const FIELD_RENAMES: Record<string, string> = {
  operatingLGA: 'operatingLga',
};

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'businessName',
  'businessType',
  'businessRegNumber',
  'businessState',
  'operatingLga',
  'accountNumber',
  'accountName',
  'bankName',
  'address',
  'email',
  'businessPhoneNumber',
  'contactPhoneNumber',
  'categories',
  'contactPerson',
  'createdBy',
  'position',
  'vendorCode',
  'originalVendorCode',
  'tinNumber',
  'status',
  'approvedBy',
  'comments',
  'copiedTo',
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
  //    recognized by the new schema (e.g. isMigrated)
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

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateVendors(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('vendors');
  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
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
    `[migrateVendors] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateVendors] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateVendors] Errors:', summary.errors);
  }

  return summary;
}

/**
 * Checks for duplicate businessRegNumber, email, and vendorCode values
 * ACROSS THE WHOLE COLLECTION (any status) — i.e. exactly what the
 * schema's field-level `unique: true` on those three fields would
 * enforce. Also separately reports duplicates scoped to status:'approved'
 * only, which is what the schema's PARTIAL indexes enforce and what the
 * schema comment says is actually intended.
 *
 * If the "any status" results are non-empty but the "approved only"
 * results for the same field are empty, that's the contradiction
 * described above made concrete: those documents are fine under the
 * documented business rule but will break the field-level unique index.
 */
export async function findDuplicateVendorFields(): Promise<{
  businessRegNumber: { anyStatus: any[]; approvedOnly: any[] };
  email: { anyStatus: any[]; approvedOnly: any[] };
  vendorCode: { anyStatus: any[] };
}> {
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }
  const collection = db.collection('vendors');

  const dupesFor = async (field: string, approvedOnly: boolean) => {
    const match: Record<string, any> = { [field]: { $exists: true, $ne: '' } };
    if (approvedOnly) match.status = 'approved';
    const result = await collection
      .aggregate([
        { $match: match },
        { $group: { _id: `$${field}`, count: { $sum: 1 }, ids: { $push: '$_id' } } },
        { $match: { count: { $gt: 1 } } },
      ])
      .toArray();
    return result.map((d: any) => ({ value: d._id, count: d.count, ids: d.ids }));
  };

  const result = {
    businessRegNumber: {
      anyStatus: await dupesFor('businessRegNumber', false),
      approvedOnly: await dupesFor('businessRegNumber', true),
    },
    email: {
      anyStatus: await dupesFor('email', false),
      approvedOnly: await dupesFor('email', true),
    },
    vendorCode: {
      anyStatus: await dupesFor('vendorCode', false),
    },
  };

  if (result.businessRegNumber.anyStatus.length || result.email.anyStatus.length) {
    console.warn(
      '[findDuplicateVendorFields] Duplicates found that will break the field-level unique index ' +
        '(businessRegNumber/email), even though some may be legitimate under the documented ' +
        "'only one approved vendor per field' rule:",
      result,
    );
  } else if (result.vendorCode.anyStatus.length) {
    console.warn('[findDuplicateVendorFields] Duplicate vendorCode values found:', result.vendorCode.anyStatus);
  } else {
    console.log('[findDuplicateVendorFields] No duplicates found on any checked field.');
  }

  return result;
}


  async function main() {
    await mongoose.connect(env.MONGODB_URI!);
    const dry = await migrateVendors({ dryRun: true });
    console.log(dry.droppedFields);
    await migrateVendors({ dryRun: false });
    await findDuplicateVendorFields();
    await mongoose.disconnect();
  }
