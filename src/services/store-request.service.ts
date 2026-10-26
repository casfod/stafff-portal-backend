import { StoreRequest } from "../models";
import { createWorkflowService } from "./shared/workflow-service.factory";
import { BaseQueryParams, CurrentUser } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";
import { AppError } from "../utils/AppError";

const svc = createWorkflowService({
  model: StoreRequest,
  label: "Store Request",
  requestType: "storeRequest",
  fileModelName: "StoreRequest",
  searchFields: ["srCode", "destination", "warehouse", "requestType", "status"],
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "requestType", type: "exact" },
    { key: "srCode", type: "regex" },
    { key: "dateFrom", type: "dateFrom", field: "createdAt" },
    { key: "dateTo", type: "dateTo", field: "createdAt" },
  ],
  populate: [
    { path: "createdBy", select: "email firstName lastName role" },
    { path: "reviewedBy", select: "email firstName lastName role" },
    { path: "approvedBy", select: "email firstName lastName role" },
    { path: "comments.user", select: "email firstName lastName role" },
    { path: "copiedTo", select: "email firstName lastName role" },
    { path: "recipient", select: "email firstName lastName role" },
    { path: "warehouseOfficer", select: "firstName lastName" },
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

const reserveReturnRequestSource = async (data: any, user: CurrentUser): Promise<string | undefined> => {
  if (data?.requestType !== "return") return undefined;
  if (!data.returnedRequestId) {
    throw new AppError("A source store request is required for a return request", 400);
  }

  const sourceRequest = await StoreRequest.findById(data.returnedRequestId)
    .select("status createdBy requestType isReturned returnedRequestId")
    .lean();
  if (!sourceRequest) {
    throw new AppError("Source store request not found", 404);
  }
  if (sourceRequest.requestType !== "dispatch") {
    throw new AppError("Return requests must be linked to a dispatch request", 400);
  }
  if (sourceRequest.status !== "approved") {
    throw new AppError("Only approved store requests can have return requests", 400);
  }
  if (String(sourceRequest.createdBy) !== user._id.toString()) {
    throw new AppError("Only the creator can create a return request", 403);
  }

  const reserved = await StoreRequest.findOneAndUpdate(
    {
      _id: data.returnedRequestId,
      requestType: "dispatch",
      status: "approved",
      createdBy: user._id,
      isReturned: { $ne: true },
      returnedRequestId: null,
    },
    { $set: { isReturned: true } },
    { new: true, projection: { _id: 1 } },
  ).lean();

  if (!reserved) {
    throw new AppError("A return request has already been created for this dispatch request", 409);
  }

  return String(reserved._id);
};

const createStoreRequestWithReturnSource = async (
  data: any,
  user: CurrentUser,
  createRequest: () => Promise<any>,
) => {
  const sourceRequestId = await reserveReturnRequestSource(data, user);
  let result: any;

  try {
    result = await createRequest();
  } catch (error) {
    if (sourceRequestId) {
      const persistedReturn = await StoreRequest.findOne({
        requestType: "return",
        returnedRequestId: sourceRequestId,
        createdBy: user._id,
      })
        .select("_id")
        .lean();

      if (persistedReturn) {
        await StoreRequest.updateOne(
          { _id: sourceRequestId, isReturned: true, returnedRequestId: null },
          { $set: { returnedRequestId: persistedReturn._id } },
        );
      } else {
        await StoreRequest.updateOne(
          { _id: sourceRequestId, isReturned: true, returnedRequestId: null },
          { $set: { isReturned: false } },
        );
      }
    }
    throw error;
  }

  if (sourceRequestId) {
    const createdRequest = result?.data?.data ?? result?.data ?? result;
    const returnRequestId = createdRequest?.id ?? createdRequest?._id;
    if (returnRequestId) {
      await StoreRequest.updateOne(
        { _id: sourceRequestId, isReturned: true, returnedRequestId: null },
        { $set: { returnedRequestId: returnRequestId } },
      );
    }
  }

  return result;
};

export const saveStoreRequestDraft = async (data: any, user: CurrentUser) => {
  const result = await createStoreRequestWithReturnSource(data, user, () => svc.saveDraft(data, user));
  return ResponseBuilder.operation(result, "Store request draft submitted successfully");
};

export const submitStoreRequest = async (data: any, user: CurrentUser) => {
  const result = await createStoreRequestWithReturnSource(data, user, () => svc.saveAndSubmit(data, user));
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