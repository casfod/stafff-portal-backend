/**
 * Backfills Purchase Order comments to match the shared comment schema.
 * This includes unique _id values and the edited, deleted, createdAt, and
 * updatedAt fields used by commentSchema.
 *
 * Usage: POST /api/v1/migrations/purchase-order-comment-ids?dryRun=true
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
  commentsAssigned: number;
  commentFieldsBackfilled: number;
};

const createCommentId = (usedIds: Set<string>) => {
  let id = new mongoose.Types.ObjectId();
  while (usedIds.has(id.toHexString())) {
    id = new mongoose.Types.ObjectId();
  }
  return id;
};

function buildUpdateForDoc(
  doc: Record<string, any>,
  summary: MigrationSummary,
): { $set: { comments: Record<string, any>[] } } | null {
  if (!Array.isArray(doc.comments) || doc.comments.length === 0) return null;

  const usedIds = new Set<string>();
  const fallbackCreatedAt = doc.createdAt ?? new Date();
  const fallbackUpdatedAt = doc.updatedAt ?? fallbackCreatedAt;
  let changed = false;
  const comments = doc.comments.map((comment: Record<string, any>) => {
    const updated = { ...comment };
    const existingId = updated._id?.toString();

    if (!existingId || usedIds.has(existingId)) {
      updated._id = createCommentId(usedIds);
      summary.commentsAssigned++;
      changed = true;
    }

    if (updated.edited === undefined) {
      updated.edited = false;
      summary.commentFieldsBackfilled++;
      changed = true;
    }
    if (updated.deleted === undefined) {
      updated.deleted = false;
      summary.commentFieldsBackfilled++;
      changed = true;
    }
    if (updated.createdAt === undefined) {
      updated.createdAt = fallbackCreatedAt;
      summary.commentFieldsBackfilled++;
      changed = true;
    }
    if (updated.updatedAt === undefined) {
      updated.updatedAt = fallbackUpdatedAt;
      summary.commentFieldsBackfilled++;
      changed = true;
    }

    usedIds.add(updated._id.toString());
    return updated;
  });

  return changed ? { $set: { comments } } : null;
}

export async function migratePurchaseOrderCommentIds(
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
    commentsAssigned: 0,
    commentFieldsBackfilled: 0,
  };
  const collection = db.collection('purchaseorders');
  const batch: { updateOne: { filter: { _id: any }; update: any } }[] = [];

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

  for await (const doc of collection.find({})) {
    summary.scanned++;

    let update: ReturnType<typeof buildUpdateForDoc>;
    try {
      update = buildUpdateForDoc(doc as Record<string, any>, summary);
    } catch (error: any) {
      summary.errors.push({ _id: doc._id, error: error?.message ?? String(error) });
      continue;
    }

    if (!update) {
      summary.skipped++;
      continue;
    }

    summary.matched++;
    batch.push({ updateOne: { filter: { _id: doc._id }, update } });
    if (batch.length >= batchSize) await flushBatch();
  }

  await flushBatch();
  return summary;
}
