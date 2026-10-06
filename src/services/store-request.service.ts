import { StoreRequest } from "../models";
import { createWorkflowService } from "./shared/workflow-service.factory";
import { BaseQueryParams, CurrentUser } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";

const svc = createWorkflowService({
  model: StoreRequest,
  label: "Store Request",
  requestType: "storeRequest",
  fileModelName: "StoreRequests",
  searchFields: ["srNumber", "staffName", "status"],
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "staffName", type: "regex" },
    { key: "srNumber", type: "regex" },
    { key: "dateFrom", type: "dateFrom", field: "createdAt" },
    { key: "dateTo", type: "dateTo", field: "createdAt" },
  ],
  populate: [
    { path: "createdBy", select: "email firstName lastName role" },
    { path: "reviewedBy", select: "email firstName lastName role" },
    { path: "approvedBy", select: "email firstName lastName role" },
    { path: "comments.user", select: "email firstName lastName role" },
    { path: "copiedTo", select: "email firstName lastName role" },
    { path: "recipient", select: "email firstName lastName role" }
  ],
});

// ─── Re-export with consistent naming ─────────────────────────────────────────
export const storeRequestCopyService = svc.copyService;

export const getStoreRequestStats = async (user: CurrentUser) => {
  const data = await svc.getStats(user);
  return data
};

export const getStoreRequests = async (params: BaseQueryParams, user: CurrentUser) => {
  const result = await svc.getAll(params, user);
  return result
};

export const getStoreRequestById = async (id: string) => {
  const data = await svc.getById(id);
  return data
};

export const saveStoreRequestDraft = async (data: any, user: CurrentUser) => {
  const result = await svc.saveDraft(data, user);
  return ResponseBuilder.operation(result, "Store request draft submitted successfully");
};

export const submitStoreRequest = async (data: any, user: CurrentUser) => {
  const result = await svc.saveAndSubmit(data, user);
  return ResponseBuilder.operation(result, "Store request submitted successfully");
};

export const updateStoreRequest = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.update(id, data, user);
  return ResponseBuilder.operation(result, "Store request updated successfully");
};

export const updateStoreRequestStatus = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.updateStatus(id, data, user);
  return ResponseBuilder.operation(result, `Store request status updated to ${data.status}`);
};

export const deleteStoreRequest = async (id: string) => {
  const result = await svc.remove(id);
  return ResponseBuilder.operation(result, "Store request deleted successfully");
};

export const addStoreRequestComment = async (id: string, user: CurrentUser, text: string) => {
  const result = await svc.addComment(id, user, text);
  return ResponseBuilder.operation(result, "Comment added successfully");
};

export const updateStoreRequestComment = async (id: string, commentId: string, userId: any, text: string) => {
  const result = await svc.updateComment(id, commentId, userId, text);
  return ResponseBuilder.operation(result, "Comment updated successfully");
};

export const deleteStoreRequestComment = async (id: string, commentId: string, user: CurrentUser) => {
  const result = await svc.deleteComment(id, commentId, user);
  return ResponseBuilder.operation(result, "Comment deleted successfully");
};

// ─── Alias for backward compatibility ─────────────────────────────────────────
export const saveStoreRequest = saveStoreRequestDraft;
export const saveAndSendStoreRequest = submitStoreRequest;
export const addComment = addStoreRequestComment;
export const updateComment = updateStoreRequestComment;
export const deleteComment = deleteStoreRequestComment;