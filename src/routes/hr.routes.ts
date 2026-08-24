// hr.routes.ts - Fixed version

import { Router } from 'express';
import multer from 'multer';
import { protect, restrictTo } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  statusUpdateSchema,
  copyDocumentSchema,
  addCommentSchema,
  updateCommentSchema,
  createLeaveSchema,
  saveLeaveDraftSchema,
  createStaffStrategySchema,
  staffStrategyStatusSchema,
  createAppraisalSchema,
  appraisalStatusSchema,
  updateObjectivesSchema,
  signAppraisalSchema,
  saveReportDraftSchema,
  createReportSchema,
} from '../validators/domain.validator';
import * as hr from '../controllers/hr.controller';
import { debugRequest } from '../middleware/debug.middleware';

const router = Router();

const uploadSingle = multer({
  storage: multer.memoryStorage(),
  limits:  { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      return cb(new Error('Only PDF files are allowed'));
    }
    cb(null, true);
  },
});

// ── All routes require authentication ─────────────────────────────────────────
router.use(protect);

// ═══════════════════════════════════════════════════════════════════════════════
// LEAVE  /hr/leave
// ═══════════════════════════════════════════════════════════════════════════════
const leaveRouter = Router();

leaveRouter.get('/stats',                          hr.getLeaveStats);
leaveRouter.get('/balance/me',                     hr.getMyLeaveBalance);
leaveRouter.get('/balance/:userId',  restrictTo('ADMIN', 'SUPER-ADMIN'), hr.getLeaveBalanceByUser);
leaveRouter.get('/balance/:userId/history',        hr.getLeaveBalanceHistory);
leaveRouter.get   ('/',                            hr.getAllLeaves);
leaveRouter.post  ('/draft',  validate(saveLeaveDraftSchema),    hr.saveLeaveDraft);
leaveRouter.post  ('/',    validate(createLeaveSchema),       hr.createLeaveApplication);
leaveRouter.get   ('/:id',                         hr.getLeaveById);
leaveRouter.patch ('/:id',                hr.updateLeaveApplication);
leaveRouter.patch ('/:id/submit',                  hr.submitLeaveDraft);
leaveRouter.patch ('/:id/status', validate(statusUpdateSchema),  hr.updateLeaveStatus);
leaveRouter.delete('/:id',                         hr.deleteLeave);
leaveRouter.post  ('/:id/copy',   validate(copyDocumentSchema),  hr.copyLeave);
leaveRouter.post  ('/:id/comments',            validate(addCommentSchema),    hr.addLeaveComment);
leaveRouter.patch ('/:id/comments/:commentId', validate(updateCommentSchema), hr.updateLeaveComment);
leaveRouter.delete('/:id/comments/:commentId', hr.deleteLeaveComment);

router.use('/leave', leaveRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// STAFF STRATEGY  /hr/staff-strategy
// ═══════════════════════════════════════════════════════════════════════════════
const ssRouter = Router();

ssRouter.get   ('/',                              hr.getAllStaffStrategies);
ssRouter.post  ('/draft', validate(createStaffStrategySchema), hr.saveStaffStrategyDraft);
ssRouter.post  ('/',   validate(createStaffStrategySchema), hr.createStaffStrategy);
ssRouter.get   ('/:id',                           hr.getStaffStrategyById);
ssRouter.patch ('/:id',    hr.updateStaffStrategy);
ssRouter.patch ('/:id/submit',          hr.submitStaffStrategy);
ssRouter.patch (
  '/:id/status',
  restrictTo('ADMIN', 'SUPER-ADMIN'),
  validate(staffStrategyStatusSchema),
  uploadSingle.single('pdf'),
  hr.updateStaffStrategyStatus,
);
ssRouter.delete('/:id',  restrictTo('ADMIN', 'SUPER-ADMIN'),   hr.deleteStaffStrategy);
ssRouter.post  ('/:id/copy',   validate(copyDocumentSchema),   hr.copyStaffStrategy);
ssRouter.post  ('/:id/comments',            validate(addCommentSchema),    hr.addStaffStrategyComment);
ssRouter.patch ('/:id/comments/:commentId', validate(updateCommentSchema), hr.updateStaffStrategyComment);
ssRouter.delete('/:id/comments/:commentId', hr.deleteStaffStrategyComment);

router.use('/staff-strategy', ssRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// APPRAISAL  /hr/appraisals
// ═══════════════════════════════════════════════════════════════════════════════
const appRouter = Router();

appRouter.get('/stats',                            hr.getAppraisalStats);
appRouter.get('/',                                 hr.getAllAppraisals);
appRouter.post('/draft',  validate(createAppraisalSchema), hr.saveAppraisalDraft);
appRouter.post('/',   validate(createAppraisalSchema), hr.createAppraisal);
appRouter.get ('/:id',                             hr.getAppraisalById);
appRouter.patch('/:id', hr.updateAppraisal);
appRouter.patch('/:id/submit',                      hr.submitAppraisal);
appRouter.patch(
  '/:id/status',
  validate(appraisalStatusSchema),
  hr.updateAppraisalStatus,
);
appRouter.patch('/:id/objectives', validate(updateObjectivesSchema), hr.updateObjectives);
appRouter.patch('/:id/sign', validate(signAppraisalSchema),    hr.signAppraisal);
appRouter.delete('/:id',           restrictTo('ADMIN', 'SUPER-ADMIN'), hr.deleteAppraisal);
appRouter.post  ('/:id/comments',            validate(addCommentSchema),    hr.addAppraisalComment);
appRouter.patch ('/:id/comments/:commentId', validate(updateCommentSchema), hr.updateAppraisalComment);
appRouter.delete('/:id/comments/:commentId', hr.deleteAppraisalComment);

router.use('/appraisals', appRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS  /hr/reports  ✅ FIXED - Now uses a sub-router like the others
// ═══════════════════════════════════════════════════════════════════════════════
const reportRouter = Router();

// ✅ Specific routes FIRST (before /:id)
reportRouter.get('/stats', hr.getReportStats);

// ✅ Routes that don't have :id parameter
reportRouter.get('/', hr.getAllReports);
reportRouter.post('/draft', validate(saveReportDraftSchema), hr.saveReportDraft);
reportRouter.post('/', debugRequest("Creating report"), validate(createReportSchema), hr.createReport);

// ✅ Routes with :id parameter (these come AFTER specific routes)
reportRouter.get('/:id', hr.getReportById);
reportRouter.patch('/:id', hr.updateReport);
reportRouter.patch('/:id/status', validate(statusUpdateSchema), hr.updateReportStatus);
reportRouter.delete('/:id', restrictTo('ADMIN', 'SUPER-ADMIN'), hr.deleteReport);
reportRouter.post('/:id/copy', validate(copyDocumentSchema), hr.copyReport);
reportRouter.post('/:id/comments', validate(addCommentSchema), hr.addReportComment);
reportRouter.patch('/:id/comments/:commentId', validate(updateCommentSchema), hr.updateReportComment);
reportRouter.delete('/:id/comments/:commentId', hr.deleteReportComment);

// ✅ Mount the report router at /reports
router.use('/reports', reportRouter);

export default router;