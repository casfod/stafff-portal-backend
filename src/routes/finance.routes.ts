import { Router } from 'express';
import { protect, 
  // restrictTo 
} from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';
import {
  // paginationSchema,
  statusUpdateSchema,
  copyDocumentSchema,
  addCommentSchema,
  updateCommentSchema,
  createConceptNoteSchema,
  saveConceptNoteDraftSchema,
  createAdvanceRequestSchema,
  saveAdvanceRequestDraftSchema,
  createExpenseClaimSchema,
  saveExpenseClaimDraftSchema,
  createTravelRequestSchema,
  saveTravelRequestDraftSchema,
  createPaymentRequestSchema,
  savePaymentRequestDraftSchema,
  createPaymentVoucherSchema,
  savePaymentVoucherDraftSchema,
} from '../validators/domain.validator';
import * as finance from '../controllers/finance.controller';
import { debugRequest } from '../middleware/debug.middleware';

const router = Router();

// ── All routes require authentication ─────────────────────────────────────────
router.use(protect);

// ═══════════════════════════════════════════════════════════════════════════════
// CONCEPT NOTE  /finance/concept-notes
// ═══════════════════════════════════════════════════════════════════════════════
const cnRouter = Router();

cnRouter.get   ('/stats',                         finance.getConceptNoteStats);
cnRouter.get   ('/',                              finance.getAllConceptNotes);
cnRouter.post  ('/draft',  validate(saveConceptNoteDraftSchema), finance.saveConceptNoteDraft);
cnRouter.post  ('/',       validate(createConceptNoteSchema),    finance.createConceptNote);
cnRouter.get   ('/:id',                           finance.getConceptNoteById);
cnRouter.patch ('/:id',    finance.updateConceptNote);
cnRouter.patch ('/:id/status', validate(statusUpdateSchema), finance.updateConceptNoteStatus);
cnRouter.delete('/:id',                           finance.deleteConceptNote);
cnRouter.post  ('/:id/copy',   validate(copyDocumentSchema),  finance.copyConceptNote);
cnRouter.post  ('/:id/comments',                 validate(addCommentSchema),    finance.addConceptNoteComment);
cnRouter.patch ('/:id/comments/:commentId',      validate(updateCommentSchema), finance.updateConceptNoteComment);
cnRouter.delete('/:id/comments/:commentId',      finance.deleteConceptNoteComment);

router.use('/concept-notes', cnRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCE REQUEST  /finance/advance-requests
// ═══════════════════════════════════════════════════════════════════════════════
const arRouter = Router();

arRouter.get   ('/stats',                        finance.getAdvanceRequestStats);
arRouter.get   ('/',  debugRequest("getAllAdvanceRequests"),                           finance.getAllAdvanceRequests);
arRouter.post  ('/draft', validate(saveAdvanceRequestDraftSchema), finance.saveAdvanceRequestDraft);
arRouter.post  ('/', debugRequest("createAdvanceRequest"),  validate(createAdvanceRequestSchema),    finance.createAdvanceRequest);
arRouter.get   ('/:id',                          finance.getAdvanceRequestById);
arRouter.patch ('/:id', finance.updateAdvanceRequest);
arRouter.patch ('/:id/status', validate(statusUpdateSchema),  finance.updateAdvanceRequestStatus);
arRouter.delete('/:id',                          finance.deleteAdvanceRequest);
arRouter.post  ('/:id/copy',   validate(copyDocumentSchema), finance.copyAdvanceRequest);
arRouter.post  ('/:id/comments',            validate(addCommentSchema),    finance.addAdvanceRequestComment);
arRouter.patch ('/:id/comments/:commentId', validate(updateCommentSchema), finance.updateAdvanceRequestComment);
arRouter.delete('/:id/comments/:commentId', finance.deleteAdvanceRequestComment);

router.use('/advance-requests', arRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSE CLAIM  /finance/expense-claims
// ═══════════════════════════════════════════════════════════════════════════════
const ecRouter = Router();

ecRouter.get   ('/stats',                        finance.getExpenseClaimStats);
ecRouter.get   ('/',                             finance.getAllExpenseClaims);
ecRouter.post  ('/draft', validate(saveExpenseClaimDraftSchema), finance.saveExpenseClaimDraft);
ecRouter.post  ('/',      validate(createExpenseClaimSchema),    finance.createExpenseClaim);
ecRouter.get   ('/:id',                          finance.getExpenseClaimById);
ecRouter.patch ('/:id',   finance.updateExpenseClaim);
ecRouter.patch ('/:id/status', validate(statusUpdateSchema),  finance.updateExpenseClaimStatus);
ecRouter.delete('/:id',                          finance.deleteExpenseClaim);
ecRouter.post  ('/:id/copy',   validate(copyDocumentSchema), finance.copyExpenseClaim);
ecRouter.post  ('/:id/comments',            validate(addCommentSchema),    finance.addExpenseClaimComment);
ecRouter.patch ('/:id/comments/:commentId', validate(updateCommentSchema), finance.updateExpenseClaimComment);
ecRouter.delete('/:id/comments/:commentId', finance.deleteExpenseClaimComment);

router.use('/expense-claims', ecRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// TRAVEL REQUEST  /finance/travel-requests
// ═══════════════════════════════════════════════════════════════════════════════
const trRouter = Router();

trRouter.get   ('/stats',                        finance.getTravelRequestStats);
trRouter.get   ('/',                             finance.getAllTravelRequests);
trRouter.post  ('/draft', validate(saveTravelRequestDraftSchema), finance.saveTravelRequestDraft);
trRouter.post  ('/',      validate(createTravelRequestSchema),    finance.createTravelRequest);
trRouter.get   ('/:id',                          finance.getTravelRequestById);
trRouter.patch ('/:id',   finance.updateTravelRequest);
trRouter.patch ('/:id/status', validate(statusUpdateSchema),  finance.updateTravelRequestStatus);
trRouter.delete('/:id',                          finance.deleteTravelRequest);
trRouter.post  ('/:id/copy',   validate(copyDocumentSchema), finance.copyTravelRequest);
trRouter.post  ('/:id/comments',            validate(addCommentSchema),    finance.addTravelRequestComment);
trRouter.patch ('/:id/comments/:commentId', validate(updateCommentSchema), finance.updateTravelRequestComment);
trRouter.delete('/:id/comments/:commentId', finance.deleteTravelRequestComment);

router.use('/travel-requests', trRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT REQUEST  /finance/payment-requests
// ═══════════════════════════════════════════════════════════════════════════════
const pmrRouter = Router();

pmrRouter.get   ('/stats',                         finance.getPaymentRequestStats);
pmrRouter.get   ('/',                              finance.getAllPaymentRequests);
pmrRouter.post  ('/draft', validate(savePaymentRequestDraftSchema), finance.savePaymentRequestDraft);
pmrRouter.post  ('/',      validate(createPaymentRequestSchema),    finance.createPaymentRequest);
pmrRouter.get   ('/:id',                           finance.getPaymentRequestById);
pmrRouter.patch ('/:id',    finance.updatePaymentRequest);
pmrRouter.patch ('/:id/status', validate(statusUpdateSchema),  finance.updatePaymentRequestStatus);
pmrRouter.delete('/:id',                           finance.deletePaymentRequest);
pmrRouter.post  ('/:id/copy',   validate(copyDocumentSchema), finance.copyPaymentRequest);
pmrRouter.post  ('/:id/comments',            validate(addCommentSchema),    finance.addPaymentRequestComment);
pmrRouter.patch ('/:id/comments/:commentId', validate(updateCommentSchema), finance.updatePaymentRequestComment);
pmrRouter.delete('/:id/comments/:commentId', finance.deletePaymentRequestComment);

router.use('/payment-requests', pmrRouter);

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT VOUCHER  /finance/payment-vouchers
// ═══════════════════════════════════════════════════════════════════════════════
const pvRouter = Router();

pvRouter.get   ('/stats',                         finance.getPaymentVoucherStats);
pvRouter.get   ('/',                              finance.getAllPaymentVouchers);
pvRouter.post  ('/draft', validate(savePaymentVoucherDraftSchema), finance.savePaymentVoucherDraft);
pvRouter.post  ('/',      validate(createPaymentVoucherSchema),    finance.createPaymentVoucher);
pvRouter.get   ('/:id',                           finance.getPaymentVoucherById);
pvRouter.patch ('/:id',    finance.updatePaymentVoucher);
pvRouter.patch ('/:id/status', validate(statusUpdateSchema), finance.updatePaymentVoucherStatus);
pvRouter.delete('/:id',                           finance.deletePaymentVoucher);
pvRouter.post  ('/:id/copy',   validate(copyDocumentSchema), finance.copyPaymentVoucher);

router.use('/payment-vouchers', pvRouter);

export default router;
