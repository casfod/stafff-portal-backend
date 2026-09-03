/**
 * Removes the legacy `employmentInfo.jobDetails.supervisor` field from users.
 * The `supervisorId` reference is preserved.
 *
 * Usage: POST /api/v1/migrations/user-supervisor-field?dryRun=true
 */

import mongoose from 'mongoose';

type MigrationOptions = {
  dryRun?: boolean;
  batchSize?: number;
};

type MigrationError = {
  _id: unknown;
  error: string;
};

type MigrationSummary = {
  scanned: number;
  matched: number;
  modified: number;
  skipped: number;
  errors: MigrationError[];
};

export async function migrateUserSupervisorField(
  options: MigrationOptions = {},
): Promise<MigrationSummary> {
  const { dryRun = false, batchSize = 500 } = options;
  if (!Number.isInteger(batchSize) || batchSize < 1) {
    throw new Error('batchSize must be a positive integer.');
  }

  const db = mongoose.connection.db;
  if (!db) {
    throw new Error('No active mongoose connection (mongoose.connection.db is undefined).');
  }

  const summary: MigrationSummary = {
    scanned: 0,
    matched: 0,
    modified: 0,
    skipped: 0,
    errors: [],
  };
  const collection = db.collection('users');
  const batch: { updateOne: { filter: { _id: any }; update: { $unset: Record<string, ''> } } }[] = [];

  const flushBatch = async () => {
    if (batch.length === 0) return;
    if (dryRun) {
      summary.modified += batch.length;
      batch.length = 0;
      return;
    }

    try {
      const result = await collection.bulkWrite(batch, { ordered: false });
      summary.modified += result.modifiedCount ?? 0;
    } catch (error: any) {
      const writeErrors = error?.writeErrors ?? [];
      if (writeErrors.length > 0) {
        for (const writeError of writeErrors) {
          summary.errors.push({
            _id: batch[writeError.index]?.updateOne.filter._id,
            error: writeError.errmsg ?? String(writeError),
          });
        }
        summary.modified += batch.length - writeErrors.length;
      } else {
        summary.errors.push({ _id: 'batch', error: error?.message ?? String(error) });
      }
    }
    batch.length = 0;
  };

  for await (const doc of collection.find({ 'employmentInfo.jobDetails.supervisor': { $exists: true } })) {
    summary.scanned++;
    summary.matched++;
    batch.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { $unset: { 'employmentInfo.jobDetails.supervisor': '' } },
      },
    });
    if (batch.length >= batchSize) await flushBatch();
  }

  summary.skipped = summary.scanned - summary.matched;
  await flushBatch();
  return summary;
}