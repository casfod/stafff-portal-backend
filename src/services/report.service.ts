// src/services/report.service.ts
import { Report } from "../models";
import { createWorkflowService } from "./shared/workflow-service.factory";
import { BaseQueryParams, CurrentUser } from "./shared/types";

const svc = createWorkflowService({
  model: Report,
  label: "Report",
  requestType: "report",
  fileModelName: "Reports",
  allowAnyReviewer: false,
  searchFields: [
    "reportNumber", 
    "reportTitle", 
    "activityType", 
    "reportType", 
    "status"
  ],
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "activityType", type: "exact" },
    { key: "reportType", type: "exact" },
    { key: "reportNumber", type: "regex" },
    { key: "reportTitle", type: "regex" },
    { key: "dateFrom", type: "dateFrom", field: "createdAt" },
    { key: "dateTo", type: "dateTo", field: "createdAt" },
  ],
  populate: [
    { path: "createdBy", select: "email firstName lastName role" },
    { path: "reviewedBy", select: "email firstName lastName role" },
    { path: "approvedBy", select: "email firstName lastName role" },
    { path: "comments.user", select: "email firstName lastName role" },
    { path: "copiedTo", select: "email firstName lastName role" },
    { path: "project", select: "projectCode projectTitle donor" },
  ],
});

// Export service methods
export const reportCopyService = svc.copyService;

export const getReportStats = async (user: CurrentUser) => {
  return await svc.getStats(user);
};

export const getReports = async (params: BaseQueryParams, user: CurrentUser) => {
  return await svc.getAll(params, user);
};

export const getReportById = async (id: string) => {
  return await svc.getById(id);
};

export const saveReportDraft = async (data: any, user: CurrentUser) => {
  return await svc.saveDraft(data, user);
};

export const submitReport = async (data: any, user: CurrentUser) => {
  return await svc.saveAndSubmit(data, user);
};

export const updateReport = async (id: string, data: any, user: CurrentUser) => {
  return await svc.update(id, data, user);
};

export const updateReportStatus = async (id: string, data: any, user: CurrentUser) => {
  return await svc.updateStatus(id, data, user);
};

export const deleteReport = async (id: string) => {
  return await svc.remove(id);
};

export const addReportComment = async (id: string, user: CurrentUser, text: string) => {
  return await svc.addComment(id, user, text);
};

export const updateReportComment = async (id: string, commentId: string, userId: any, text: string) => {
  return await svc.updateComment(id, commentId, userId, text);
};

export const deleteReportComment = async (id: string, commentId: string, user: CurrentUser) => {
  return await svc.deleteComment(id, commentId, user);
};

// Backward compatibility aliases
export const saveReport = saveReportDraft;
export const saveAndSendReport = submitReport;
export const addComment = addReportComment;
export const updateComment = updateReportComment;
export const deleteComment = deleteReportComment;