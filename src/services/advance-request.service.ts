// advance-request.service.ts - Fixed version

import { AdvanceRequest } from "../models";
import { createWorkflowService } from "./shared/workflow-service.factory";
import { BaseQueryParams, CurrentUser } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";

const svc = createWorkflowService({
  model: AdvanceRequest,
  label: "Advance Request",
  requestType: "advanceRequest",
  fileModelName: "AdvanceRequests",
  searchFields: ["arNumber", "department", "createdBy", "status"],
  // NOTE: "createdBy" on the document is an ObjectId ref to a user, but the
  // FilterPanel's "Created By" field collects a free-text name. An exact/regex
  // match against the ref won't work as-is — either switch that filter input
  // to a user picker that supplies an ObjectId, or resolve name -> id lookup
  // before this reaches getAll. Left out of filterableFields below until one
  // of those is decided; it currently only affects the free-text search box.
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "department", type: "regex" },
    { key: "arNumber", type: "regex" },
    // Assumes the doc field to range against is "createdAt" — change if
    // advance requests should be filtered by a different date (e.g. a
    // dedicated "requestDate").
    { key: "dateFrom", type: "dateFrom", field: "createdAt" },
    { key: "dateTo", type: "dateTo", field: "createdAt" },
  ],
  populate: [
    { path: "createdBy", select: "email firstName lastName role" },
    { path: "reviewedBy", select: "email firstName lastName role" },
    { path: "approvedBy", select: "email firstName lastName role" },
    { path: "comments.user", select: "email firstName lastName role" },
    { path: "copiedTo", select: "email firstName lastName role" },
    { path: "project", select: "projectCode accountCodes" },
  ],
});

export const advanceRequestCopyService = svc.copyService;

export const getAdvanceRequestStats = async (user: CurrentUser) => {
  const data = await svc.getStats(user);
  return data;
};

export const getAdvanceRequests = async (params: BaseQueryParams, user: CurrentUser) => {
  const result = await svc.getAll(params, user);
  return result;
};

export const getAdvanceRequestById = async (id: string) => {
  const data = await svc.getById(id);
  return data;
};

export const saveAdvanceRequestDraft = async (data: any, user: CurrentUser) => {
  const result = await svc.saveDraft(data, user);
  return ResponseBuilder.operation(result, "Advance request draft saved successfully");
};

export const submitAdvanceRequest = async (data: any, user: CurrentUser) => {
  const result = await svc.saveAndSubmit(data, user);
  return ResponseBuilder.operation(result, "Advance request submitted successfully");
};

export const updateAdvanceRequest = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.update(id, data, user);
  return ResponseBuilder.operation(result, "Advance request updated successfully");
};

export const updateAdvanceRequestStatus = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.updateStatus(id, data, user);
  return ResponseBuilder.operation(result, "Status updated successfully");
};

export const deleteAdvanceRequest = async (id: string) => {
  const result = await svc.remove(id);
  return ResponseBuilder.operation(result, "Advance request deleted successfully");
};

export const addAdvanceRequestComment = async (id: string, user: CurrentUser, text: string) => {
  const result = await svc.addComment(id, user, text);
  return ResponseBuilder.operation(result, "Comment added successfully");
};

export const updateAdvanceRequestComment = async (id: string, commentId: string, userId: any, text: string) => {
  const result = await svc.updateComment(id, commentId, userId, text);
  return ResponseBuilder.operation(result, "Comment updated successfully");
};

export const deleteAdvanceRequestComment = async (id: string, commentId: string, user: CurrentUser) => {
  const result = await svc.deleteComment(id, commentId, user);
  return ResponseBuilder.operation(result, "Comment deleted successfully");
};

// Alias for backward compatibility
export const saveAdvanceRequest = saveAdvanceRequestDraft;
export const saveAndSendAdvanceRequest = submitAdvanceRequest;
export const addComment = addAdvanceRequestComment;
export const updateComment = updateAdvanceRequestComment;
export const deleteComment = deleteAdvanceRequestComment;