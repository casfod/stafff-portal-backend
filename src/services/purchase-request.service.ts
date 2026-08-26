// src/services/purchase-request.service.ts

import { PurchaseRequest } from "../models";
import { createWorkflowService, ReviewStep } from "./shared/workflow-service.factory";
import { BaseQueryParams, CurrentUser } from "./shared/types";
import { notify } from "./notifications/notification.service";

// Define the two-step review process
const reviewSteps: ReviewStep[] = [
  {
    field: 'financeReviewBy',
    statusField: 'financeReviewStatus',
    label: 'Finance Review',
    requiredRoles: ['ADMIN', 'REVIEWER'],
  },
  {
    field: 'procurementReviewBy',
    statusField: 'procurementReviewStatus',
    label: 'Procurement Review',
    requiredRoles: ['ADMIN', 'REVIEWER'],
  },
];

const isApproverAssignmentOnly = (data: unknown): boolean => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) return false;
  const keys = Object.keys(data);
  return keys.length > 0 && keys.every(key => key === 'approvedBy');
};

// Custom status transition for purchase requests
//
// State machine (matches the original purchase-request.service V1 intent):
//   pending  -> at least one of finance/procurement review is not yet approved
//   reviewed -> BOTH finance and procurement reviews are approved, but no
//               final approver (approvedBy) has been assigned yet — the
//               request is awaiting that final decision
//   approved -> both reviews are approved AND a final approver has signed
//               off (approvedBy is set)
//   rejected -> either review was rejected
//
// Note: "reviewed" here intentionally means BOTH sub-reviews are complete,
// not just one. A single approved review is still "pending".
function purchaseRequestStatusTransition(doc: any): string {
  const financeStatus = doc.financeReviewStatus || 'pending';
  const procurementStatus = doc.procurementReviewStatus || 'pending';

  // If any review is rejected, the whole request is rejected
  if (financeStatus === 'rejected' || procurementStatus === 'rejected') {
    return 'rejected';
  }

  const bothReviewsApproved = financeStatus === 'approved' && procurementStatus === 'approved';

  if (bothReviewsApproved) {
    // Both sub-reviews are done. Only move to the terminal "approved" state
    // once a final approver has actually been assigned; otherwise the
    // request is "reviewed" and waiting on that assignment.
    return doc.approvedBy ? 'approved' : 'reviewed';
  }

  // At least one review is still pending/in progress
  return 'pending';
}

// Custom notification for purchase request reviewers
async function notifyPurchaseRequestReviewers(
  doc: any,
  currentUser: CurrentUser,
  requestType: string,
  title: string
) {
  // Use the dedicated purchase request notification method
  await notify.notifyPurchaseRequestReviewers({
    request: doc,
    currentUser,
    requestType,
    title: title,
    header: 'You have been assigned to review this purchase request',
  });
}

// Create the workflow service with multi-step support
const svc = createWorkflowService({
  model: PurchaseRequest,
  label: "Purchase Request",
  requestType: "purchaseRequest",
  fileModelName: "PurchaseRequests",
  allowAnyReviewer: false,
  reviewSteps: reviewSteps,
  customStatusTransition: purchaseRequestStatusTransition,
  skipStatusTransitionOnUpdate: isApproverAssignmentOnly,
  customNotifyReviewers: notifyPurchaseRequestReviewers,
  searchFields: ["pcrNumber", "department", "suggestedSupplier", "createdBy", "status"],
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "department", type: "regex" },
    { key: "pcrNumber", type: "regex" },
    { key: "financeReviewStatus", type: "exact" },
    { key: "procurementReviewStatus", type: "exact" },
    { key: "dateFrom", type: "dateFrom", field: "createdAt" },
    { key: "dateTo", type: "dateTo", field: "createdAt" },
  ],
  populate: [
    { path: "createdBy", select: "email firstName lastName role position" },
    // { path: "reviewedBy", select: "email firstName lastName role position" },
    { path: "approvedBy", select: "email firstName lastName role position" },
    { path: "financeReviewBy", select: "email firstName lastName role position" },
    { path: "procurementReviewBy", select: "email firstName lastName role position" },
    { path: "comments.user", select: "email firstName lastName role position" },
    { path: "copiedTo", select: "email firstName lastName role position" },
    { path: "project", select: "projectCode accountCodes" },
  ],
});

// ─── Export Service Methods ──────────────────────────────────────────────────

export const purchaseRequestCopyService = svc.copyService;

export const getPurchaseRequestStats = async (user: CurrentUser) => {
  return await svc.getStats(user);
};

export const getPurchaseRequests = async (params: BaseQueryParams, user: CurrentUser) => {
  return await svc.getAll(params, user);
};

export const getPurchaseRequestById = async (id: string) => {
  return await svc.getById(id);
};

export const savePurchaseRequestDraft = async (data: any, user: CurrentUser) => {
  return await svc.saveDraft(data, user);
};

export const submitPurchaseRequest = async (data: any, user: CurrentUser) => {
  return await svc.saveAndSubmit(data, user);
};

export const updatePurchaseRequest = async (id: string, data: any, user: CurrentUser) => {
  return await svc.update(id, data, user);
};

// Multi-step specific methods
export const updateFinanceReview = async (id: string, reviewerId: string, user: CurrentUser) => {
  if (!svc.updateReviewStep) {
    throw new Error('Review steps not configured for this service');
  }
  return await svc.updateReviewStep(id, 'financeReviewBy', reviewerId, user);
};

export const updateProcurementReview = async (id: string, reviewerId: string, user: CurrentUser) => {
  if (!svc.updateReviewStep) {
    throw new Error('Review steps not configured for this service');
  }
  return await svc.updateReviewStep(id, 'procurementReviewBy', reviewerId, user);
};

export const getPurchaseRequestReviewStatus = async (id: string) => {
  if (!svc.getReviewStatus) {
    throw new Error('Review steps not configured for this service');
  }
  return await svc.getReviewStatus(id);
};

export const updatePurchaseRequestStatus = async (id: string, data: any, user: CurrentUser) => {
  return await svc.updateStatus(id, data, user);
};

export const deletePurchaseRequest = async (id: string) => {
  return await svc.remove(id);
};

export const addPurchaseRequestComment = async (id: string, user: CurrentUser, text: string) => {
  return await svc.addComment(id, user, text);
};

export const updatePurchaseRequestComment = async (id: string, commentId: string, userId: any, text: string) => {
  return await svc.updateComment(id, commentId, userId, text);
};

export const deletePurchaseRequestComment = async (id: string, commentId: string, user: CurrentUser) => {
  return await svc.deleteComment(id, commentId, user);
};

// ─── Backward Compatibility ──────────────────────────────────────────────────
export const savePurchaseRequest = savePurchaseRequestDraft;
export const saveAndSendPurchaseRequest = submitPurchaseRequest;
export const addComment = addPurchaseRequestComment;
export const updateComment = updatePurchaseRequestComment;
export const deleteComment = deletePurchaseRequestComment;