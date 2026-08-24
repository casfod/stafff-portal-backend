import mongoose from "mongoose";
import type { PopulateOptions } from "mongoose";
import { Leave, ILeave } from "../models";
import { fileService } from "./file.service";
import { statusUpdateService } from "./status-update.service";
import { BaseCopyService } from "./base-copy.service";
import { notify } from "./notifications/notification.service";
import { addCommentOp, updateCommentOp, deleteCommentOp } from "./shared/comment-ops";
import { filterDeleted } from "./shared/helpers";
import { CurrentUser, BaseQueryParams, StatusUpdatePayload } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";
import type { LeaveType } from "../models/Leave.model";
import {
  LEAVE_TYPE_CONFIG,
  calculateDaysBetween,
  validateLeaveApplication,
  updateLeaveBalances,
  buildLeaveListQuery,
  buildLeaveDraftData,
  getOrCreateLeaveBalance,
} from "./leave.helpers";

export { LEAVE_TYPE_CONFIG, calculateDaysBetween, validateLeaveApplication } from "./leave.helpers";

export const leaveCopyService = new BaseCopyService(Leave, "Leave");

const POPULATE: PopulateOptions[] = [
  { path: "user", select: "email firstName lastName role" },
  { path: "approvedBy", select: "email firstName lastName role" },
  { path: "createdBy", select: "email firstName lastName role" },
  { path: "comments.user", select: "email firstName lastName role" },
  { path: "copiedTo", select: "email firstName lastName role" },
];

// ─── Stats ────────────────────────────────────────────────────────────────────
export async function getLeaveStats(currentUser: CurrentUser): Promise<any> {
  const match: Record<string, unknown> = { status: { $ne: "draft" } };
  if (currentUser.role !== "SUPER-ADMIN") match.user = currentUser._id;

  const [stats] = await Leave.aggregate([
    { $match: match },
    {
      $facet: {
        totalRequests: [{ $count: "count" }],
        totalApprovedRequests: [{ $match: { status: "approved" } }, { $count: "count" }],
        totalPendingRequests: [{ $match: { status: "pending" } }, { $count: "count" }],
        totalReviewedRequests: [{ $match: { status: "reviewed" } }, { $count: "count" }],
        totalRejectedRequests: [{ $match: { status: "rejected" } }, { $count: "count" }],
        totalDaysApproved: [
          { $match: { status: "approved" } },
          { $group: { _id: null, total: { $sum: "$totalDaysApplied" } } },
        ],
      },
    },
  ]);

  return ResponseBuilder.stats(
    {
      totalRequests: stats.totalRequests[0]?.count ?? 0,
      totalApprovedRequests: stats.totalApprovedRequests[0]?.count ?? 0,
      totalPendingRequests: stats.totalPendingRequests[0]?.count ?? 0,
      totalReviewedRequests: stats.totalReviewedRequests[0]?.count ?? 0,
      totalRejectedRequests: stats.totalRejectedRequests[0]?.count ?? 0,
      totalDaysApproved: stats.totalDaysApproved[0]?.total ?? 0,
    },
    "Leave statistics retrieved successfully"
  );
}

export async function getUserLeaveBalance(userId: mongoose.Types.ObjectId): Promise<any> {
  const data = await getOrCreateLeaveBalance(userId);
  return ResponseBuilder.single(data, "Leave balance retrieved successfully");
}

// ─── List ─────────────────────────────────────────────────────────────────────
export async function getAllLeaves(params: BaseQueryParams, currentUser: CurrentUser): Promise<any> {
  const { search, sort = "-createdAt", page = 1, limit = 20 } = params;
  const skip = (Number(page) - 1) * Number(limit);
  const query = buildLeaveListQuery({ search }, currentUser);

  const [items, total] = await Promise.all([
    Leave.find(query)
      .populate(POPULATE)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit)),
    Leave.countDocuments(query),
  ]);

  const withFiles = await Promise.all(
    items.map(async (doc) => {
      doc.comments = filterDeleted(doc.comments as any) as any;
      const files = await fileService.getFilesByModel("Leaves", String(doc._id));
      return { ...doc.toJSON(), files };
    })
  );

  const pagination = ResponseBuilder.getPaginationMeta(Number(page), Number(limit), total);
  return ResponseBuilder.list(withFiles, pagination, "Leave applications retrieved successfully");
}

// ─── Save draft ───────────────────────────────────────────────────────────────
export async function saveLeaveDraft(currentUser: CurrentUser, data: Partial<ILeave>): Promise<any> {
  const draftData = buildLeaveDraftData(currentUser, data);
  const leave = new Leave(draftData);
  await leave.save();
  return ResponseBuilder.operation(leave, "Leave draft saved successfully");
}

// ─── Create and submit ────────────────────────────────────────────────────────
export async function createLeaveApplication(
  currentUser: CurrentUser,
  data: Partial<ILeave>,
  files: Express.Multer.File[] = []
): Promise<any> {
  if (!data.approvedBy) throw new Error("ApprovedBy field is required for submission.");
  if (!data.leaveType || !LEAVE_TYPE_CONFIG[data.leaveType]) throw new Error("Invalid leave type");

  const config = LEAVE_TYPE_CONFIG[data.leaveType];
  const totalDays = calculateDaysBetween(data.startDate!, data.endDate!, config.isCalendarDays);

  const { availableBalance } = await validateLeaveApplication(currentUser._id, data.leaveType, totalDays);

  const leave = new Leave({
    ...data,
    user: currentUser._id,
    staffName: `${currentUser.firstName} ${currentUser.lastName}`,
    staffRole: currentUser.role,
    totalDaysApplied: totalDays,
    leaveBalanceAtApplication: availableBalance,
    createdBy: currentUser._id,
    leaveTypeConfig: {
      maxDays: config.maxDays,
      description: config.description,
      isCalendarDays: config.isCalendarDays,
    },
    status: "pending",
  });

  await leave.save();
  await updateLeaveBalances(String(leave._id), "pending", null);

  if (files.length) await fileService.handleFileUploads(files, String(leave._id), "Leaves");

  notify
    .notifyApprovers({
      request: leave,
      currentUser,
      requestType: "leave",
      title: "Leave Application",
      header: "You have been assigned a leave application to Approve",
    })
    .catch(console.error);

  return ResponseBuilder.operation(leave, "Leave application submitted successfully");
}

// ─── Submit a draft ───────────────────────────────────────────────────────────
export async function submitDraft(draftId: string, currentUser: CurrentUser): Promise<any> {
  const draft = await Leave.findById(draftId);
  if (!draft) throw new Error("Draft not found");
  if (draft.status !== "draft") throw new Error("This is not a draft");
  if (draft.user.toString() !== currentUser._id.toString()) {
    throw new Error("You can only submit your own drafts");
  }

  const required = ["leaveType", "startDate", "endDate", "reasonForLeave", "reviewedBy"] as const;
  const missing = required.filter((f) => !(draft as any)[f]);
  if (missing.length) throw new Error(`Cannot submit draft. Missing: ${missing.join(", ")}`);

  if (draft.leaveType && draft.totalDaysApplied) {
    await validateLeaveApplication(draft.user as any, draft.leaveType, draft.totalDaysApplied);
  }

  draft.status = "pending";
  await draft.save();
  await updateLeaveBalances(draftId, "pending", "draft");

  notify
    .notifyReviewers({
      request: draft,
      currentUser,
      requestType: "leave",
      title: "Leave Application",
      header: "You have been assigned a leave application to review",
    })
    .catch(console.error);

  return ResponseBuilder.operation(draft, "Leave draft submitted successfully");
}

// ─── Get by ID ────────────────────────────────────────────────────────────────
export async function getLeaveById(id: string): Promise<any> {
  const leave = await Leave.findById(id).populate(POPULATE).lean();
  if (!leave) throw new Error("Leave application not found");

  (leave as any).comments = filterDeleted((leave as any).comments ?? []);
  const files = await fileService.getFilesByModel("Leaves", id);
  return ResponseBuilder.single({ ...leave, files }, "Leave application retrieved successfully");
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateLeaveApplication(
  id: string,
  data: Partial<ILeave>,
  currentUser: CurrentUser,
  files: Express.Multer.File[] = []
): Promise<any> {
  const leave = await Leave.findById(id);
  if (!leave) throw new Error("Leave application not found");

  if (!["draft", "pending", "reviewed"].includes(leave.status)) {
    throw new Error(`Cannot update leave in ${leave.status} status`);
  }

  const canUpdate =
    leave.user.toString() === currentUser._id.toString() ||
    currentUser.role === "SUPER-ADMIN" ||
    leave.approvedBy?.toString() === currentUser._id.toString();

  if (!canUpdate) throw new Error("You don't have permission to update this leave");

  if (data.leaveType || data.startDate || data.endDate) {
    const type = data.leaveType ?? leave.leaveType;
    const start = data.startDate ?? leave.startDate;
    const end = data.endDate ?? leave.endDate;
    if (type && start && end) {
      const cfg = LEAVE_TYPE_CONFIG[type];
      const newDays = calculateDaysBetween(start, end, cfg.isCalendarDays);
      (data as any).totalDaysApplied = newDays;

      if (leave.status !== "draft") {
        const diff = newDays - leave.totalDaysApplied;
        if (diff > 0) await validateLeaveApplication(leave.user as any, type, diff);
      }
    }
  }

  const oldStatus = leave.status;
  Object.assign(leave, data);
  await leave.save();

  if (files.length) await fileService.handleFileUploads(files, String(leave._id), "Leaves");

  if (oldStatus !== "reviewed" && leave.status === "reviewed") {
    notify
      .notifyApprovers({
        request: leave,
        currentUser,
        requestType: "leave",
        title: "Leave Application",
        header: "A leave application has been reviewed and needs your approval",
      })
      .catch(console.error);
  }

  return ResponseBuilder.operation(leave, "Leave application updated successfully");
}

// ─── Update status ────────────────────────────────────────────────────────────
export async function updateLeaveStatus(
  id: string,
  data: StatusUpdatePayload,
  currentUser: CurrentUser
): Promise<any> {
  const leave = await Leave.findById(id);
  if (!leave) throw new Error("Leave application not found");

  const oldStatus = leave.status;
  const updated = await statusUpdateService.updateRequestStatusWithComment({
    Model: Leave,
    id,
    data,
    currentUser,
    requestType: "leave",
    title: "Leave Application",
  });

  await updateLeaveBalances(id, updated.status, oldStatus);
  return ResponseBuilder.operation(updated, `Leave status updated to ${updated.status}`);
}

// ─── Delete (soft) ────────────────────────────────────────────────────────────
export async function deleteLeave(id: string): Promise<any> {
  const leave = await Leave.findById(id);
  if (!leave) throw new Error("Leave application not found");

  if (["pending", "reviewed", "approved"].includes(leave.status)) {
    await updateLeaveBalances(id, "deleted", leave.status);
  }

  await fileService.deleteFilesByModel("Leaves", id);
  leave.isDeleted = true;
  (leave as any).status = "deleted";
  await leave.save();
  return ResponseBuilder.operation(leave, "Leave application deleted successfully");
}

// ─── Balance history ──────────────────────────────────────────────────────────
export async function getLeaveBalanceHistory(userId: string, leaveType?: LeaveType): Promise<any> {
  const match: Record<string, any> = { user: new mongoose.Types.ObjectId(userId) };
  if (leaveType) match.leaveType = leaveType;

  const data = await Leave.aggregate([
    { $match: match },
    { $sort: { createdAt: -1 } },
    {
      $project: {
        leaveNumber: 1,
        leaveType: 1,
        totalDaysApplied: 1,
        status: 1,
        createdAt: 1,
        amountAccruedLeave: 1,
        leaveBalanceAtApplication: 1,
      },
    },
  ]);

  return ResponseBuilder.list(
    data,
    { page: 1, limit: data.length, total: data.length, pages: 1 },
    "Leave balance history retrieved successfully"
  );
}

// ─── Comments ─────────────────────────────────────────────────────────────────
export const addComment = async (id: string, currentUser: CurrentUser, text: string) => {
  const result = await addCommentOp(Leave, id, currentUser, text, (doc, uid) => {
    const s = uid.toString();
    return (
      doc.user?.toString() === s ||
      doc.copiedTo?.some((c: any) => c.toString() === s) ||
      doc.reviewedBy?.toString() === s ||
      doc.approvedBy?.toString() === s ||
      currentUser.role === "SUPER-ADMIN"
    );
  });
  return ResponseBuilder.operation(result, "Comment added successfully");
};

export const updateComment = async (
  id: string,
  commentId: string,
  userId: mongoose.Types.ObjectId,
  text: string
) => {
  const result = await updateCommentOp(Leave, id, commentId, userId, text);
  return ResponseBuilder.operation(result, "Comment updated successfully");
};

export const deleteComment = async (id: string, commentId: string, currentUser: CurrentUser) => {
  const result = await deleteCommentOp(Leave, id, commentId, currentUser);
  return ResponseBuilder.operation(result, "Comment deleted successfully");
};