import { TravelRequest } from "../models";
import { createWorkflowService } from "./shared/workflow-service.factory";
import { BaseQueryParams, CurrentUser } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";

const svc = createWorkflowService({
  model: TravelRequest,
  label: "Travel Request",
  requestType: "travelRequest",
  fileModelName: "TravelRequests",
  searchFields: ["trNumber", "staffName", "travelReason", "status"],
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "staffName", type: "regex" },
    { key: "trNumber", type: "regex" },
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

export const travelRequestCopyService = svc.copyService;

export const getTravelRequestStats = async (user: CurrentUser) => {
  const data = await svc.getStats(user);
  return data
};

export const getTravelRequests = async (params: BaseQueryParams, user: CurrentUser) => {
  const result = await svc.getAll(params, user);
  return result
};

export const getTravelRequestById = async (id: string) => {
  const data = await svc.getById(id);
  return data
};

export const saveTravelRequest = async (data: any, user: CurrentUser) => {
  const result = await svc.saveDraft(data, user);
  return ResponseBuilder.operation(result, "Travel request draft saved successfully");
};

export const saveAndSendTravelRequest = async (data: any, user: CurrentUser) => {
  const result = await svc.saveAndSubmit(data, user);
  return ResponseBuilder.operation(result, "Travel request submitted successfully");
};

export const updateTravelRequest = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.update(id, data, user);
  return ResponseBuilder.operation(result, "Travel request updated successfully");
};

export const updateTravelRequestStatus = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.updateStatus(id, data, user);
  return ResponseBuilder.operation(result, `Travel request status updated to ${data.status}`);
};

export const deleteTravelRequest = async (id: string) => {
  const result = await svc.remove(id);
  return ResponseBuilder.operation(result, "Travel request deleted successfully");
};

export const addComment = async (id: string, user: CurrentUser, text: string) => {
  const result = await svc.addComment(id, user, text);
  return ResponseBuilder.operation(result, "Comment added successfully");
};

export const updateComment = async (id: string, commentId: string, userId: any, text: string) => {
  const result = await svc.updateComment(id, commentId, userId, text);
  return ResponseBuilder.operation(result, "Comment updated successfully");
};

export const deleteComment = async (id: string, commentId: string, user: CurrentUser) => {
  const result = await svc.deleteComment(id, commentId, user);
  return ResponseBuilder.operation(result, "Comment deleted successfully");
};