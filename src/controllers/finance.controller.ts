import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { sendSuccess, sendCreated, sendNoContent } from '../utils/responseHandler';
import { AuthRequest } from '../middleware/auth.middleware';
import { currentUser, queryParams, userId, multerFiles } from './controller.helpers';
import * as conceptNoteService   from '../services/concept-note.service';
import * as advanceRequestService from '../services/advance-request.service';
import * as expenseClaimsService  from '../services/expense-claims.service';
import * as travelRequestService  from '../services/travel-request.service';
import * as paymentRequestService from '../services/payment-request.service';
import * as paymentVoucherService from '../services/payment-voucher.service';


// ═══════════════════════════════════════════════════════════════════════════════
// CONCEPT NOTE
// ═══════════════════════════════════════════════════════════════════════════════
export const getConceptNoteStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await conceptNoteService.getConceptNoteStats(currentUser(req));
  sendSuccess(res, stats, 'Concept note stats retrieved');
});

export const getAllConceptNotes = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await conceptNoteService.getAllConceptNotes(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Concept notes retrieved');
});

export const getConceptNoteById = catchAsync(async (req: AuthRequest, res: Response) => {
  const note = await conceptNoteService.getConceptNoteById(req.params.id);
  sendSuccess(res, note, 'Concept note retrieved');
});

export const saveConceptNoteDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const note = await conceptNoteService.saveConceptNoteDraft(
    { ...req.body, createdBy: userId(req) },
    currentUser(req),
  );
  sendCreated(res, note, 'Concept note draft saved');
});

export const createConceptNote = catchAsync(async (req: AuthRequest, res: Response) => {
  const note = await conceptNoteService.createConceptNote(
    { ...req.body, createdBy: userId(req) },
    currentUser(req),
  );
  sendCreated(res, note, 'Concept note submitted');
});

export const updateConceptNote = catchAsync(async (req: AuthRequest, res: Response) => {
  const note = await conceptNoteService.updateConceptNote(
    req.params.id,
    req.body,
    currentUser(req),
    
  );
  sendSuccess(res, note, 'Concept note updated');
});

export const updateConceptNoteStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const note = await conceptNoteService.updateConceptNoteStatus(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, note, 'Concept note status updated');
});

export const deleteConceptNote = catchAsync(async (req: AuthRequest, res: Response) => {
  await conceptNoteService.deleteConceptNote(req.params.id);
  sendNoContent(res);
});

export const addConceptNoteComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await conceptNoteService.addComment(req.params.id, currentUser(req), req.body.text);
  sendCreated(res, comment, 'Comment added');
});

export const updateConceptNoteComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await conceptNoteService.updateComment(req.params.id, req.params.commentId, currentUser(req)._id, req.body.text);
  sendSuccess(res, comment, 'Comment updated');
});

export const deleteConceptNoteComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await conceptNoteService.deleteComment(req.params.id, req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});

export const copyConceptNote = catchAsync(async (req: AuthRequest, res: Response) => {
  const note = await conceptNoteService.conceptNoteCopyService.copyDocument({
    currentUser: currentUser(req),
    requestId:   req.params.id,
    requestType: 'conceptNote',
    requestTitle: 'Concept Note',
    recipients:  req.body.recipients,
  });
  sendSuccess(res, note, 'Concept note copied');
});

// ═══════════════════════════════════════════════════════════════════════════════
// ADVANCE REQUEST
// ═══════════════════════════════════════════════════════════════════════════════
export const getAdvanceRequestStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await advanceRequestService.getAdvanceRequestStats(currentUser(req));
  sendSuccess(res, stats, 'Advance request stats retrieved');
});

export const getAllAdvanceRequests = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await advanceRequestService.getAdvanceRequests(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Advance requests retrieved');
});

export const getAdvanceRequestById = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await advanceRequestService.getAdvanceRequestById(req.params.id);
  sendSuccess(res, request, 'Advance request retrieved');
});

export const saveAdvanceRequestDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await advanceRequestService.saveAdvanceRequest(req.body, currentUser(req));
  sendCreated(res, request, 'Advance request draft saved');
});

export const createAdvanceRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await advanceRequestService.saveAndSendAdvanceRequest(
    req.body, currentUser(req), 
  );
  sendCreated(res, request, 'Advance request submitted');
});

export const updateAdvanceRequest = catchAsync(async (req: AuthRequest, res: Response) => { 
  const request = await advanceRequestService.updateAdvanceRequest(
    req.params.id, req.body, currentUser(req), 
  );
  sendSuccess(res, request, 'Advance request updated');
});

export const updateAdvanceRequestStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await advanceRequestService.updateAdvanceRequestStatus(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, request, 'Advance request status updated');
});

export const deleteAdvanceRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  await advanceRequestService.deleteAdvanceRequest(req.params.id);
  sendNoContent(res);
});

export const addAdvanceRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await advanceRequestService.addComment(req.params.id, currentUser(req), req.body.text);
  sendCreated(res, comment, 'Comment added');
});

export const updateAdvanceRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await advanceRequestService.updateComment(req.params.id, req.params.commentId, currentUser(req)._id, req.body.text);
  sendSuccess(res, comment, 'Comment updated');
});

export const deleteAdvanceRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await advanceRequestService.deleteComment(req.params.id, req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});

export const copyAdvanceRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const doc = await advanceRequestService.advanceRequestCopyService.copyDocument({
    currentUser: currentUser(req), requestId: req.params.id,
    requestType: 'advanceRequest', requestTitle: 'Advance Request', recipients: req.body.recipients,
  });
  sendSuccess(res, doc, 'Advance request copied');
});

// ═══════════════════════════════════════════════════════════════════════════════
// EXPENSE CLAIM
// ═══════════════════════════════════════════════════════════════════════════════
export const getExpenseClaimStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await expenseClaimsService.getExpenseClaimStats(currentUser(req));
  sendSuccess(res, stats, 'Expense claim stats retrieved');
});

export const getAllExpenseClaims = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await expenseClaimsService.getExpenseClaims(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Expense claims retrieved');
});

export const getExpenseClaimById = catchAsync(async (req: AuthRequest, res: Response) => {
  const claim = await expenseClaimsService.getExpenseClaimById(req.params.id);
  sendSuccess(res, claim, 'Expense claim retrieved');
});

export const saveExpenseClaimDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const claim = await expenseClaimsService.saveExpenseClaim(req.body, currentUser(req));
  sendCreated(res, claim, 'Expense claim draft saved');
});

export const createExpenseClaim = catchAsync(async (req: AuthRequest, res: Response) => {
  const claim = await expenseClaimsService.saveAndSendExpenseClaim(
    req.body, currentUser(req), 
  );
  sendCreated(res, claim, 'Expense claim submitted');
});

export const updateExpenseClaim = catchAsync(async (req: AuthRequest, res: Response) => {
  const claim = await expenseClaimsService.updateExpenseClaim(
    req.params.id, req.body, currentUser(req), 
  );
  sendSuccess(res, claim, 'Expense claim updated');
});

export const updateExpenseClaimStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const claim = await expenseClaimsService.updateExpenseClaimStatus(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, claim, 'Expense claim status updated');
});

export const deleteExpenseClaim = catchAsync(async (req: AuthRequest, res: Response) => {
  await expenseClaimsService.deleteExpenseClaim(req.params.id);
  sendNoContent(res);
});

export const addExpenseClaimComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await expenseClaimsService.addComment(req.params.id, currentUser(req), req.body.text);
  sendCreated(res, comment, 'Comment added');
});

export const updateExpenseClaimComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await expenseClaimsService.updateComment(req.params.id, req.params.commentId, currentUser(req)._id, req.body.text);
  sendSuccess(res, comment, 'Comment updated');
});

export const deleteExpenseClaimComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await expenseClaimsService.deleteComment(req.params.id, req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});

export const copyExpenseClaim = catchAsync(async (req: AuthRequest, res: Response) => {
  const doc = await expenseClaimsService.expenseClaimCopyService.copyDocument({
    currentUser: currentUser(req), requestId: req.params.id,
    requestType: 'expenseClaim', requestTitle: 'Expense Claim', recipients: req.body.recipients,
  });
  sendSuccess(res, doc, 'Expense claim copied');
});

// ═══════════════════════════════════════════════════════════════════════════════
// TRAVEL REQUEST
// ═══════════════════════════════════════════════════════════════════════════════
export const getTravelRequestStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await travelRequestService.getTravelRequestStats(currentUser(req));
  sendSuccess(res, stats, 'Travel request stats retrieved');
});

export const getAllTravelRequests = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await travelRequestService.getTravelRequests(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Travel requests retrieved');
});

export const getTravelRequestById = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await travelRequestService.getTravelRequestById(req.params.id);
  sendSuccess(res, request, 'Travel request retrieved');
});

export const saveTravelRequestDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await travelRequestService.saveTravelRequest(req.body, currentUser(req));
  sendCreated(res, request, 'Travel request draft saved');
});

export const createTravelRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await travelRequestService.saveAndSendTravelRequest(
    req.body, currentUser(req), 
  );
  sendCreated(res, request, 'Travel request submitted');
});

export const updateTravelRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await travelRequestService.updateTravelRequest(
    req.params.id, req.body, currentUser(req), 
  );
  sendSuccess(res, request, 'Travel request updated');
});

export const updateTravelRequestStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await travelRequestService.updateTravelRequestStatus(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, request, 'Travel request status updated');
});

export const deleteTravelRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  await travelRequestService.deleteTravelRequest(req.params.id);
  sendNoContent(res);
});

export const addTravelRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await travelRequestService.addComment(req.params.id, currentUser(req), req.body.text);
  sendCreated(res, comment, 'Comment added');
});

export const updateTravelRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await travelRequestService.updateComment(req.params.id, req.params.commentId, currentUser(req)._id, req.body.text);
  sendSuccess(res, comment, 'Comment updated');
});

export const deleteTravelRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await travelRequestService.deleteComment(req.params.id, req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});

export const copyTravelRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const doc = await travelRequestService.travelRequestCopyService.copyDocument({
    currentUser: currentUser(req), requestId: req.params.id,
    requestType: 'travelRequest', requestTitle: 'Travel Request', recipients: req.body.recipients,
  });
  sendSuccess(res, doc, 'Travel request copied');
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT REQUEST
// ═══════════════════════════════════════════════════════════════════════════════
export const getPaymentRequestStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await paymentRequestService.getPaymentRequestStats(currentUser(req));
  sendSuccess(res, stats, 'Payment request stats retrieved');
});

export const getAllPaymentRequests = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await paymentRequestService.getPaymentRequests(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Payment requests retrieved');
});

export const getPaymentRequestById = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await paymentRequestService.getPaymentRequestById(req.params.id);
  sendSuccess(res, request, 'Payment request retrieved');
});

export const savePaymentRequestDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await paymentRequestService.savePaymentRequest(req.body, currentUser(req));
  sendCreated(res, request, 'Payment request draft saved');
});

export const createPaymentRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await paymentRequestService.saveAndSendPaymentRequest(
    req.body, currentUser(req), 
  );
  sendCreated(res, request, 'Payment request submitted');
});

export const updatePaymentRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await paymentRequestService.updatePaymentRequest(
    req.params.id, req.body, currentUser(req), 
  );
  sendSuccess(res, request, 'Payment request updated');
});

export const updatePaymentRequestStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const request = await paymentRequestService.updatePaymentRequestStatus(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, request, 'Payment request status updated');
});

export const deletePaymentRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  await paymentRequestService.deletePaymentRequest(req.params.id);
  sendNoContent(res);
});

export const addPaymentRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await paymentRequestService.addComment(req.params.id, currentUser(req), req.body.text);
  sendCreated(res, comment, 'Comment added');
});

export const updatePaymentRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await paymentRequestService.updateComment(req.params.id, req.params.commentId, currentUser(req)._id, req.body.text);
  sendSuccess(res, comment, 'Comment updated');
});

export const deletePaymentRequestComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await paymentRequestService.deleteComment(req.params.id, req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});

export const copyPaymentRequest = catchAsync(async (req: AuthRequest, res: Response) => {
  const doc = await paymentRequestService.paymentRequestCopyService.copyDocument({
    currentUser: currentUser(req), requestId: req.params.id,
    requestType: 'paymentRequest', requestTitle: 'Payment Request', recipients: req.body.recipients,
  });
  sendSuccess(res, doc, 'Payment request copied');
});

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT VOUCHER
// ═══════════════════════════════════════════════════════════════════════════════
export const getPaymentVoucherStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await paymentVoucherService.getPaymentVoucherStats(currentUser(req));
  sendSuccess(res, stats, 'Payment voucher stats retrieved');
});

export const getAllPaymentVouchers = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await paymentVoucherService.getPaymentVouchers(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Payment vouchers retrieved');
});

export const getPaymentVoucherById = catchAsync(async (req: AuthRequest, res: Response) => {
  const voucher = await paymentVoucherService.getPaymentVoucherById(req.params.id);
  sendSuccess(res, voucher, 'Payment voucher retrieved');
});

export const savePaymentVoucherDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const voucher = await paymentVoucherService.savePaymentVoucher(req.body, currentUser(req));
  sendCreated(res, voucher, 'Payment voucher draft saved');
});

export const createPaymentVoucher = catchAsync(async (req: AuthRequest, res: Response) => {
  const voucher = await paymentVoucherService.saveAndSendPaymentVoucher(
    req.body, currentUser(req), 
  );
  sendCreated(res, voucher, 'Payment voucher submitted');
});

export const updatePaymentVoucher = catchAsync(async (req: AuthRequest, res: Response) => {
  const voucher = await paymentVoucherService.updatePaymentVoucher(
    req.params.id, req.body, currentUser(req), 
  );
  sendSuccess(res, voucher, 'Payment voucher updated');
});

export const updatePaymentVoucherStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const voucher = await paymentVoucherService.updateVoucherStatus(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, voucher, 'Payment voucher status updated');
});

export const deletePaymentVoucher = catchAsync(async (req: AuthRequest, res: Response) => {
  await paymentVoucherService.deletePaymentVoucher(req.params.id);
  sendNoContent(res);
});


export const copyPaymentVoucher = catchAsync(async (req: AuthRequest, res: Response) => {
  const doc = await paymentVoucherService.paymentVoucherCopyService.copyDocument({
    currentUser: currentUser(req), requestId: req.params.id,
    requestType: 'paymentVoucher', requestTitle: 'Payment Voucher', recipients: req.body.recipients,
  });
  sendSuccess(res, doc, 'Payment voucher copied');
});