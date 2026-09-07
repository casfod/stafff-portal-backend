/**
 * Removes the legacy staffName and staffRole fields from leave documents.
 *
 * Usage: POST /api/v1/migrations/leave-staff-fields?dryRun=true
 */

import mongoose from 'mongoose';

type MigrationOptions = {
  dryRun?: boolean;
};

type MigrationSummary = {
  scanned: number;
  matched: number;
  modified: number;
};

export async function migrateLeaveStaffFields(
  options: MigrationOptions = {},
): Promise<MigrationSummary> {
  const { dryRun = false } = options;
  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const collection = db.collection('leaves');
  const filter = {
    $or: [{ staffName: { $exists: true } }, { staffRole: { $exists: true } }],
  };
  const matched = await collection.countDocuments(filter);

  if (dryRun || matched === 0) {
    return { scanned: await collection.countDocuments(), matched, modified: 0 };
  }

  const result = await collection.updateMany(filter, {
    $unset: { staffName: '', staffRole: '' },
  });

  return {
    scanned: await collection.countDocuments(),
    matched,
    modified: result.modifiedCount,
  };
}