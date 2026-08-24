import { Response } from 'express';
import mongoose from 'mongoose';
import { catchAsync } from '../utils/catchAsync';
import { sendSuccess, sendCreated, sendNoContent } from '../utils/responseHandler';
import { AuthRequest } from '../middleware/auth.middleware';
import { currentUser, queryParams, userId, multerFiles, multerFile, paramId } from './controller.helpers';
import * as leaveService         from '../services/leave.service';
import * as staffStrategyService from '../services/staff-strategy.service';
import * as appraisalService     from '../services/appraisal.service';
import * as reportService from '../services/report.service';

// ═══════════════════════════════════════════════════════════════════════════════
// LEAVE
// ═══════════════════════════════════════════════════════════════════════════════
export const getLeaveStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await leaveService.getLeaveStats(currentUser(req));
  sendSuccess(res, stats, 'Leave stats retrieved');
});

export const getMyLeaveBalance = catchAsync(async (req: AuthRequest, res: Response) => {
  const balance = await leaveService.getUserLeaveBalance(
    new mongoose.Types.ObjectId(userId(req)),
  );
  sendSuccess(res, balance, 'Leave balance retrieved');
});

export const getLeaveBalanceByUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const balance = await leaveService.getUserLeaveBalance(
    new mongoose.Types.ObjectId(paramId(req, 'userId')),
  );
  sendSuccess(res, balance, 'Leave balance retrieved');
});

export const getLeaveBalanceHistory = catchAsync(async (req: AuthRequest, res: Response) => {
  const history = await leaveService.getLeaveBalanceHistory(
    req.params.userId ?? userId(req),
    req.query.leaveType as any,
  );
  sendSuccess(res, history, 'Leave balance history retrieved');
});

export const getAllLeaves = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await leaveService.getAllLeaves(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Leave applications retrieved');
});

export const getLeaveById = catchAsync(async (req: AuthRequest, res: Response) => {
  const leave = await leaveService.getLeaveById(paramId(req));
  sendSuccess(res, leave, 'Leave application retrieved');
});

export const saveLeaveDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const leave = await leaveService.saveLeaveDraft(currentUser(req), req.body);
  sendCreated(res, leave, 'Leave draft saved');
});

export const createLeaveApplication = catchAsync(async (req: AuthRequest, res: Response) => {
  const leave = await leaveService.createLeaveApplication(
    currentUser(req), req.body, multerFiles(req),
  );
  sendCreated(res, leave, 'Leave application submitted');
});

export const submitLeaveDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const leave = await leaveService.submitDraft(paramId(req), currentUser(req));
  sendSuccess(res, leave, 'Leave draft submitted');
});

export const updateLeaveApplication = catchAsync(async (req: AuthRequest, res: Response) => {
  const leave = await leaveService.updateLeaveApplication(
    paramId(req), req.body, currentUser(req), multerFiles(req),
  );
  sendSuccess(res, leave, 'Leave application updated');
});

export const updateLeaveStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const leave = await leaveService.updateLeaveStatus(paramId(req), req.body, currentUser(req));
  sendSuccess(res, leave, 'Leave status updated');
});

export const deleteLeave = catchAsync(async (req: AuthRequest, res: Response) => {
  await leaveService.deleteLeave(paramId(req));
  sendNoContent(res);
});

export const addLeaveComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await leaveService.addComment(paramId(req), currentUser(req), req.body.text);
  sendCreated(res, comment, 'Comment added');
});

export const updateLeaveComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await leaveService.updateComment(paramId(req), req.params.commentId, currentUser(req)._id, req.body.text);
  sendSuccess(res, comment, 'Comment updated');
});

export const deleteLeaveComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await leaveService.deleteComment(paramId(req), req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});

export const copyLeave = catchAsync(async (req: AuthRequest, res: Response) => {
  const doc = await leaveService.leaveCopyService.copyDocument({
    currentUser: currentUser(req), requestId: paramId(req),
    requestType: 'leave', requestTitle: 'Leave Application', recipients: req.body.recipients,
  });
  sendSuccess(res, doc, 'Leave copied');
});

// ═══════════════════════════════════════════════════════════════════════════════
// STAFF STRATEGY
// ═══════════════════════════════════════════════════════════════════════════════
export const getAllStaffStrategies = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await staffStrategyService.getStaffStrategies(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Staff strategies retrieved');
});

export const getStaffStrategyById = catchAsync(async (req: AuthRequest, res: Response) => {
  const strategy = await staffStrategyService.getStaffStrategyById(req.params.id);
  sendSuccess(res, strategy, 'Staff strategy retrieved');
});

export const saveStaffStrategyDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const strategy = await staffStrategyService.saveStaffStrategy(req.body, currentUser(req));
  sendCreated(res, strategy, 'Staff strategy draft saved');
});

export const createStaffStrategy = catchAsync(async (req: AuthRequest, res: Response) => {
  const strategy = await staffStrategyService.createStaffStrategy(
    req.body, currentUser(req), multerFiles(req),
  );
  sendCreated(res, strategy, 'Staff strategy submitted');
});

export const submitStaffStrategy = catchAsync(async (req: AuthRequest, res: Response) => {
  const strategy = await staffStrategyService.submitStaffStrategy(
    req.params.id, currentUser(req), multerFiles(req),
  );
  sendSuccess(res, strategy, 'Staff strategy submitted');
});

export const updateStaffStrategy = catchAsync(async (req: AuthRequest, res: Response) => {
  const strategy = await staffStrategyService.updateStaffStrategy(
    req.params.id, req.body, currentUser(req), multerFiles(req),
  );
  sendSuccess(res, strategy, 'Staff strategy updated');
});

export const updateStaffStrategyStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const pdfFile = multerFile(req);
  const strategy = await staffStrategyService.updateStaffStrategyStatus(
    req.params.id, req.body, currentUser(req), pdfFile,
  );
  sendSuccess(res, strategy, 'Staff strategy status updated');
});

export const deleteStaffStrategy = catchAsync(async (req: AuthRequest, res: Response) => {
  await staffStrategyService.deleteStaffStrategy(req.params.id);
  sendNoContent(res);
});

export const addStaffStrategyComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await staffStrategyService.addComment(req.params.id, currentUser(req), req.body.text);
  sendCreated(res, comment, 'Comment added');
});

export const updateStaffStrategyComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await staffStrategyService.updateComment(req.params.id, req.params.commentId, currentUser(req)._id, req.body.text);
  sendSuccess(res, comment, 'Comment updated');
});

export const deleteStaffStrategyComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await staffStrategyService.deleteComment(req.params.id, req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});

export const copyStaffStrategy = catchAsync(async (req: AuthRequest, res: Response) => {
  const doc = await staffStrategyService.staffStrategyCopyService.copyDocument({
    currentUser: currentUser(req), requestId: req.params.id,
    requestType: 'staffStrategy', requestTitle: 'Staff Strategy', recipients: req.body.recipients,
  });
  sendSuccess(res, doc, 'Staff strategy copied');
});

// ═══════════════════════════════════════════════════════════════════════════════
// APPRAISAL
// ═══════════════════════════════════════════════════════════════════════════════
export const getAppraisalStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await appraisalService.getAppraisalStats(currentUser(req));
  sendSuccess(res, stats, 'Appraisal stats retrieved');
});

export const getAllAppraisals = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await appraisalService.getAppraisals(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Appraisals retrieved');
});

export const getAppraisalById = catchAsync(async (req: AuthRequest, res: Response) => {
  const appraisal = await appraisalService.getAppraisalById(req.params.id);
  sendSuccess(res, appraisal, 'Appraisal retrieved');
});

export const saveAppraisalDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const appraisal = await appraisalService.saveAppraisal(req.body, currentUser(req));
  sendCreated(res, appraisal, 'Appraisal draft saved');
});

export const createAppraisal = catchAsync(async (req: AuthRequest, res: Response) => {
  const appraisal = await appraisalService.createAndSubmitAppraisal(req.body, currentUser(req));
  sendCreated(res, appraisal, 'Appraisal submitted');
});

export const submitAppraisal = catchAsync(async (req: AuthRequest, res: Response) => {
  const appraisal = await appraisalService.submitAppraisal(req.params.id, currentUser(req));
  sendSuccess(res, appraisal, 'Appraisal submitted');
});

export const updateAppraisal = catchAsync(async (req: AuthRequest, res: Response) => {
  const appraisal = await appraisalService.updateAppraisal(
    req.params.id, req.body, currentUser(req), multerFiles(req),
  );
  sendSuccess(res, appraisal, 'Appraisal updated');
});

export const updateAppraisalStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const appraisal = await appraisalService.updateAppraisalStatus(
    req.params.id, req.body, currentUser(req),
  );
  sendSuccess(res, appraisal, 'Appraisal status updated');
});

export const updateObjectives = catchAsync(async (req: AuthRequest, res: Response) => {
  const appraisal = await appraisalService.updateObjectives(
    req.params.id, req.body.objectives, currentUser(req),
  );
  sendSuccess(res, appraisal, 'Objectives updated');
});

export const signAppraisal = catchAsync(async (req: AuthRequest, res: Response) => {
  const { signatureType, comments } = req.body;
  const appraisal = await appraisalService.signAppraisal(
    req.params.id, currentUser(req), signatureType, comments,
  );
  sendSuccess(res, appraisal, 'Appraisal signed');
});

export const deleteAppraisal = catchAsync(async (req: AuthRequest, res: Response) => {
  await appraisalService.deleteAppraisal(req.params.id);
  sendNoContent(res);
});

export const addAppraisalComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await appraisalService.addComment(req.params.id, currentUser(req), req.body.text);
  sendCreated(res, comment, 'Comment added');
});

export const updateAppraisalComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await appraisalService.updateComment(req.params.id, req.params.commentId, currentUser(req)._id, req.body.text);
  sendSuccess(res, comment, 'Comment updated');
});

export const deleteAppraisalComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await appraisalService.deleteComment(req.params.id, req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});

// ═══════════════════════════════════════════════════════════════════════════════
// APPRAISAL
// ═══════════════════════════════════════════════════════════════════════════════

// Stats
export const getReportStats = catchAsync(async (req: AuthRequest, res: Response) => {
  const stats = await reportService.getReportStats(currentUser(req));
  sendSuccess(res, stats, 'Report stats retrieved');
});

// List
export const getAllReports = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await reportService.getReports(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Reports retrieved');
});

// Get by ID
export const getReportById = catchAsync(async (req: AuthRequest, res: Response) => {
  const report = await reportService.getReportById(paramId(req));
  sendSuccess(res, report, 'Report retrieved');
});

// Save draft
export const saveReportDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const report = await reportService.saveReportDraft(req.body, currentUser(req));
  sendCreated(res, report, 'Report draft saved');
});

// Create and submit
export const createReport = catchAsync(async (req: AuthRequest, res: Response) => {
  const report = await reportService.submitReport(req.body, currentUser(req));
  sendCreated(res, report, 'Report submitted');
});

// Update
export const updateReport = catchAsync(async (req: AuthRequest, res: Response) => {
  const report = await reportService.updateReport(paramId(req), req.body, currentUser(req));
  sendSuccess(res, report, 'Report updated');
});

// Update status
export const updateReportStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const report = await reportService.updateReportStatus(paramId(req), req.body, currentUser(req));
  sendSuccess(res, report, 'Report status updated');
});

// Delete
export const deleteReport = catchAsync(async (req: AuthRequest, res: Response) => {
  await reportService.deleteReport(paramId(req));
  sendNoContent(res);
});

// Copy
export const copyReport = catchAsync(async (req: AuthRequest, res: Response) => {
  const report = await reportService.reportCopyService.copyDocument({
    currentUser: currentUser(req),
    requestId: paramId(req),
    requestType: 'report',
    requestTitle: 'Report',
    recipients: req.body.recipients,
  });
  sendSuccess(res, report, 'Report copied');
});

// Comments
export const addReportComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await reportService.addReportComment(paramId(req), currentUser(req), req.body.text);
  sendCreated(res, comment, 'Comment added');
});

export const updateReportComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const comment = await reportService.updateReportComment(
    paramId(req), 
    req.params.commentId, 
    currentUser(req)._id, 
    req.body.text
  );
  sendSuccess(res, comment, 'Comment updated');
});

export const deleteReportComment = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await reportService.deleteReportComment(paramId(req), req.params.commentId, currentUser(req));
  sendSuccess(res, result, 'Comment deleted');
});