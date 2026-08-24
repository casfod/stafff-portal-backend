// src/services/payment-request.service.ts

import { PaymentRequest } from "../models";
import { createWorkflowService } from "./shared/workflow-service.factory";
import { BaseQueryParams, CurrentUser } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";

// NOTE: searchFields/filterableFields/populate below are inferred from the
// sibling request services (advance-request.service.ts, payment-voucher's
// pvNumber/payTo/being/accountCode shape) since PaymentRequest.model.ts
// wasn't available to check against. Verify these field names — prNumber,
// payTo, being, department — actually exist on your PaymentRequest schema
// and adjust if not.
const svc = createWorkflowService({
  model: PaymentRequest,
  label: "Payment Request",
  requestType: "paymentRequest",
  fileModelName: "PaymentRequests",
  searchFields: ["prNumber", "payTo", "being", "department", "status"],
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "department", type: "regex" },
    { key: "prNumber", type: "regex" },
    { key: "dateFrom", type: "dateFrom", field: "createdAt" },
    { key: "dateTo", type: "dateTo", field: "createdAt" },
  ],
  populate: [
    { path: "createdBy", select: "email firstName lastName role" },
    { path: "reviewedBy", select: "email firstName lastName role" },
    { path: "approvedBy", select: "email firstName lastName role" },
    { path: "comments.user", select: "email firstName lastName role" },
    { path: "copiedTo", select: "email firstName lastName role" },
    // { path: "project", select: "projectCode accountCodes" },
  ],
});

export const paymentRequestCopyService = svc.copyService;

export const getPaymentRequestStats = async (user: CurrentUser) => {
  const data = await svc.getStats(user);
  return data;
};

export const getPaymentRequests = async (params: BaseQueryParams, user: CurrentUser) => {
  const result = await svc.getAll(params, user);
  return result;
};

export const getPaymentRequestById = async (id: string) => {
  const data = await svc.getById(id);
  return data;
};

export const savePaymentRequestDraft = async (data: any, user: CurrentUser) => {
  const result = await svc.saveDraft(data, user);
  return ResponseBuilder.operation(result, "Payment request draft saved successfully");
};

export const submitPaymentRequest = async (data: any, user: CurrentUser) => {
  const result = await svc.saveAndSubmit(data, user);
  return ResponseBuilder.operation(result, "Payment request submitted successfully");
};

export const updatePaymentRequest = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.update(id, data, user);
  return ResponseBuilder.operation(result, "Payment request updated successfully");
};

export const updatePaymentRequestStatus = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.updateStatus(id, data, user);
  return ResponseBuilder.operation(result, "Status updated successfully");
};

export const deletePaymentRequest = async (id: string) => {
  const result = await svc.remove(id);
  return ResponseBuilder.operation(result, "Payment request deleted successfully");
};

export const addPaymentRequestComment = async (id: string, user: CurrentUser, text: string) => {
  const result = await svc.addComment(id, user, text);
  return ResponseBuilder.operation(result, "Comment added successfully");
};

export const updatePaymentRequestComment = async (id: string, commentId: string, userId: any, text: string) => {
  const result = await svc.updateComment(id, commentId, userId, text);
  return ResponseBuilder.operation(result, "Comment updated successfully");
};

export const deletePaymentRequestComment = async (id: string, commentId: string, user: CurrentUser) => {
  const result = await svc.deleteComment(id, commentId, user);
  return ResponseBuilder.operation(result, "Comment deleted successfully");
};

// ─── Aliases matching finance.controller.ts's imports ────────────────────────
export const savePaymentRequest = savePaymentRequestDraft;
export const saveAndSendPaymentRequest = submitPaymentRequest;
export const addComment = addPaymentRequestComment;
export const updateComment = updatePaymentRequestComment;
export const deleteComment = deletePaymentRequestComment;