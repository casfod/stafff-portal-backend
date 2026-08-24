/**
 * migrate-goodsreceiveds-schema.ts
 *
 * Migrates documents in the `goodsreceiveds` collection to match the new
 * schema in GoodsReceived.model.ts.
 *
 * WHAT IT DOES
 *
 * 1. Renames:
 *      GRDCode          -> grdCode
 *      GRNitems          -> grnItems
 *      GRNitems[].itemid -> grnItems[].itemId
 *
 * 2. Strips `_id` from each `grnItems[]` entry, matching the new
 *    `grnItemSchema`'s `{ _id: false }`.
 *
 * 3. Cleans up empty-string `grdCode` values (converts `''` to genuinely
 *    absent). The schema uses a sparse unique index, so documents without a
 *    code can coexist, but clearing empty strings keeps the data consistent.
 *
 * 4. Drops any top-level field with no equivalent in the new schema
 *    (none expected in your sample, but included for safety/consistency
 *    with the other migrations in case other documents carry stray
 *    fields).
 *
 * 5. Flags (does not fabricate) documents with no grdCode at all, for the
 *    same reason as #3.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the grdCode-generating and
 *   item-status pre-save hooks during a bulk backfill.
 *
 * USAGE
 *   import { migrateGoodsReceived } from './migrate-goodsreceiveds-schema';
 *   await migrateGoodsReceived({ dryRun: true });   // inspect first
 *   await migrateGoodsReceived({ dryRun: false });  // then apply
 *
 *   Running this file directly applies the migration; pass `--dry-run` to
 *   preview the changes without writing them.
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
  emptyGrdCodesCleared: unknown[];
  missingGrdCode: unknown[];
}

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'grdCode',
  'purchaseOrder',
  'grnItems',
  'createdBy',
  'isCompleted',
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

  // 1a. Rename GRDCode -> grdCode
  if (doc.GRDCode !== undefined) {
    if (doc.grdCode === undefined || doc.grdCode === null || doc.grdCode === '') {
      $set.grdCode = doc.GRDCode;
    }
    $unset.GRDCode = '';
  }

  // 1b. Rename GRNitems -> grnItems, and itemid -> itemId + strip _id per item
  const legacyItems = doc.GRNitems;
  const currentItems = doc.grnItems;
  const sourceItems = currentItems !== undefined ? currentItems : legacyItems;

  if (legacyItems !== undefined) $unset.GRNitems = '';

  if (Array.isArray(sourceItems)) {
    const needsTransform =
      legacyItems !== undefined ||
      sourceItems.some((item: any) => item && (item.itemid !== undefined || '_id' in item));

    if (needsTransform) {
      $set.grnItems = sourceItems.map((item: any) => {
        const { itemid, _id, ...rest } = item ?? {};
        return {
          ...rest,
          itemId: rest.itemId !== undefined ? rest.itemId : itemid,
        };
      });
    }
  }

  // 2. Drop stray fields not in the new schema
  for (const key of Object.keys(doc)) {
    if (key === 'GRDCode' || key === 'GRNitems') continue; // already handled above
    if (!ALLOWED_FIELDS.has(key)) {
      summary.droppedFields.push({ _id: doc._id, field: key, value: doc[key] });
      $unset[key] = '';
    }
  }

  // 3. Clean up empty-string grdCode
  const effectiveGrdCode = $set.grdCode !== undefined ? $set.grdCode : doc.grdCode;
  if (effectiveGrdCode === '') {
    $unset.grdCode = '';
    delete $set.grdCode; // don't set '' and unset it in the same update
    summary.emptyGrdCodesCleared.push(doc._id);
  }

  // 4. Flag missing grdCode (informational)
  const finalGrdCode = $unset.grdCode !== undefined ? undefined : effectiveGrdCode;
  if (finalGrdCode === undefined || finalGrdCode === null) {
    summary.missingGrdCode.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateGoodsReceived(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('goodsreceiveds');
  if (!dryRun) {
    const indexes = await collection.listIndexes().toArray();
    const legacyCodeIndexes = indexes.filter((index) => {
      const keys = Object.keys(index.key ?? {});
      return index.unique === true && keys.length === 1 && index.key?.GRDCode === 1;
    });

    for (const index of legacyCodeIndexes) {
      if (index.name) {
        await collection.dropIndex(index.name);
        console.log(`[migrateGoodsReceived] Dropped legacy index ${index.name}`);
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
    emptyGrdCodesCleared: [],
    missingGrdCode: [],
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
    `[migrateGoodsReceived] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateGoodsReceived] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.emptyGrdCodesCleared.length) {
    console.warn(
      `[migrateGoodsReceived] ${summary.emptyGrdCodesCleared.length} document(s) had grdCode: '' unset:`,
      summary.emptyGrdCodesCleared,
    );
  }
  if (summary.missingGrdCode.length) {
    console.warn(
      `[migrateGoodsReceived] ${summary.missingGrdCode.length} document(s) have no grdCode. ` +
        `verify that this is expected before relying on generated document numbers. _ids:`,
      summary.missingGrdCode,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateGoodsReceived] Errors:', summary.errors);
  }

  return summary;
}



  async function main() {
    await mongoose.connect(env.MONGODB_URI!);
    const dryRun = process.argv.includes('--dry-run');
    const summary = await migrateGoodsReceived({ dryRun });
    console.log(summary.droppedFields, summary.missingGrdCode);
    await mongoose.disconnect();
  }
