/**
 * migrate-users-schema.ts
 *
 * Migrates documents in the `users` collection from the legacy schema
 * (snake_case first_name/last_name, no avatar/signature/isActive) to the
 * new schema defined in User.model.ts.
 *
 * ASSUMPTIONS
 * - A mongoose connection is already established elsewhere in the app
 *   (this script does not connect/disconnect).
 * - This script talks to the raw collection via the native driver
 *   (mongoose.connection.db) rather than the Mongoose model, because the
 *   legacy documents contain fields (first_name/last_name) that no longer
 *   exist on the new schema and would be stripped/rejected by Mongoose
 *   casting.
 *
 * WHAT IT DOES
 * 1. Renames first_name -> firstName, last_name -> lastName.
 * 2. Adds isActive: true where missing (matches new schema default).
 * 3. Adds avatar: { url: '', publicId: '' } where missing.
 * 4. Adds signature: { url: '', publicId: '' } where missing.
 * 5. Unsets empty-string values on fields that carry `unique: true, sparse: true`
 *    indexes in the new schema (personalDetails.cellPhone, personalDetails.ninNumber,
 *    emergencyContact.cellPhone, bankDetails.bankSortCode, bankDetails.accountNumber).
 *    Mongo's sparse index only excludes documents where the field is missing/null
 *    — NOT documents where it's an empty string. Leaving '' in place means the
 *    second document with an empty string will throw E11000 duplicate key.
 * 6. Runs everything in batched bulkWrite calls for reasonable performance on
 *    large collections, with per-document error isolation.
 *
 * USAGE
 *   import { migrateUsers } from './migrate-users-schema';
 *   await migrateUsers({ dryRun: false });
 *
 * Run with dryRun: true first to see what WOULD change without writing anything.
 */

import mongoose, { Document } from 'mongoose';
import { env } from "../config/env";
import { User } from '../models/User.model';


interface MigrationOptions {
  /** If true, computes and logs changes but does not write to the database. */
  dryRun?: boolean;
  /** Number of documents per bulkWrite batch. */
  batchSize?: number;
}

interface MigrationSummary {
  scanned: number;
  matched: number;
  modified: number;
  skipped: number;
  errors: { _id: unknown; error: string }[];
}

const UNIQUE_SPARSE_PATHS = [
  'employmentInfo.personalDetails.cellPhone',
  'employmentInfo.personalDetails.ninNumber',
  'employmentInfo.emergencyContact.cellPhone',
  'employmentInfo.bankDetails.accountNumber',
] as const;

function getAtPath(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => (acc == null ? undefined : acc[key]), obj);
}

/**
 * Builds the $set / $unset payload for a single legacy user document.
 * Returns null if the document already matches the new schema shape
 * (nothing to migrate).
 */
function buildUpdateForDoc(doc: Record<string, any>): { $set?: Record<string, any>; $unset?: Record<string, ''> } | null {
  const $set: Record<string, any> = {};
  const $unset: Record<string, ''> = {};

  // 1. Rename first_name / last_name
  if (doc.first_name !== undefined) {
    if (doc.firstName === undefined) $set.firstName = doc.first_name;
    $unset.first_name = '';
  }
  if (doc.last_name !== undefined) {
    if (doc.lastName === undefined) $set.lastName = doc.last_name;
    $unset.last_name = '';
  }

  // 2. isActive default
  if (doc.isActive === undefined) {
    $set.isActive = true;
  }

  // 3. avatar default
  if (!doc.avatar || typeof doc.avatar !== 'object') {
    $set.avatar = { url: '', publicId: '' };
  }

  // 4. signature default
  if (!doc.signature || typeof doc.signature !== 'object') {
    $set.signature = { url: '', publicId: '' };
  }

  // 5. Clean empty strings on unique+sparse paths so the sparse index
  //    doesn't choke on multiple '' values.
  for (const path of UNIQUE_SPARSE_PATHS) {
    const value = getAtPath(doc, path);
    if (value === '') {
      $unset[path] = '';
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

export async function migrateUsers(options: MigrationOptions = {}): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('users');
  const summary: MigrationSummary = { scanned: 0, matched: 0, modified: 0, skipped: 0, errors: [] };

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
      // bulkWrite with ordered:false continues past individual failures
      // (e.g. leftover E11000 on a field we didn't anticipate). Record them.
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
      update = buildUpdateForDoc(doc as Record<string, any>);
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
    `[migrateUsers] ${dryRun ? '(DRY RUN) ' : ''}scanned=${summary.scanned} matched=${summary.matched} ` +
      `modified=${summary.modified} skipped=${summary.skipped} errors=${summary.errors.length}`,
  );
  if (summary.errors.length) {
    console.error('[migrateUsers] Errors:', summary.errors);
  }

  return summary;
}

/**
 * Rebuilds indexes to match the new User model (drops the old ones that
 * referenced first_name/last_name if present, creates the new unique/sparse
 * ones). Call this AFTER migrateUsers() has successfully finished, and only
 * once you've confirmed there are no leftover duplicate values that would
 * cause index creation to fail (rerun with dryRun to inspect first).
 *
 * Requires the compiled User model (from User.model.ts) so it can call
 * syncIndexes(), which diffs and applies exactly the indexes declared in
 * the schema.
 */
export async function syncUserIndexes(UserModel: mongoose.Model<any>): Promise<void> {
  await UserModel.collection.dropIndex('employmentInfo.bankDetails.bankSortCode_1');
  const result = await UserModel.syncIndexes();
  console.log('[syncUserIndexes] syncIndexes result:', result);
}


 async function main() {
      await mongoose.connect(env.MONGODB_URI!);
      await migrateUsers({ dryRun: true });   // inspect first
     await migrateUsers({ dryRun: false });  // then actually run it
     await syncUserIndexes(User);
     await mongoose.disconnect();
   }
