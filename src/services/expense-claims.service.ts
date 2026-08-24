import { ExpenseClaims } from "../models";
import { createWorkflowService } from "./shared/workflow-service.factory";
import { BaseQueryParams, CurrentUser } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";

const svc = createWorkflowService({
  model: ExpenseClaims,
  label: "Expense Claim",
  requestType: "expenseClaim",
  fileModelName: "ExpenseClaims",
  searchFields: ["ecNumber", "staffName", "expenseReason", "status"],
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "staffName", type: "regex" },
    { key: "ecNumber", type: "regex" },
    { key: "dateFrom", type: "dateFrom", field: "createdAt" },
    { key: "dateTo", type: "dateTo", field: "createdAt" },
  ],
  populate: [
    { path: "project", select: "projectCode accountCodes" },
    { path: "createdBy", select: "email firstName lastName role" },
    { path: "reviewedBy", select: "email firstName lastName role" },
    { path: "approvedBy", select: "email firstName lastName role" },
    { path: "comments.user", select: "email firstName lastName role" },
    { path: "copiedTo", select: "email firstName lastName role" },
  ],
});

// ─── Re-export with consistent naming ─────────────────────────────────────────
export const expenseClaimCopyService = svc.copyService;

export const getExpenseClaimStats = async (user: CurrentUser) => {
  const data = await svc.getStats(user);
  return data
};

export const getExpenseClaims = async (params: BaseQueryParams, user: CurrentUser) => {
  const result = await svc.getAll(params, user);
  return result
};

export const getExpenseClaimById = async (id: string) => {
  const data = await svc.getById(id);
  return data
};

export const saveExpenseClaimDraft = async (data: any, user: CurrentUser) => {
  const result = await svc.saveDraft(data, user);
  return ResponseBuilder.operation(result, "Expense claim draft submitted successfully");
};

export const submitExpenseClaim = async (data: any, user: CurrentUser) => {
  const result = await svc.saveAndSubmit(data, user);
  return ResponseBuilder.operation(result, "Expense claim submitted successfully");
};

export const updateExpenseClaim = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.update(id, data, user);
  return ResponseBuilder.operation(result, "Expense claim updated successfully");
};

export const updateExpenseClaimStatus = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.updateStatus(id, data, user);
  return ResponseBuilder.operation(result, `Expense claim status updated to ${data.status}`);
};

export const deleteExpenseClaim = async (id: string) => {
  const result = await svc.remove(id);
  return ResponseBuilder.operation(result, "Expense claim deleted successfully");
};

export const addExpenseClaimComment = async (id: string, user: CurrentUser, text: string) => {
  const result = await svc.addComment(id, user, text);
  return ResponseBuilder.operation(result, "Comment added successfully");
};

export const updateExpenseClaimComment = async (id: string, commentId: string, userId: any, text: string) => {
  const result = await svc.updateComment(id, commentId, userId, text);
  return ResponseBuilder.operation(result, "Comment updated successfully");
};

export const deleteExpenseClaimComment = async (id: string, commentId: string, user: CurrentUser) => {
  const result = await svc.deleteComment(id, commentId, user);
  return ResponseBuilder.operation(result, "Comment deleted successfully");
};

// ─── Alias for backward compatibility ─────────────────────────────────────────
export const saveExpenseClaim = saveExpenseClaimDraft;
export const saveAndSendExpenseClaim = submitExpenseClaim;
export const addComment = addExpenseClaimComment;
export const updateComment = updateExpenseClaimComment;
export const deleteComment = deleteExpenseClaimComment;