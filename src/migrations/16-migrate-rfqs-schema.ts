/**
 * migrate-rfqs-schema.ts
 *
 * Migrates documents in the `rfqs` collection to match the new schema in
 * RFQ.model.ts.
 *
 * WHAT IT DOES
 *
 * 1. Renames:
 *      RFQTitle -> rfqTitle
 *      RFQCode  -> rfqCode
 *    `casfodAddressId` is left untouched — unlike PurchaseOrder, IRFQ
 *    keeps this exact field name (no jdpiAddressId equivalent here).
 *
 * 2. Strips `_id` from each `itemGroups[]` entry. NOTE: this is the
 *    OPPOSITE of PurchaseOrder — `rfqItemGroupSchema` here DOES declare
 *    `{ _id: false }` (PurchaseOrder's separate `poItemGroupSchema` does
 *    not). Don't carry the PurchaseOrder assumption over to this
 *    collection.
 *
 * 3. Trims `description` / `itemName` within each `itemGroups[]` entry —
 *    declared `trim: true` in the schema, which raw driver writes skip.
 *
 * 4. Flags (does not fabricate) documents with a missing or empty
 *    `rfqCode`.
 *
 * 5. Drops any top-level field with no equivalent in the new schema
 *    (none expected from your sample, included defensively).
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere.
 * - Runs against the raw collection (mongoose.connection.db), not the
 *   Mongoose model, to avoid triggering the rfqCode-generating pre-save
 *   hook during a bulk backfill.
 *
 * USAGE
 *   import { migrateRFQs } from './migrate-rfqs-schema';
 *   await migrateRFQs({ dryRun: true });   // inspect first
 *   await migrateRFQs({ dryRun: false });  // then apply
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
  emptyOrMissingRfqCode: unknown[];
}

const FIELD_RENAMES: Record<string, string> = {
  RFQTitle: 'rfqTitle',
  RFQCode: 'rfqCode',
};

// Every field the new schema actually declares (plus Mongo/Mongoose-managed ones).
const ALLOWED_FIELDS = new Set([
  '_id',
  'rfqTitle',
  'rfqCode',
  'itemGroups',
  'copiedTo',
  'deadlineDate',
  'rfqDate',
  'casfodAddressId',
  'pdfUrl',
  'cloudinaryId',
  'createdBy',
  'status',
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

  // 5. Drop any remaining stray field not covered by a rename and not
  //    recognized by the new schema
  for (const key of Object.keys(doc)) {
    if (key in FIELD_RENAMES) continue; // already handled above
    if (!ALLOWED_FIELDS.has(key)) {
      summary.droppedFields.push({ _id: doc._id, field: key, value: doc[key] });
      $unset[key] = '';
    }
  }

  const effective = (field: string) => ($set[field] !== undefined ? $set[field] : doc[field]);

  // 2 & 3. Strip _id, trim description/itemName in itemGroups[]
  const itemGroups = effective('itemGroups');
  if (Array.isArray(itemGroups)) {
    let changed = false;
    const newItemGroups = itemGroups.map((item: Record<string, any>) => {
      let updated = { ...item };
      if ('_id' in updated) {
        const { _id, ...rest } = updated;
        updated = rest;
        changed = true;
      }
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

  // 4. Flag missing/empty rfqCode (informational only — see header comment)
  const effectiveRfqCode = effective('rfqCode');
  if (effectiveRfqCode === undefined || effectiveRfqCode === null || effectiveRfqCode === '') {
    summary.emptyOrMissingRfqCode.push(doc._id);
  }

  const hasSet = Object.keys($set).length > 0;
  const hasUnset = Object.keys($unset).length > 0;
  if (!hasSet && !hasUnset) return null;

  const update: { $set?: Record<string, any>; $unset?: Record<string, ''> } = {};
  if (hasSet) update.$set = $set;
  if (hasUnset) update.$unset = $unset;
  return update;
}

export async function migrateRFQs(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('rfqs');
  if (!dryRun) {
    const indexes = await collection.listIndexes().toArray();
    const legacyCodeIndexes = indexes.filter((index) => {
      const keys = Object.keys(index.key ?? {});
      return index.unique === true && keys.length === 1 && index.key?.RFQCode === 1;
    });

    for (const index of legacyCodeIndexes) {
      if (index.name) {
        await collection.dropIndex(index.name);
        console.log(`[migrateRFQs] Dropped legacy index ${index.name}`);
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
    emptyOrMissingRfqCode: [],
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
    `[migrateRFQs] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.droppedFields.length) {
    console.warn(
      `[migrateRFQs] ${summary.droppedFields.length} legacy field value(s) removed (not part of new schema):`,
      summary.droppedFields,
    );
  }
  if (summary.emptyOrMissingRfqCode.length) {
    console.warn(
      `[migrateRFQs] ${summary.emptyOrMissingRfqCode.length} document(s) have no rfqCode (or an empty string). ` +
        `verify that this is expected before relying on generated document numbers. _ids:`,
      summary.emptyOrMissingRfqCode,
    );
  }
  if (summary.errors.length) {
    console.error('[migrateRFQs] Errors:', summary.errors);
  }

  return summary;
}

async function main() {
  await mongoose.connect(env.MONGODB_URI!);
  const dryRun = process.argv.includes('--dry-run');
  const summary = await migrateRFQs({ dryRun });
  console.log(summary.droppedFields, summary.emptyOrMissingRfqCode);
  await mongoose.disconnect();
}
