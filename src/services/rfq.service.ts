import { RFQ, IRFQ, Vendor } from "../models";
import { fileService } from "./file.service";
import { emailService } from "./email.service";
import { createWorkflowService } from "./shared/workflow-service.factory";
import { CurrentUser, BaseQueryParams } from "./shared/types";
import { ResponseBuilder } from "./shared/response-builder";
import { USER_SELECT } from "./shared/helpers";
import { notify } from "./notifications/notification.service";

// ─── Shared factory: list/get/draft/submit/update/delete/comments/copy ──────
const svc = createWorkflowService({
  model: RFQ,
  label: "RFQ",
  requestType: "rfq",
  fileModelName: "RFQs",
  submissionApproverField: "createdBy",
  searchFields: ["rfqTitle", "rfqCode", "status"],
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "rfqCode", type: "exact" },
    { key: "dateFrom", type: "dateFrom", field: "createdAt" },
    { key: "dateTo", type: "dateTo", field: "createdAt" },
  ],
  populate: [
    { path: "createdBy", select: USER_SELECT },
    { path: "copiedTo", select: "businessName email contactPerson businessPhoneNumber" },
  ],
});

export const rfqCopyService = svc.copyService;

// ─── Helper Functions ──────────────────────────────────────────────────────────
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

async function verifyCanShareRFQ(rfq: any, currentUser: CurrentUser) {
  const isCreator = rfq.createdBy?.toString() === currentUser._id.toString();
  if (!isCreator && !["SUPER-ADMIN", "ADMIN"].includes(currentUser.role)) {
    throw new Error("Unauthorized: You cannot share this RFQ");
  }
  if (rfq.status === "cancelled") {
    throw new Error("Cannot share a cancelled RFQ");
  }
  if (rfq.status === "sent") {
    throw new Error("RFQ has already been sent");
  }
}

/**
 * Build vendor-facing email attachment links with proper file info
 * Handles multiple files from files?: File[] array
 */
function buildFileDownloads(files: any[]): Array<{
  id: string;
  name: string;
  url: string;
  fileType?: string;
  size?: number;
}> {
  const seen = new Set<string>();
  return files
    .filter((f) => {
      const id = (f._id ?? f.id).toString();
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    })
    .map((f) => {
      const id = (f._id ?? f.id).toString();
      return {
        id,
        name: f.originalName ?? f.name ?? "File",
        url: fileService.getPublicDownloadUrl(id),
        fileType: f.fileType ?? f.mimetype,
        size: f.size,
      };
    });
}

// ─── RFQ Stats ───────────────────────────────────────────────────────────────
export const getRFQStats = async (currentUser: CurrentUser): Promise<any> => {
  const baseStats = await svc.getStats(currentUser);

  const totalSent = await RFQ.countDocuments({ status: "sent" });
  const totalDraft = await RFQ.countDocuments({ status: "draft" });
  const totalPreview = await RFQ.countDocuments({ status: "preview" });
  const totalCancelled = await RFQ.countDocuments({ status: "cancelled" });

  return ResponseBuilder.stats(
    {
      ...(baseStats.data || {}),
      totalSent,
      totalDraft,
      totalPreview,
      totalCancelled,
    },
    "RFQ statistics retrieved successfully"
  );
};

// ─── Get All RFQs ─────────────────────────────────────────────────────────────
export const getRFQs = async (params: BaseQueryParams, user: CurrentUser): Promise<any> => {
  return svc.getAll(params, user);
};

// ─── Get RFQ by ID ────────────────────────────────────────────────────────────
export const getRFQById = async (id: string): Promise<any> => {
  return svc.getById(id);
};

// ─── Get RFQ by Code ──────────────────────────────────────────────────────────
export const getRFQByCode = async (rfqCode: string): Promise<any> => {
  const rfq = await RFQ.findOne({ rfqCode })
    .populate([
      { path: "createdBy", select: USER_SELECT },
      { path: "copiedTo", select: "businessName email contactPerson businessPhoneNumber" },
    ])
    .lean();

  if (!rfq) throw new Error("RFQ not found");

  const files = await fileService.getFilesByModel("RFQs", rfq._id.toString());
  return ResponseBuilder.single({ ...rfq, files }, "RFQ retrieved successfully");
};

// ─── Save RFQ Draft ────────────────────────────────────────────────────────────
export const saveRFQ = async (data: unknown, currentUser: CurrentUser): Promise<any> => {
  return svc.saveDraft(data, currentUser);
};

// ─── Save to Preview (generates rfqCode) ──────────────────────────────────────
export const saveToSendRFQ = async (
  data: unknown,
  currentUser: CurrentUser,
  files: Express.Multer.File[] = []
): Promise<any> => {
  const payload = data as Partial<IRFQ>;

  const rfqData = {
    ...payload,
    status: "preview",
    createdBy: currentUser._id,
  };

  const rfq = new RFQ(rfqData);
  await rfq.save();

  if (files && files.length > 0) {
    await fileService.handleFileUploads(files, String(rfq._id), "RFQs");
  }

  const transformed = transformDocument(rfq);
  return ResponseBuilder.operation(transformed, "RFQ saved for preview");
};

// ─── Update RFQ ───────────────────────────────────────────────────────────────
export const updateRFQ = async (
  id: string,
  data: unknown,
  currentUser: CurrentUser,
  files: Express.Multer.File[] = []
): Promise<any> => {
  const existing = await RFQ.findById(id);
  if (!existing) throw new Error("RFQ not found");

  if (existing.status === "sent") {
    throw new Error("Cannot update a sent RFQ");
  }

  return svc.update(id, data, currentUser);
};

// ─── Update RFQ Status ────────────────────────────────────────────────────────
export const updateRFQStatus = async (
  id: string,
  status: "draft" | "sent" | "cancelled",
  currentUser: CurrentUser
): Promise<any> => {
  const rfq = await RFQ.findById(id);
  if (!rfq) throw new Error("RFQ not found");

  if (rfq.status === "sent" && status !== "cancelled") {
    throw new Error("Cannot change status of a sent RFQ except to cancel");
  }

  const previousStatus = rfq.status;
  rfq.status = status;
  await rfq.save();

  if (previousStatus !== status) {
    await notify.notifyCreator({
      request: rfq,
      currentUser,
      requestType: "rfq",
      title: "RFQ Status Update",
      header: `Your RFQ has been ${status}`,
    });
  }

  const transformed = transformDocument(rfq);
  return ResponseBuilder.operation(transformed, `RFQ status updated to ${status}`);
};

// ─── Copy RFQ to Vendors ──────────────────────────────────────────────────────
export const copyRFQToVendors = async (opts: {
  currentUser: CurrentUser;
  requestId: string;
  recipients: string[];
  fileIds?: string[];
}): Promise<any> => {
  const { currentUser, requestId, recipients, fileIds = [] } = opts;

  const rfq = await RFQ.findById(requestId);
  if (!rfq) throw new Error("RFQ not found");

  await verifyCanShareRFQ(rfq, currentUser);

  // Update RFQ with recipients and status
  const updated = await RFQ.findByIdAndUpdate(
    requestId,
    {
      $addToSet: { copiedTo: { $each: recipients } },
      status: "sent"
    },
    { new: true, runValidators: true }
  );

  // Get files - prioritize fileIds, fallback to all associated files
  let attachedFiles = [];
  if (fileIds.length) {
    attachedFiles = await fileService.getFilesByIds(fileIds);
  } else {
    attachedFiles = await fileService.getFilesByModel("RFQs", requestId);
  }

  // Build download links for each file
  const fileDownloads = buildFileDownloads(attachedFiles);

  // Send BCC emails to vendors with all attached files
  const vendors = await Vendor.find({ _id: { $in: recipients } }).lean();
  const bccEmails = vendors.map((v) => v.email).filter(Boolean);

  if (bccEmails.length) {
    await emailService
      .sendRFQNotification({
        bccEmails,
        rfqCode: rfq.rfqCode,
        rfqTitle: rfq.rfqTitle,
        deadlineDate: rfq.deadlineDate,
        fileDownloads, // Now includes all files with download URLs
        // Pass additional file info for the email template
        fileCount: fileDownloads.length,
      })
      .catch(console.error);
  }

  // Notify creator
  await notify.notifyCreator({
    request: rfq,
    currentUser,
    requestType: "rfq",
    title: "RFQ Sent",
    header: `Your RFQ has been sent to ${recipients.length} vendor(s) with ${fileDownloads.length} attachment(s)`,
  });

  const result = await RFQ.findById(requestId).populate([
    { path: "createdBy", select: USER_SELECT },
    { path: "copiedTo", select: "businessName email contactPerson businessPhoneNumber" },
  ]);

  const transformed = transformDocument(result);
  return ResponseBuilder.operation(transformed, "RFQ sent to vendors successfully");
};

// ─── Delete RFQ ──────────────────────────────────────────────────────────────
export const deleteRFQ = async (id: string): Promise<any> => {
  const existing = await RFQ.findById(id);
  if (!existing) throw new Error("RFQ not found");

  if (existing.status === "sent") {
    throw new Error("Cannot delete a sent RFQ");
  }

  return svc.remove(id);
};

// ─── Export RFQs to Excel ────────────────────────────────────────────────────
export const exportRFQsToExcel = async (params: BaseQueryParams): Promise<any> => {
  // ... existing export logic
};

// ─── Backward-compatible aliases ────────────────────────────────────────────
export const getRFQsStats = getRFQStats;
export const getAllRFQs = getRFQs;
export const getRFQ = getRFQById;
export const createRFQ = saveToSendRFQ;
export const createAndSendRFQ = saveToSendRFQ;