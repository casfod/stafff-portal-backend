import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { sendSuccess } from '../utils/responseHandler';
import { migratePurchaseOrderCommentIds } from '../migrations/20-migrate-purchaseorder-comment-ids';

const migrationOptions = (req: AuthRequest) => {
  const options = { ...req.query, ...(req.body ?? {}) } as Record<string, unknown>;
  return {
    dryRun: options.dryRun === true || options.dryRun === 'true',
    ...(options.batchSize !== undefined ? { batchSize: Number(options.batchSize) } : {}),
  };
};

export const runPurchaseOrderCommentIdsMigration = catchAsync(
  async (req: AuthRequest, res: Response) => {
    const result = await migratePurchaseOrderCommentIds(migrationOptions(req));
    sendSuccess(res, result, 'Purchase Order comment IDs migration completed');
  },
);