/**
 * migrate-purchaseorders-schema.ts
 *
 * Migrates documents in the `purchaseorders` collection to match the new
 * schema in PurchaseOrder.model.ts.
 *
 * WHAT IT DOES
 *
 * 1. Renames:
 *      RFQTitle        -> rfqTitle
 *      RFQCode         -> rfqCode
 *      POCode          -> poCode
 *      VAT             -> vat
 *      isFromRFQ       -> isFromRfq
 *
 *
 * 2. Trims `description` / `itemName` within each `itemGroups[]` entry,
 *    and `text` within each `comments[]` entry — both declared
 *    `trim: true` in the schema, which the raw driver doesn't apply.
 *
 * 3. Strips `_id` from `comments[]` entries ONLY. IMPORTANT ASYMMETRY:
 *    unlike grnItems/expenses/objectives/performanceAreas in the other
 *    collections, `poItemGroupSchema` does NOT declare `{ _id: false }`
 *    — so `itemGroups[]` subdocuments are SUPPOSED to keep their `_id`.
 *    This script deliberately leaves itemGroups untouched on that front;
 *    only the inline comment schema (`{ user, text, _id: false }`) gets
 *    its `_id` stripped.
 *
 * 4. Fixes `rfqCode`: the schema has `default: '', sparse: true`. Sparse
 *    only excludes genuinely MISSING values from the uniqueness-adjacent
 *    behavior sparse indexes are typically paired with — an empty string
 *    is still an indexed value. This unsets `rfqCode` wherever it's `''`
 *    so the sparse index behaves as intended. Same fix as appraisalCode
 *    earlier.
 *
 * 5. Flags (does not fabricate) documents missing `poCode`. Same class of
 *    issue as arNumber/cnNumber/ecNumber/grdCode/leaveNumber/pmrNumber/
 *    pvNumber in the other collections: `poCode` is `unique: true`
 *    WITHOUT `sparse: true`, combined with `default: ''` — the same
 *    dangerous combination flagged on `grdCode`. Recommend adding
 *    `sparse: true` and reconsidering the `''` default.
 *
 * 6. Drops any top-level field with no equivalent in the new schema
 *    (none expected from your sample, included defensively).
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the poCode-generating pre-save
 *   hook during a bulk backfill.
 *
 * USAGE
 *   import { migratePurchaseOrders } from './migrate-purchaseorders-schema';
 *   await migratePurchaseOrders({ dryRun: true });   // inspect first
 *   await migratePurchaseOrders({ dryRun: false });  // then apply
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
  emptyRfqCodesCleared: unknown[];
  missingPoCode: unknown[];
}

const FIELD_RENAMES: Record<string, string> = {
  RFQTitle: 'rfqTitle',
  RFQCode: 'rfqCode',
  POCode: 'poCode',
  VAT: 'vat',
  isFromRFQ: 'isFromRfq',
};

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'rfqTitle',
  'rfqCode',
  'poCode',
  'itemGroups',
  'copiedTo',
  'selectedVendor',
  'deliveryDate',
  'poDate',
  'casfodAddressId',
  'totalAmount',
  'vat',
  'pdfUrl',
  'cloudinaryId',
  'createdBy',
  'status',
  'isFromRfq',
  'comments',
  'approvedBy',
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

  // 6. Drop any remaining stray field not covered by a rename and not
  //    recognized by the new schema
  for (const key of Object.keys(doc)) {
    if (key in FIELD_RENAMES) continue; // already handled above
    if (!ALLOWED_FIELDS.has(key)) {
      summary.droppedFields.push({ _id: doc._id, field: key, value: doc[key] });
      $unset[key] = '';
    }
  }

  const effective = (field: string) => ($set[field] !== undefined ? $set[field] : doc[field]);

  // 2 & 3. itemGroups: trim description/itemName only — _id is intentionally kept
  const itemGroups = effective('itemGroups');
  if (Array.isArray(itemGroups)) {
    let changed = false;
    const newItemGroups = itemGroups.map((item: Record<string, any>) => {
      const updated = { ...item };
      if (typeof updated.description === 'string') {
        const trimmed = updated.description.trim();
        if (trimmed !== updated.description) {
          updated.description = trimmed;
          changed = true;
        }
      }
      if (typeof updated.itemName === 'string') {
        const trimmed = updated.itemName.trim();
        if (trimmed !== updated.itemName) {
          updated.itemName = trimmed;
          changed = true;
        }
      }
      return updated;
    });
    if (changed) $set.itemGroups = newItemGroups;
  }

  // 2 & 3. comments: trim text, strip _id (inline schema uses _id: false)
  const comments = effective('comments');
  if (Array.isArray(comments) && comments.length > 0) {
    let changed = false;
    const newComments = comments.map((c: Record<string, any>) => {
      let updated = { ...c };
      if ('_id' in updated) {
        const { _id, ...rest } = updated;
        updated = rest;
        changed = true;
      }
      if (typeof updated.text === 'string') {
        const trimmed = updated.text.trim();
        if (trimmed !== updated.text) {
          updated.text = trimmed;
          changed = true;
        }
      }
      return updated;
    });
    if (changed) $set.comments = newComments;
  }

  // 4. Fix empty-string rfqCode so the sparse index behaves correctly
  const effectiveRfqCode = effective('rfqCode');
  if (effectiveRfqCode === '') {
    $unset.rfqCode = '';
    delete $set.rfqCode;
    summary.emptyRfqCodesCleared.push(doc._id);
  }

  // 5. Flag missing poCode (informational only — see header comment)
  const effectivePoCode = $unset.poCode !== undefined ? undefined : effective('poCode');
  if (effectivePoCode === undefined || effectivePoCode === null || effectivePoCode === '') {
    summary.missingPoCode.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migratePurchaseOrders(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('purchaseorders');
  if (!dryRun) {
    const indexes = await collection.listIndexes().toArray();
    const legacyCodeIndexes = indexes.filter((index) => {
      const keys = Object.keys(index.key ?? {});
      return index.unique === true && keys.length === 1 && index.key?.POCode === 1;
    });

    for (const index of legacyCodeIndexes) {
      if (index.name) {
        await collection.dropIndex(index.name);
        console.log(`[migratePurchaseOrders] Dropped legacy index ${index.name}`);
      }
    }
  }

  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
    droppedFields: [],
    emptyRfqCodesCleared: [],
    missingPoCode: [],
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
    `[migratePurchaseOrders] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migratePurchaseOrders] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.emptyRfqCodesCleared.length) {
    console.warn(
      `[migratePurchaseOrders] ${summary.emptyRfqCodesCleared.length} document(s) had rfqCode: '' unset:`,
      summary.emptyRfqCodesCleared,
    );
  }
  if (summary.missingPoCode.length) {
    console.warn(
      `[migratePurchaseOrders] ${summary.missingPoCode.length} document(s) have no poCode. ` +
        `verify that this is expected before relying on generated document numbers. _ids:`,
      summary.missingPoCode,
    );
  }
  if (summary.errors.length) {
    console.error('[migratePurchaseOrders] Errors:', summary.errors);
  }

  return summary;
}



   async function main() {
     await mongoose.connect(env.MONGODB_URI!);
     const dry = await migratePurchaseOrders({ dryRun: true });
    console.log(dry.droppedFields, dry.emptyRfqCodesCleared, dry.missingPoCode);
     await migratePurchaseOrders({ dryRun: false });
    await mongoose.disconnect();
   }   

