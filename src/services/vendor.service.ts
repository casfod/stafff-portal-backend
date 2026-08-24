// src/services/vendor.service.ts

import { Vendor, IVendor } from "../models/Vendor.model";
import { createWorkflowService } from "./shared/workflow-service.factory";
import { BaseQueryParams, CurrentUser } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";
import { USER_SELECT, validateId } from "./shared/helpers";
import { notifyStatusChange } from "./shared/procurement.helpers";
import { sendVendorWelcomeEmail } from "./notifications/vendor-notification.service";
import { fileService } from "./file.service";
import mongoose from "mongoose";

// ─── Shared factory: list/get/draft/submit/update/delete/comments/copy ──────
const svc = createWorkflowService({
  model: Vendor,
  label: "Vendor",
  requestType: "vendor",
  fileModelName: "Vendors",
  submissionApproverField: "approvedBy",
  notifyApproverOnSubmit: true,
  searchFields: ["businessName", "vendorCode", "email", "contactPerson", "businessRegNumber"],
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "businessState", type: "exact" },
    { key: "businessType", type: "exact" },
    { key: "dateFrom", type: "dateFrom", field: "createdAt" },
    { key: "dateTo", type: "dateTo", field: "createdAt" },
  ],
  populate: [
    { path: "createdBy", select: USER_SELECT },
    { path: "approvedBy", select: USER_SELECT },
    { path: "comments.user", select: USER_SELECT },
    { path: "copiedTo", select: USER_SELECT },
  ],
});

export const vendorCopyService = svc.copyService;

export const getVendorStats = async (user: CurrentUser) => svc.getStats(user);
export const getVendors = async (params: BaseQueryParams, user: CurrentUser) =>
  svc.getAll(params, user);
export const getVendorById = async (id: string) => svc.getById(id);
export const saveVendorDraft = async (data: unknown, user: CurrentUser) =>
  svc.saveDraft(data, user);
export const submitVendor = async (
  data: unknown,
  user: CurrentUser,
) => svc.saveAndSubmit(data, user);
export const updateVendor = async (
  id: string,
  data: unknown,
  user: CurrentUser,
) => svc.update(id, data, user);

// ─── Custom delete function ──────────────────────────────────────────────────
// Only allows deletion of vendors in 'draft' or 'archived' status
export const deleteVendor = async (id: string) => {
  try {
    // Validate the ID format first
    if (!mongoose.Types.ObjectId.isValid(id)) {
      throw new Error(`Invalid vendor ID format: ${id}`);
    }

    // Find the vendor
    const vendor = await Vendor.findById(id);

    const normalizedId = validateId(id, "Vendor");

    if (!vendor) {
      throw new Error(`Vendor with ID "${id}" not found`);
    }
    // Only allow deletion of draft or archived vendors
    if (vendor.status !== 'draft' && vendor.status !== 'archived' && vendor.status !== 'rejected') {
      throw new Error(
        `Cannot delete vendor with status "${vendor.status}". Only draft and archived, rejected, vendors can be deleted.`
      );
    }

    await fileService.deleteFilesByModel("Vendors", normalizedId);
    // Delete the vendor
    const result = await Vendor.findByIdAndDelete(id);
    if (!result) {
      throw new Error(`Vendor with ID "${id}" was deleted by another process`);
    }
    const transformed = transformDocument(result);
    return ResponseBuilder.operation(transformed, "Vendor deleted successfully");
  } catch (error) {
    console.error(`❌ Error deleting vendor ${id}:`, error);
    throw error;
  }
};

// Helper function to transform document
function transformDocument(doc: any): any {
  if (!doc) return null;

  if (doc.toJSON && typeof doc.toJSON === 'function') {
    return doc.toJSON();
  }

  const result = { ...doc };
  if (result._id) {
    result.id = result._id.toString();
    delete result._id;
  }
  delete result.__v;
  return result;
}

export const addVendorComment = async (id: string, user: CurrentUser, text: string) =>
  svc.addComment(id, user, text);

export const updateVendorComment = async (
  id: string,
  commentId: string,
  userId: any,
  text: string
) => svc.updateComment(id, commentId, userId, text);

export const deleteVendorComment = async (id: string, commentId: string, user: CurrentUser) =>
  svc.deleteComment(id, commentId, user);

// ─── Vendor-specific status transition ──────────────────────────────────────

async function checkUniqueFieldsForSubmission(
  data: { businessName?: string; businessRegNumber?: string; email?: string },
  excludeVendorId?: string
): Promise<string[]> {
  const errors: string[] = [];

  const checks: Array<[string | undefined, string, string]> = [
    [data.businessName, "businessName", `An approved vendor with business name "${data.businessName}" already exists.`],
    [data.businessRegNumber, "businessRegNumber", `An approved vendor with registration number "${data.businessRegNumber}" already exists.`],
    [data.email, "email", `An approved vendor with email "${data.email}" already exists.`],
  ];

  for (const [value, field, message] of checks) {
    if (!value) continue;
    const query: Record<string, unknown> = { [field]: value, status: "approved" };
    if (excludeVendorId) query._id = { $ne: excludeVendorId };
    const existing = await Vendor.findOne(query);
    if (existing) errors.push(message);
  }

  return errors;
}

export interface VendorStatusUpdatePayload {
  status: "approved" | "rejected";
  comment?: string;
}

export const updateVendorStatus = async (
  id: string,
  data: VendorStatusUpdatePayload,
  currentUser: CurrentUser
) => {
  const { status, comment } = data;
  const vendor = await Vendor.findById(id);
  if (!vendor) throw new Error("Vendor not found");

  if (status === "approved") {
    const duplicateErrors = await checkUniqueFieldsForSubmission(
      {
        businessName: vendor.businessName,
        businessRegNumber: vendor.businessRegNumber,
        email: vendor.email,
      },
      String(vendor._id)
    );
    if (duplicateErrors.length > 0) {
      throw new Error(`Cannot approve vendor: ${duplicateErrors.join(" ")}`);
    }
  }

  if (comment && comment.trim()) {
    vendor.comments.unshift({
      user: currentUser._id,
      text: comment.trim(),
      edited: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as IVendor["comments"][number]);
  }

  const previousStatus = vendor.status;
  vendor.status = status;

  if (status === "approved") {
    await Vendor.updateMany(
      {
        _id: { $ne: vendor._id },
        $or: [
          { businessName: vendor.businessName },
          { businessRegNumber: vendor.businessRegNumber },
          { email: vendor.email },
        ],
        status: { $in: ["draft", "pending", "rejected"] },
      },
      { $set: { status: "archived" } }
    );
  }

  await vendor.save();

  if (status === 'approved') {
    await sendVendorWelcomeEmail(vendor);
  }

  await sendVendorStatusNotifications({ vendor, previousStatus, newStatus: status, currentUser });

  const populated = await Vendor.findById(vendor._id).populate([
    { path: "createdBy", select: USER_SELECT },
    { path: "approvedBy", select: USER_SELECT },
    { path: "comments.user", select: USER_SELECT },
  ]);

  return ResponseBuilder.operation(populated, `Vendor ${status} successfully`);
};

async function sendVendorStatusNotifications({
  vendor,
  previousStatus,
  newStatus,
  currentUser,
}: {
  vendor: IVendor;
  previousStatus: string;
  newStatus: string;
  currentUser: CurrentUser;
}) {
  if (previousStatus === newStatus) return;

  const creatorId = vendor.createdBy?.toString();
  if (!creatorId || creatorId === currentUser._id.toString()) return;

  // Vendor's single-step approval has no separate "approver" fan-out step
  // beyond the creator notification (unlike PO's dual creator+approver
  // pattern), so notifyApproversUnless covers both outcomes to preserve
  // the original behavior of only calling notifyCreator here. creatorHeader
  // preserves the original, more natural copy instead of the generic
  // "Your Vendor Management is approved" phrasing notifyStatusChange
  // would otherwise produce.
  await notifyStatusChange({
    request: vendor,
    currentUser,
    requestType: "vendor",
    title: "Vendor Management",
    status: newStatus,
    notifyApproversUnless: ["approved", "rejected"],
    creatorHeader:
      newStatus === "approved"
        ? "Your vendor registration has been APPROVED"
        : "Your vendor registration has been REJECTED",
  });
}

// ─── Backward-compatible aliases ────────────────────────────────────────────
export const saveVendor = saveVendorDraft;
export const saveAndSendVendor = submitVendor;
export const addComment = addVendorComment;
export const updateComment = updateVendorComment;
export const deleteComment = deleteVendorComment;