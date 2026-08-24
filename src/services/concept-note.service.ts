// src/services/concept-note.service.ts

import { ConceptNote } from "../models";
import { createWorkflowService } from "./shared/workflow-service.factory";
import { BaseQueryParams, CurrentUser } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";

const svc = createWorkflowService({
  model: ConceptNote,
  label: "Concept Note",
  requestType: "conceptNote",
  fileModelName: "ConceptNote",
  allowAnyReviewer: true, // Allow any staff role to be added as reviewer
  searchFields: ["cnNumber", "activityTitle", "createdBy", "status"],
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "activityTitle", type: "regex" },
    { key: "cnNumber", type: "regex" },
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

export const conceptNoteCopyService = svc.copyService;

export const getConceptNoteStats = async (user: CurrentUser) => {
  const data = await svc.getStats(user);
  return data;
};

export const getAllConceptNotes = async (params: BaseQueryParams, user: CurrentUser) => {
  const result = await svc.getAll(params, user);
  return result;
};

export const getConceptNoteById = async (id: string) => {
  const data = await svc.getById(id);
  return data;
};

export const saveConceptNoteDraft = async (data: any, user: CurrentUser) => {
  const result = await svc.saveDraft(data, user);
  return ResponseBuilder.operation(result, "Concept note draft saved successfully");
};

export const createAndSubmitConceptNote = async (data: any, user: CurrentUser) => {
  // No role validation needed - any staff can be reviewer
  const result = await svc.saveAndSubmit(data, user);
  return ResponseBuilder.operation(result, "Concept note submitted successfully");
};

export const updateConceptNote = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.update(id, data, user);
  return ResponseBuilder.operation(result, "Concept note updated successfully");
};

export const updateConceptNoteStatus = async (id: string, data: any, user: CurrentUser) => {
  const result = await svc.updateStatus(id, data, user);
  return ResponseBuilder.operation(result, "Status updated successfully");
};

export const deleteConceptNote = async (id: string) => {
  const result = await svc.remove(id);
  return ResponseBuilder.operation(result, "Concept note deleted successfully");
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

// Backward compatibility
export const saveConceptNote = saveConceptNoteDraft;
export const createConceptNote = createAndSubmitConceptNote;