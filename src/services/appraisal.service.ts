// src/services/appraisal.service.ts
import mongoose from "mongoose";
import type { PopulateOptions } from "mongoose";
import { Appraisal, IAppraisal, User } from "../models";
import { fileService } from "./file.service";
import { BaseCopyService } from "./base-copy.service";
import { notify } from "./notifications/notification.service";
import { addCommentOp, updateCommentOp, deleteCommentOp } from "./shared/comment-ops";
import { filterDeleted, cleanObjectId } from "./shared/helpers";
import { CurrentUser, BaseQueryParams } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";
import { userRef, commentUserRef } from "./shared/hr-populate.config";

// Recursive transform function to convert _id to id in nested objects and arrays
function transformDocumentRecursive(data: any): any {
  if (!data) return null;
  
  // Handle arrays
  if (Array.isArray(data)) {
    return data.map(item => transformDocumentRecursive(item));
  }
  
  // Handle objects
  if (typeof data === 'object' && data !== null) {
    // Check if it's a Mongoose document with toJSON method
    if (data.toJSON && typeof data.toJSON === 'function') {
      const json = data.toJSON();
      return transformDocumentRecursive(json);
    }
    
    const result: any = {};
    
    // Iterate over all keys
    for (const key of Object.keys(data)) {
      const value = data[key];
      
      // Skip internal mongoose fields
      if (key === '__v') continue;
      
      // Convert _id to id at current level
      if (key === '_id') {
        result.id = value?.toString ? value.toString() : value;
        continue;
      }
      
      // Recursively transform nested values
      result[key] = transformDocumentRecursive(value);
    }
    
    return result;
  }
  
  // Return primitive values as-is
  return data;
}

// Helper function to transform document (convert _id to id)
function transformDocument(doc: any): any {
  if (!doc) return null;
  return transformDocumentRecursive(doc);
}

// Helper to transform array of documents
function transformDocuments(docs: any[]): any[] {
  if (!Array.isArray(docs)) return [];
  return docs.map(doc => transformDocument(doc));
}

const POPULATE_LIST: PopulateOptions[] = [
  userRef("staffId"),
  userRef("supervisorId"),
  userRef("createdBy"),
  commentUserRef,
  { path: "staffStrategy", select: "strategyCode department period" },
  userRef("approvedBy"),
];

const POPULATE_DETAIL: PopulateOptions[] = [
  userRef("staffId"),
  userRef("supervisorId"),
  userRef("createdBy"),
  commentUserRef,
  { path: "staffStrategy", select: "strategyCode department period accountabilityAreas" },
  userRef("approvedBy"),
];

const DEFAULT_PERFORMANCE_AREAS = [
  "Job Knowledge",
  "Judgement",
  "Reliability",
  "Quality & Quantity of Work",
  "Interpersonal and Communication Skills",
  "Teamwork",
].map((area) => ({ area, rating: "Pending", supervisorStatus: "pending" }));

export const appraisalCopyService = new BaseCopyService(Appraisal, "Appraisal");

// ─── List ─────────────────────────────────────────────────────────────────────
export async function getAppraisals(
  params: BaseQueryParams & { status?: string; period?: string },
  currentUser: CurrentUser
): Promise<any> {
  const { search, sort = "-createdAt", page = 1, limit = 10, status, period } = params;
  const skip = (Number(page) - 1) * Number(limit);

  const filters: Record<string, unknown>[] = [];

  if (search) {
    const re = new RegExp(search.trim().split(/\s+/).join("|"), "i");
    // staffName is no longer stored on the document (see model comment) —
    // resolve matching staff by name/email first, then OR their ids in.
    const matchingStaff = await User.find({
      $or: [{ firstName: re }, { lastName: re }, { email: re }],
    })
      .select("_id")
      .lean();
    filters.push({
      $or: [
        { appraisalCode: re },
        { department: re },
        { status: re },
        ...(matchingStaff.length ? [{ staffId: { $in: matchingStaff.map((u) => u._id) } }] : []),
      ],
    });
  }
  if (status) filters.push({ status });
  if (period) filters.push({ appraisalPeriod: period });

  switch (currentUser.role) {
    case "STAFF":
      filters.push({ $or: [{ staffId: currentUser._id }, { createdBy: currentUser._id }] });
      break;
    case "ADMIN":
    case "SUPER-ADMIN":
      if (currentUser.department) filters.push({ department: currentUser.department });
      break;
    default:
      throw new Error("Invalid user role");
  }

  const query: Record<string, unknown> = filters.length ? { $and: filters } : {};

  const [items, total] = await Promise.all([
    Appraisal.find(query)
      .populate(POPULATE_LIST)
      .sort(sort)
      .skip(skip)
      .limit(Number(limit)),
    Appraisal.countDocuments(query),
  ]);

  const withFiles = await Promise.all(
    items.map(async (doc) => {
      doc.comments = filterDeleted(doc.comments as any) as any;
      const files = await fileService.getFilesByModel("Appraisals", String(doc._id));
      const transformed = transformDocument(doc);
      return { ...transformed, files };
    })
  );

  const pagination = ResponseBuilder.getPaginationMeta(Number(page), Number(limit), total);
  return ResponseBuilder.list(withFiles, pagination, "Appraisals retrieved successfully");
}

// ─── Get by ID ────────────────────────────────────────────────────────────────
export async function getAppraisalById(id: string): Promise<any> {
  const doc = await Appraisal.findById(cleanObjectId(id))
    .populate(POPULATE_DETAIL)
    .lean();
  if (!doc) throw new Error("Appraisal not found");

  (doc as any).comments = filterDeleted((doc as any).comments ?? []);
  const files = await fileService.getFilesByModel("Appraisals", id);
  
  // Transform the entire document recursively including nested populated fields
  const transformed = transformDocument(doc);
  
  return ResponseBuilder.single(
    { ...transformed, files }, 
    "Appraisal retrieved successfully"
  );
}

// ─── Build core appraisal data ────────────────────────────────────────────────
// Note: no staff/supervisor lookups here anymore. staffName/position/
// supervisorName used to be snapshotted via two extra User queries per
// create — that's gone. The populated `staffId`/`supervisorId` on read
// already carry name + job title, so there's nothing left to duplicate,
// and nothing that can go stale relative to the User document.
async function buildAppraisalData(data: any, currentUser: CurrentUser, status: "draft" | "pending") {
  if (!data.supervisorId) throw new Error("Supervisor is required");

  const supervisorId = cleanObjectId(data.supervisorId);

  return {
    staffId: currentUser._id,
    department: data.department,
    lengthOfTimeInPosition: data.lengthOfTimeInPosition,
    appraisalPeriod: data.appraisalPeriod,
    dateOfAppraisal: new Date(),
    supervisorId: supervisorId,
    lengthOfTimeSupervised: data.lengthOfTimeSupervised,
    objectives: data.objectives ?? Array(5)
      .fill({ objective: "" })
      .concat([{ objective: "Safeguarding" }]),
    safeguarding: data.safeguarding ?? {
      actionsTaken: "",
      trainingCompleted: "No",
      areasNotUnderstood: [],
      supervisorStatus: "pending",
    },
    performanceAreas: data.performanceAreas?.map((area: any) => ({
      area: area.area,
      rating: area.rating || "Pending",
      supervisorStatus: "pending",
    })) ?? DEFAULT_PERFORMANCE_AREAS,
    overallRating: data.overallRating || "Pending",
    createdBy: currentUser._id,
    status,
    supervisorStatus: "pending",
    approvedBy: supervisorId,
    staffStrategy: data.staffStrategy ? cleanObjectId(data.staffStrategy) : undefined,
    submittedByEmployee: status === "pending",
  };
}

// ─── Save draft ───────────────────────────────────────────────────────────────
export async function saveAppraisal(data: any, currentUser: CurrentUser): Promise<any> {
  const doc = new Appraisal(await buildAppraisalData(data, currentUser, "draft"));
  await doc.save();
  await doc.populate(POPULATE_LIST);
  const transformed = transformDocument(doc);
  return ResponseBuilder.operation(transformed, "Appraisal draft saved successfully");
}

// ─── Create and submit ────────────────────────────────────────────────────────
export async function createAndSubmitAppraisal(data: any, currentUser: CurrentUser): Promise<any> {
  const doc = new Appraisal(await buildAppraisalData(data, currentUser, "pending"));
  await doc.save();

  await notifyApprover(doc, currentUser);

  await doc.populate(POPULATE_LIST);
  const files = await fileService.getFilesByModel("Appraisals", String(doc._id));
  const transformed = transformDocument(doc);
  return ResponseBuilder.operation(
    { ...transformed, files },
    "Appraisal submitted successfully"
  );
}

// ─── Submit existing draft ────────────────────────────────────────────────────
export async function submitAppraisal(id: string, currentUser: CurrentUser): Promise<any> {
  const cleanId = cleanObjectId(id);
  const doc = await Appraisal.findById(cleanId);
  if (!doc) throw new Error("Appraisal not found");

  const isStaff = doc.staffId.toString() === currentUser._id.toString();
  const isAdmin = ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);
  if (!isStaff && !isAdmin) throw new Error("You don't have permission to submit this appraisal");
  if (doc.status !== "draft") throw new Error("Only draft appraisals can be submitted");
  if (!doc.supervisorId) throw new Error("Supervisor is required before submission");
  if (!doc.approvedBy) doc.approvedBy = doc.supervisorId as any;

  doc.status = "pending";
  doc.submittedByEmployee = true;
  await doc.save();

  await notifyApprover(doc, currentUser);

  await doc.populate(POPULATE_LIST);
  const files = await fileService.getFilesByModel("Appraisals", cleanId);
  const transformed = transformDocument(doc);
  return ResponseBuilder.operation(
    { ...transformed, files },
    "Appraisal submitted successfully"
  );
}

// ─── Update status (approve/reject by supervisor) ────────────────────────────
export async function updateAppraisalStatus(
  id: string,
  data: { status: "approved" | "rejected"; comment?: string },
  currentUser: CurrentUser
): Promise<any> {
  const cleanId = cleanObjectId(id);
  const doc = await Appraisal.findById(cleanId);
  if (!doc) throw new Error("Appraisal not found");

  const isSupervisor = doc.supervisorId.toString() === currentUser._id.toString();
  const isAdmin = ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);
  if (!isSupervisor && !isAdmin) throw new Error("You don't have permission to update this appraisal status");
  if (doc.status !== "pending") throw new Error("Only pending appraisals can be approved or rejected");
  if (!["approved", "rejected"].includes(data.status)) throw new Error("Status must be 'approved' or 'rejected'");

  doc.status = data.status;
  doc.submittedBySupervisor = true;
  doc.completedAt = new Date();
  if (data.status === "approved") doc.approvedBy = currentUser._id as any;

  if (data.comment) {
    (doc.comments as any[]).push({
      user: currentUser._id,
      text: data.comment,
      edited: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  await doc.save();

  if (doc.staffId) {
    notify
      .notifyCreator({
        request: doc,
        currentUser,
        requestType: "appraisal",
        title: "Appraisal Status Update",
        header: `Your appraisal has been ${data.status}`,
      })
      .catch(console.error);
  }

  await doc.populate(POPULATE_LIST);
  const files = await fileService.getFilesByModel("Appraisals", cleanId);
  const transformed = transformDocument(doc);
  return ResponseBuilder.operation(
    { ...transformed, files },
    `Appraisal ${data.status} successfully`
  );
}

// ─── Update appraisal content ─────────────────────────────────────────────────
export async function updateAppraisal(
  id: string,
  data: Partial<IAppraisal> & { comment?: string },
  currentUser: CurrentUser,
  files: Express.Multer.File[] = []
): Promise<any> {
  const cleanId = cleanObjectId(id);
  const existing = await Appraisal.findById(cleanId);
  if (!existing) throw new Error("Appraisal not found");

  const isStaff = existing.staffId.toString() === currentUser._id.toString();
  const isSupervisor = existing.supervisorId.toString() === currentUser._id.toString();
  const isAdmin = ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);

  if (!isStaff && !isSupervisor && !isAdmin) throw new Error("You don't have permission to update this appraisal");
  if (["approved", "rejected"].includes(existing.status) && !isAdmin)
    throw new Error("Cannot update an approved or rejected appraisal");

  if (isStaff && !isAdmin) {
    delete (data as any).performanceAreas;
    delete (data as any).supervisorComments;
    delete (data as any).overallRating;
  }
  if (isSupervisor && !isAdmin && data.objectives) {
    (data as any).objectives = (data as any).objectives.map((o: any) => ({
      ...o,
      employeeRating: undefined,
      employeePoints: undefined,
    }));
  }

  if (data.comment) {
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

  for (const f of ["staffId", "supervisorId", "staffStrategy", "approvedBy"] as const) {
    if ((data as any)[f]) (data as any)[f] = cleanObjectId((data as any)[f]);
  }

  const updated = await Appraisal.findByIdAndUpdate(cleanId, data, {
    new: true,
    runValidators: true,
  }).populate(POPULATE_LIST);
  if (!updated) throw new Error("Appraisal not found");

  if (files.length) await fileService.handleFileUploads(files, String(updated._id), "Appraisals");

  const filesData = await fileService.getFilesByModel("Appraisals", cleanId);
  const transformed = transformDocument(updated);
  return ResponseBuilder.operation(
    { ...transformed, files: filesData },
    "Appraisal updated successfully"
  );
}

// ─── Update objectives ────────────────────────────────────────────────────────
export async function updateObjectives(id: string, objectives: any[], currentUser: CurrentUser): Promise<any> {
  const cleanId = cleanObjectId(id);
  const doc = await Appraisal.findById(cleanId);
  if (!doc) throw new Error("Appraisal not found");

  const isStaff = doc.staffId.toString() === currentUser._id.toString();
  const isSupervisor = doc.supervisorId.toString() === currentUser._id.toString();

  if (!isStaff && !isSupervisor) throw new Error("You don't have permission to update objectives");

  for (const newObj of objectives) {
    const existing = (doc.objectives as any[]).find(
      (o: any) => o._id?.toString() === newObj._id?.toString()
    );
    if (!existing) continue;

    if (isStaff && newObj.employeeRating !== undefined) {
      existing.employeeRating = {
        rating: newObj.employeeRating?.rating ?? newObj.employeeRating,
        achievements:
          newObj.employeeRating?.achievements ??
          existing.employeeRating?.achievements ??
          "",
      };
    }
    if (isSupervisor) {
      existing.supervisorRating = newObj.supervisorRating;
    }
  }

  await doc.save();
  const transformed = transformDocument(doc);
  return ResponseBuilder.operation(transformed, "Objectives updated successfully");
}

// ─── Sign appraisal ───────────────────────────────────────────────────────────
export async function signAppraisal(
  id: string,
  currentUser: CurrentUser,
  signatureType: "staff" | "supervisor",
  comments?: string
): Promise<any> {
  const cleanId = cleanObjectId(id);
  const doc = await Appraisal.findById(cleanId);
  if (!doc) throw new Error("Appraisal not found");

  const isStaff = doc.staffId.toString() === currentUser._id.toString();
  const isSupervisor = doc.supervisorId.toString() === currentUser._id.toString();

  if (signatureType === "staff" && !isStaff) throw new Error("Only the staff member can sign as staff");
  if (signatureType === "supervisor" && !isSupervisor) throw new Error("Only the supervisor can sign as supervisor");

  if (signatureType === "staff") {
    doc.signatures.staffSignature = true;
    doc.signatures.staffSignatureDate = new Date();
    if (comments) doc.signatures.staffComments = comments;
  }
  if (signatureType === "supervisor") {
    doc.signatures.supervisorSignature = true;
    doc.signatures.supervisorSignatureDate = new Date();
    if (comments) doc.signatures.hrComments = comments;
  }

  if (doc.signatures.staffSignature && doc.signatures.supervisorSignature) {
    doc.status = "approved";
    doc.completedAt = new Date();
  }

  await doc.save();
  const transformed = transformDocument(doc);
  return ResponseBuilder.operation(transformed, "Appraisal signed successfully");
}

// ─── Stats ────────────────────────────────────────────────────────────────────
export async function getAppraisalStats(currentUser: CurrentUser): Promise<any> {
  const match: Record<string, any> = {};
  if (currentUser.role === "STAFF") match.staffId = currentUser._id;
  else if (currentUser.role === "ADMIN" && currentUser.department) match.department = currentUser.department;

  const [byStatus, [overall]] = await Promise.all([
    Appraisal.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$status",
          count: { $sum: 1 },
          avgEmployeeScore: { $avg: "$scores.employeeTotal" },
          avgSupervisorScore: { $avg: "$scores.supervisorTotal" },
        },
      },
    ]),
    Appraisal.aggregate([
      { $match: match },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          approved: { $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] } },
          pending: { $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] } },
          draft: { $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] } },
          rejected: { $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] } },
        },
      },
    ]),
  ]);

  return ResponseBuilder.stats(
    { byStatus, overall: overall ?? { total: 0, approved: 0, pending: 0, draft: 0, rejected: 0 } },
    "Appraisal statistics retrieved successfully"
  );
}

// ─── Delete (drafts only) ─────────────────────────────────────────────────────
export async function deleteAppraisal(id: string): Promise<any> {
  const cleanId = cleanObjectId(id);
  const doc = await Appraisal.findById(cleanId);
  if (!doc) throw new Error("Appraisal not found");
  if (doc.status !== "draft") throw new Error("Only draft appraisals can be deleted");

  await fileService.deleteFilesByModel("Appraisals", cleanId);
  const result = await Appraisal.findByIdAndDelete(cleanId);
  const transformed = transformDocument(result);
  return ResponseBuilder.operation(transformed, "Appraisal deleted successfully");
}

// ─── Internal helper ──────────────────────────────────────────────────────────
async function notifyApprover(doc: any, currentUser: CurrentUser) {
  if (!doc.approvedBy) return;
  notify
    .notifyApprovers({
      request: doc,
      currentUser,
      requestType: "appraisal",
      title: "Staff Appraisal",
      header: "You have been assigned an appraisal for review",
    })
    .catch(console.error);
}

// ─── Comments ─────────────────────────────────────────────────────────────────
export const addComment = async (id: string, currentUser: CurrentUser, text: string) => {
  const result = await addCommentOp(Appraisal, id, currentUser, text, (doc, uid) => {
    const s = uid.toString();
    return (
      doc.staffId?.toString() === s ||
      doc.supervisorId?.toString() === s ||
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
  const result = await updateCommentOp(Appraisal, id, commentId, userId, text);
  const transformed = transformDocument(result);
  return ResponseBuilder.operation(transformed, "Comment updated successfully");
};

export const deleteComment = async (id: string, commentId: string, currentUser: CurrentUser) => {
  const result = await deleteCommentOp(Appraisal, id, commentId, currentUser);
  const transformed = transformDocument(result);
  return ResponseBuilder.operation(transformed, "Comment deleted successfully");
};