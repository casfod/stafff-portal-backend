// src/services/staff-strategy.service.ts
import mongoose from "mongoose";
import type { PopulateOptions } from "mongoose";
import { StaffStrategy, IStaffStrategy, User } from "../models";
import { fileService } from "./file.service";
import { simpleStatusUpdateService } from "./status-update.service";
import { BaseCopyService } from "./base-copy.service";
import { notify } from "./notifications/notification.service";
import { addCommentOp, updateCommentOp, deleteCommentOp } from "./shared/comment-ops";
import { filterDeleted, cleanObjectId } from "./shared/helpers";
import { CurrentUser, BaseQueryParams, StatusUpdatePayload } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";
import { userRef, commentUserRef } from "./shared/hr-populate.config";

/**
 * Recursively transform a document and all nested objects/arrays
 * to replace _id with id and remove __v
 */
function transformDocumentRecursive(data: any): any {
  if (!data) return null;
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => transformDocumentRecursive(item));
  }
  
  // Handle non-objects
  if (typeof data !== 'object') {
    return data;
  }
  
  // Handle Mongoose document with toJSON
  if (data.toJSON && typeof data.toJSON === 'function') {
    const json = data.toJSON();
    return transformDocumentRecursive(json);
  }
  
  // Handle plain objects
  const result: any = {};
  
  for (const [key, value] of Object.entries(data)) {
    // Skip __v
    if (key === '__v') continue;
    
    // Convert _id to id
    if (key === '_id') {
      result.id = value?.toString?.() || value;
      continue;
    }
    
    // Recursively transform nested objects and arrays
    result[key] = transformDocumentRecursive(value);
  }
  
  return result;
}

/**
 * Transform document for response (alias for backward compatibility)
 */
function transformDocument(doc: any): any {
  return transformDocumentRecursive(doc);
}

const POPULATE: PopulateOptions[] = [
  userRef("staffId"),
  userRef("createdBy"),
  // `approvedBy` is the working supervisor reference for this workflow
  // (see model comment) — it's what the "Supervisor" field on the detail
  // view and the approval-permission check both key off.
  userRef("approvedBy"),
  commentUserRef,
];

export const staffStrategyCopyService = new BaseCopyService(StaffStrategy, "StaffStrategy");

// ─── List ─────────────────────────────────────────────────────────────────────
export async function getStaffStrategies(params: BaseQueryParams, currentUser: CurrentUser): Promise<any> {
  const { search, sort = "-createdAt", page = 1, limit = 10 } = params;
  const skip = (Number(page) - 1) * Number(limit);

  const filters: Record<string, unknown>[] = [];

  if (search) {
    const re = new RegExp(search.trim().split(/\s+/).join("|"), "i");
    // staffName is no longer stored on the document — resolve matching
    // staff by name/email first, then OR their ids in.
    const matchingStaff = await User.find({
      $or: [{ firstName: re }, { lastName: re }, { email: re }],
    })
      .select("_id")
      .lean();
    filters.push({
      $or: [
        { strategyCode: re },
        { department: re },
        { period: re },
        { status: re },
        ...(matchingStaff.length ? [{ staffId: { $in: matchingStaff.map((u) => u._id) } }] : []),
      ],
    });
  }

  const uid = currentUser._id;
  switch (currentUser.role) {
    case "STAFF":
      filters.push({ $or: [{ createdBy: uid }, { copiedTo: uid }] });
      break;
    case "ADMIN":
      filters.push({ $or: [{ createdBy: uid }, { approvedBy: uid }, { copiedTo: uid }] });
      break;
    case "SUPER-ADMIN":
      filters.push({ $or: [{ status: { $ne: "draft" } }, { createdBy: uid, status: "draft" }, { copiedTo: uid }] });
      break;
    default:
      throw new Error("Invalid user role");
  }

  const query: Record<string, unknown> = filters.length ? { $and: filters } : {};

  const [items, total] = await Promise.all([
    StaffStrategy.find(query)
      .populate(POPULATE)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit)),
    StaffStrategy.countDocuments(query),
  ]);

  const withFiles = await Promise.all(
    items.map(async (doc) => {
      doc.comments = filterDeleted(doc.comments as any) as any;
      const files = await fileService.getFilesByModel("StaffStrategies", String(doc._id));
      // Transform the entire document recursively
      const transformed = transformDocument(doc);
      return { ...transformed, files };
    })
  );

  const pagination = ResponseBuilder.getPaginationMeta(Number(page), Number(limit), total);
  return ResponseBuilder.list(withFiles, pagination, "Staff strategies retrieved successfully");
}

// ─── Get by ID ────────────────────────────────────────────────────────────────
export async function getStaffStrategyById(id: string): Promise<any> {
  const doc = await StaffStrategy.findById(cleanObjectId(id))
    .populate(POPULATE)
    .lean();
  if (!doc) throw new Error("Staff Strategy not found");

  (doc as any).comments = filterDeleted((doc as any).comments ?? []);
  const files = await fileService.getFilesByModel("StaffStrategies", id);
  // Transform the entire document recursively
  const transformed = transformDocument(doc);
  return ResponseBuilder.single({ ...transformed, files }, "Staff strategy retrieved successfully");
}

// ─── Save draft ───────────────────────────────────────────────────────────────
export async function saveStaffStrategy(data: Partial<IStaffStrategy>, currentUser: CurrentUser): Promise<any> {
  if (!data.accountabilityAreas?.length) throw new Error("At least one accountability area is required");

  const doc = new StaffStrategy({
    ...data,
    staffId: currentUser._id,
    createdBy: currentUser._id,
    status: "draft",
  });
  await doc.save();
  await doc.populate(POPULATE);
  const transformed = transformDocument(doc);
  return ResponseBuilder.operation(transformed, "Staff strategy draft saved successfully");
}

// ─── Submit (draft → pending) ─────────────────────────────────────────────────
export async function submitStaffStrategy(
  id: string,
  currentUser: CurrentUser,
  files: Express.Multer.File[] = []
): Promise<any> {
  const cleanId = cleanObjectId(id);
  const doc = await StaffStrategy.findById(cleanId);
  if (!doc) throw new Error("Staff Strategy not found");

  const canSubmit =
    doc.createdBy.toString() === currentUser._id.toString() ||
    ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);
  if (!canSubmit) throw new Error("You don't have permission to submit this strategy");
  if (!doc.approvedBy) throw new Error("Approver is required before submission");

  doc.status = "pending";
  await doc.save();

  if (files.length) await fileService.handleFileUploads(files, String(doc._id), "StaffStrategies");

  notify
    .notifyApprovers({
      request: doc,
      currentUser,
      requestType: "staffStrategy",
      title: "Staff Strategy",
      header: "You have been assigned a staff strategy for approval",
    })
    .catch(console.error);

  await doc.populate(POPULATE);
  const filesData = await fileService.getFilesByModel("StaffStrategies", cleanId);
  const transformed = transformDocument(doc);
  return ResponseBuilder.operation({ ...transformed, files: filesData }, "Staff strategy submitted successfully");
}

// ─── Create and submit ────────────────────────────────────────────────────────
export async function createStaffStrategy(
  data: Partial<IStaffStrategy>,
  currentUser: CurrentUser,
  files: Express.Multer.File[] = []
): Promise<any> {
  if (!data.accountabilityAreas?.length) throw new Error("At least one accountability area is required");

  const approvedBy = (data as any).approvedBy ?? currentUser.employmentInfo?.jobDetails?.supervisorId;
  if (!approvedBy) throw new Error("Approver (approvedBy) is required");

  const doc = new StaffStrategy({
    ...data,
    staffId: currentUser._id,
    createdBy: currentUser._id,
    status: "pending",
    approvedBy,
  });
  await doc.save();

  if (files.length) await fileService.handleFileUploads(files, String(doc._id), "StaffStrategies");

  notify
    .notifyApprovers({
      request: doc,
      currentUser,
      requestType: "staffStrategy",
      title: "Staff Strategy",
      header: "You have been assigned a staff strategy for approval",
    })
    .catch(console.error);

  await doc.populate(POPULATE);
  const filesData = await fileService.getFilesByModel("StaffStrategies", String(doc._id));
  const transformed = transformDocument(doc);
  return ResponseBuilder.operation({ ...transformed, files: filesData }, "Staff strategy created and submitted successfully");
}

// ─── Update ───────────────────────────────────────────────────────────────────
export async function updateStaffStrategy(
  id: string,
  data: Partial<IStaffStrategy> & { comment?: string },
  currentUser: CurrentUser,
  files: Express.Multer.File[] = []
): Promise<any> {
  const cleanId = cleanObjectId(id);
  const existing = await StaffStrategy.findById(cleanId);
  if (!existing) throw new Error("Staff Strategy not found");

  if (["approved", "rejected"].includes(existing.status)) {
    throw new Error("Cannot update an approved or rejected Staff Strategy");
  }

  const canUpdate =
    existing.createdBy.toString() === currentUser._id.toString() ||
    ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);
  if (!canUpdate) throw new Error("You don't have permission to update this strategy");

  if (data.comment) {
    if (!existing.comments) (existing as any).comments = [];
    (existing.comments as any[]).unshift({
      user: currentUser._id,
      text: data.comment,
      edited: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    (data as any).comments = existing.comments;
  }

  if ((data as any).staffId) (data as any).staffId = cleanObjectId((data as any).staffId);
  if ((data as any).approvedBy) (data as any).approvedBy = cleanObjectId((data as any).approvedBy);

  const updated = await StaffStrategy.findByIdAndUpdate(cleanId, data, {
    new: true,
    runValidators: true,
  }).populate(POPULATE);
  if (!updated) throw new Error("Staff Strategy not found");

  if (files.length) await fileService.handleFileUploads(files, String(updated._id), "StaffStrategies");

  const filesData = await fileService.getFilesByModel("StaffStrategies", cleanId);
  const transformed = transformDocument(updated);
  return ResponseBuilder.operation({ ...transformed, files: filesData }, "Staff strategy updated successfully");
}

// ─── Status update ────────────────────────────────────────────────────────────
export async function updateStaffStrategyStatus(
  id: string,
  data: StatusUpdatePayload,
  currentUser: CurrentUser,
  pdfFile?: Express.Multer.File
): Promise<any> {
  const cleanId = cleanObjectId(id);
  const updated = await simpleStatusUpdateService.updateStatus({
    Model: StaffStrategy,
    id: cleanId,
    data,
    currentUser,
    requestType: "staffStrategy",
    title: "Staff Strategy",
  });

  if (pdfFile) await fileService.handleFileUploads([pdfFile], updated._id.toString(), "StaffStrategies");

  await updated.populate(POPULATE);
  const filesData = await fileService.getFilesByModel("StaffStrategies", cleanId);
  const transformed = transformDocument(updated);
  return ResponseBuilder.operation({ ...transformed, files: filesData }, `Staff strategy ${data.status} successfully`);
}

// ─── Delete (drafts only) ─────────────────────────────────────────────────────
export async function deleteStaffStrategy(id: string): Promise<any> {
  const cleanId = cleanObjectId(id);
  const doc = await StaffStrategy.findById(cleanId);
  if (!doc) throw new Error("Staff Strategy not found");
  if (doc.status !== "draft") throw new Error("Only draft strategies can be deleted");

  await fileService.deleteFilesByModel("StaffStrategies", cleanId);
  const result = await StaffStrategy.findByIdAndDelete(cleanId);
  const transformed = transformDocument(result);
  return ResponseBuilder.operation(transformed, "Staff strategy deleted successfully");
}

// ─── Comments ─────────────────────────────────────────────────────────────────
export const addComment = async (id: string, currentUser: CurrentUser, text: string) => {
  const result = await addCommentOp(StaffStrategy, id, currentUser, text, (doc, uid) => {
    const s = uid.toString();
    return (
      doc.createdBy?.toString() === s ||
      doc.approvedBy?.toString() === s ||
      ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role)
    );
  });
  const transformed = transformDocument(result);
  return ResponseBuilder.operation(transformed, "Comment added successfully");
};

export const updateComment = async (
  id: string,
  commentId: string,
  userId: mongoose.Types.ObjectId,
  text: string
) => {
  const result = await updateCommentOp(StaffStrategy, id, commentId, userId, text);
  const transformed = transformDocument(result);
  return ResponseBuilder.operation(transformed, "Comment updated successfully");
};

export const deleteComment = async (id: string, commentId: string, currentUser: CurrentUser) => {
  const result = await deleteCommentOp(StaffStrategy, id, commentId, currentUser);
  const transformed = transformDocument(result);
  return ResponseBuilder.operation(transformed, "Comment deleted successfully");
};