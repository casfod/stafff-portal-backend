import { Router } from 'express';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { catchAsync } from '../utils/catchAsync';
import { sendSuccess } from '../utils/responseHandler';
import { migrateUsers } from '../migrations/1-migrate-users-schema';
import { migrateProjects } from '../migrations/2-migrate-projects-schema';
import { migrateAdvanceRequests } from '../migrations/3-migrate-advancerequests-schema';
import { migrateAppraisals } from '../migrations/4-migrate-appraisals-schema';
import { migrateConceptNotes } from '../migrations/5-migrate-conceptnotes-schema';
import { migrateExpenseClaims } from '../migrations/6-migrate-expenseclaims-schema';
import { migrateFiles } from '../migrations/7-migrate-files-schema';
import { migrateGoodsReceived } from '../migrations/8-migrate-goodsreceiveds-schema';
import { migrateLeaves } from '../migrations/9-migrate-leaves-schema';
import { migrateLeaveBalances } from '../migrations/10-migrate-leavebalances-schema';
import { migratePaymentRequests } from '../migrations/11-migrate-paymentrequests-schema';
import { migratePaymentVouchers } from '../migrations/12-migrate-paymentvouchers-schema';
import { migratePurchaseOrders } from '../migrations/13-migrate-purchaseorders-schema';
import { migratePurchaseRequests } from '../migrations/14-migrate-purchaserequests-schema';
import { migrateReports } from '../migrations/15-migrate-reports-schema';
import { migrateRFQs } from '../migrations/16-migrate-rfqs-schema';
import { migrateStaffStrategies } from '../migrations/17-migrate-staffstrategies-schema';
import { migrateTravelRequests } from '../migrations/18-migrate-travelrequests-schema';
import { migrateVendors } from '../migrations/19-migrate-vendors-schema';
import { migrateUserSupervisorField } from '../migrations/21-migrate-user-supervisor-field';
import { runPurchaseOrderCommentIdsMigration } from '../controllers/migration.controller';

const router = Router();

const migrationOptions = (req: { query: Record<string, unknown>; body?: Record<string, unknown> }) => {
  const options = { ...req.query, ...(req.body ?? {}) };
  return {
    dryRun: options.dryRun === true || options.dryRun === 'true',
    ...(options.batchSize ? { batchSize: Number(options.batchSize) } : {}),
  };
};

const runMigration = (migration: (options: { dryRun: boolean; batchSize?: number }) => Promise<unknown>, name: string) =>
  catchAsync(async (req, res) => {
    const result = await migration(migrationOptions(req));
    sendSuccess(res, result, `${name} migration completed`);
  });

router.use(protect, restrictTo('ADMIN', 'SUPER-ADMIN'));

router.post('/users', runMigration(migrateUsers, 'Users'));
router.post('/projects', runMigration(migrateProjects, 'Projects'));
router.post('/advance-requests', runMigration(migrateAdvanceRequests, 'Advance requests'));
router.post('/appraisals', runMigration(migrateAppraisals, 'Appraisals'));
router.post('/concept-notes', runMigration(migrateConceptNotes, 'Concept notes'));
router.post('/expense-claims', runMigration(migrateExpenseClaims, 'Expense claims'));
router.post('/files', runMigration(migrateFiles, 'Files'));
router.post('/goods-received', runMigration(migrateGoodsReceived, 'Goods received'));
router.post('/leaves', runMigration(migrateLeaves, 'Leaves'));
router.post('/leave-balances', runMigration(migrateLeaveBalances, 'Leave balances'));
router.post('/payment-requests', runMigration(migratePaymentRequests, 'Payment requests'));
router.post('/payment-vouchers', runMigration(migratePaymentVouchers, 'Payment vouchers'));
router.post('/purchase-orders', runMigration(migratePurchaseOrders, 'Purchase orders'));
router.post('/purchase-requests', runMigration(migratePurchaseRequests, 'Purchase requests'));
router.post('/reports', runMigration(migrateReports, 'Reports'));
router.post('/rfqs', runMigration(migrateRFQs, 'RFQs'));
router.post('/staff-strategies', runMigration(migrateStaffStrategies, 'Staff strategies'));
router.post('/travel-requests', runMigration(migrateTravelRequests, 'Travel requests'));
router.post('/vendors', runMigration(migrateVendors, 'Vendors'));
router.post('/purchase-order-comment-ids', runPurchaseOrderCommentIdsMigration);
router.post('/user-supervisor-field', runMigration(migrateUserSupervisorField, 'User supervisor field'));

export default router;