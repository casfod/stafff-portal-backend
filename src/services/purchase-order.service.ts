// src/services/purchase-order.service.ts
// Refactored to use the workflow factory with custom overrides
import { PurchaseOrder, RFQ, Vendor } from "../models";
import { createWorkflowService } from "./shared/workflow-service.factory";
import { USER_SELECT, VENDOR_SELECT, cleanObjectId } from "./shared/helpers";
import { fileService } from "./file.service";
import { emailService } from "./email.service";
import { ResponseBuilder } from "./shared/response-builder";
import { CurrentUser, BaseQueryParams, StatusUpdatePayload } from "./shared/types";
import { AppError } from "../utils/AppError";
import {
  validateAndTotalItems,
  sumItemTotals,
  notifyStatusChange,
} from "./shared/procurement.helpers";
import { notify } from "./notifications/notification.service";

const purchaseOrderService = createWorkflowService({
  model: PurchaseOrder,
  label: "Purchase Order",
  requestType: "purchaseOrder",
  fileModelName: "PurchaseOrders",
  ownerField: "createdBy",
  searchFields: ["rfqTitle", "rfqCode", "poCode", "status"],
  filterableFields: [
    { key: "status", type: "exact" },
    { key: "dateFrom", type: "dateFrom", field: "createdAt" },
    { key: "dateTo", type: "dateTo", field: "createdAt" },
  ],
  populate: [
    { path: "createdBy", select: USER_SELECT },
    { path: "approvedBy", select: USER_SELECT },
    { path: "copiedTo", select: VENDOR_SELECT },
    { path: "selectedVendor", select: VENDOR_SELECT },
    { path: "comments.user", select: USER_SELECT },
  ],
  // Custom update for PO
  customUpdate: async (id, data, currentUser) => {
    const cleanId = cleanObjectId(id);
    const existing = await PurchaseOrder.findById(cleanId);
    if (!existing) throw new AppError(`Purchase Order ${cleanId} not found`, 404);
    if (["approved", "rejected"].includes(existing.status)) {
      throw new AppError("Cannot update an approved or rejected Purchase Order", 400);
    }

    const payload = data as any;
    if (payload.comment) {
      if (!existing.comments) (existing as any).comments = [];
      (existing.comments as any[]).unshift({
        user: currentUser._id,
        text: payload.comment,
      });
      payload.comments = existing.comments;
    }

    if (payload.itemGroups) {
      const items = validateAndTotalItems(payload.itemGroups);
      payload.itemGroups = items;
      payload.totalAmount = sumItemTotals(items);
    }

    const updated = await PurchaseOrder.findByIdAndUpdate(cleanId, payload, {
      new: true,
      runValidators: true,
    });
    if (!updated) throw new AppError(`Purchase Order ${cleanId} not found`, 404);

    return updated;
  },
  // Custom status update for PO
  customUpdateStatus: async (id, data, currentUser) => {
    const cleanId = cleanObjectId(id);
    const doc = await PurchaseOrder.findById(cleanId);
    if (!doc) throw new AppError(`Purchase Order ${cleanId} not found`, 404);

    if (data.comment) {
      if (!doc.comments) (doc as any).comments = [];
      (doc.comments as any[]).unshift({
        user: currentUser._id,
        text: data.comment,
      });
    }

    doc.status = data.status as any;
    const updated = await doc.save();

    // Notify creator
    await notifyStatusChange({
      request: updated,
      currentUser,
      requestType: "purchaseOrder",
      title: "Purchase Order",
      status: data.status,
    });

    // Send vendor notification
    if (["approved", "rejected"].includes(data.status) && doc.selectedVendor) {
      const vendor = await doc.populate("selectedVendor");
      // Send email to vendor
      emailService
        .sendPurchaseOrderNotification({
          vendorEmail: (vendor as any).selectedVendor?.email,
          vendorContact: (vendor as any).selectedVendor?.contactPerson,
          poCode: doc.poCode,
          rfqTitle: doc.rfqTitle,
          totalAmount: doc.totalAmount,
          deliveryDate: doc.deliveryDate,
          status: data.status as any,
          fileDownloads: [],
        })
        .catch(console.error);
    }

    return updated;
  },
  // Custom delete
  customDelete: async (id) => {
    const cleanId = cleanObjectId(id);
    await fileService.deleteFilesByModel("PurchaseOrders", cleanId);
    const result = await PurchaseOrder.findByIdAndDelete(cleanId);
    if (!result) throw new AppError(`Purchase Order ${cleanId} not found`, 404);
    return result;
  },
  
});

// ─── Send PO to Vendor ──────────────────────────────────────────────────────
export const sendPurchaseOrderToVendor = async ({
  purchaseOrderId,
  vendorId,
  fileIds = [],
  currentUser,
}: {
  purchaseOrderId: string;
  vendorId: string;
  fileIds?: string[];
  currentUser: CurrentUser;
}): Promise<any> => {
  // cleanObjectId throws a clear 400-worthy "ID is required"/"Invalid
  // ObjectId format" the moment purchaseOrderId or vendorId is missing or
  // malformed — e.g. a controller reading the wrong req.params key and
  // passing `undefined` through — instead of silently reaching
  // findById(undefined), which Mongoose resolves to null without querying
  // the DB and which then surfaced as a misleading "not found".
  const cleanPoId = cleanObjectId(purchaseOrderId);
  const cleanVendorId = cleanObjectId(vendorId);

  const po = await PurchaseOrder.findById(cleanPoId)
    .populate('selectedVendor')
    .lean();

  if (!po) throw new AppError(`Purchase Order ${cleanPoId} not found`, 404);
  if (po.status !== 'approved') throw new AppError('Only approved POs can be sent to vendors', 400);

  // Get vendor details
  const vendor = await Vendor.findById(cleanVendorId).lean();
  if (!vendor) throw new AppError('Vendor not found', 404);
  if (!vendor.email) throw new AppError('Vendor does not have an email address', 400);

  // Get files - prioritize fileIds, fallback to all associated files
  let attachedFiles = [];
  if (fileIds.length) {
    attachedFiles = await fileService.getFilesByIds(fileIds);
  } else {
    attachedFiles = await fileService.getFilesByModel('PurchaseOrders', cleanPoId);
  }

  // Build file downloads with proper URLs
  const fileDownloads = attachedFiles.map((f) => ({
    id: (f._id ?? f.id).toString(),
    name: f.originalName ?? f.name ?? "File",
    url: fileService.getPublicDownloadUrl((f._id ?? f.id).toString()),
    fileType: f.fileType,
    size: f.size,
  }));

  // Send email to vendor with all attached files
  await emailService.sendPurchaseOrderNotification({
    vendorEmail: vendor.email,
    vendorContact: vendor.contactPerson || 'Vendor',
    poCode: po.poCode,
    rfqTitle: po.rfqTitle,
    totalAmount: po.totalAmount,
    deliveryDate: po.deliveryDate,
    status: po.status as any,
    fileDownloads,
  }).catch(console.error);
  
  // Notify creator
  await notifyStatusChange({
    request: po,
    currentUser,
    requestType: 'purchaseOrder',
    title: 'Purchase Order',
    status: 'sent_to_vendor',
  });
  
  // Update PO to mark as sent
  await PurchaseOrder.findByIdAndUpdate(cleanPoId, {
    $set: { sentToVendorAt: new Date() }
  });
  
  return ResponseBuilder.operation(
    { ...po, fileDownloads },
    `Purchase Order ${po.poCode} sent to ${vendor.businessName} with ${fileDownloads.length} attachment(s)`
  );
};




// ─── Export standard methods ─────────────────────────────────────────────────
export const {
  getStats: getPurchaseOrderStats,
  getAll: getPurchaseOrders,
  getById: getPurchaseOrderById,
  update: updatePurchaseOrder,
  updateStatus: updatePurchaseOrderStatus,
  remove: deletePurchaseOrder,
  addComment: addCommentToPurchaseOrder,
  updateComment: updatePurchaseOrderComment,
  deleteComment: deletePurchaseOrderComment
} = purchaseOrderService;



// ─── PO-specific methods ─────────────────────────────────────────────────────

export const createPurchaseOrderFromRFQ = async (
  rfqId: string,
  vendorId: string,
  data: any,
  currentUser: CurrentUser,
  files: Express.Multer.File[] = []
): Promise<any> => {
  // Get the RFQ to copy data from
  const rfq = await RFQ.findById(rfqId).lean();
  if (!rfq) throw new AppError("RFQ not found", 404);

  // Calculate total amount from item groups
  let totalAmount = 0;
  const itemGroups = data.itemGroups?.map((item: any) => {
    const total = item.quantity * item.unitCost;
    totalAmount += total;
    return {
      ...item,
      total,
    };
  }) || [];

  // Apply VAT if provided
  const vat = data.vat || 0;
  const label = "Purchase Order";

  // Create the purchase order
  const poData = {
    rfqTitle: data.rfqTitle || rfq.rfqTitle || label,
    rfqCode: rfq.rfqCode || "",
    itemGroups,
    selectedVendor: vendorId,
    deliveryDate: data.deliveryDate || "",
    poDate: data.poDate || new Date().toISOString().split("T")[0],
    casfodAddressId: data.casfodAddressId || "",
    totalAmount,
    vat: vat,
    createdBy: currentUser._id,
    status: "pending" as const,
    isFromRfq: true,
    comments: [],
    approvedBy: data.approvedBy || null,
    copiedTo: data.copiedTo || [],
  };

  const po = new PurchaseOrder(poData);
  await po.save();

  // Handle file uploads if any
  if (files && files.length > 0) {
    await fileService.handleFileUploads(files, String(po._id), "PurchaseOrders");
  }

  // Populate the result
  const populated = await PurchaseOrder.findById(po._id)
    .populate([
      { path: "createdBy", select: USER_SELECT },
      { path: "approvedBy", select: USER_SELECT },
      { path: "copiedTo", select: VENDOR_SELECT },
      { path: "selectedVendor", select: VENDOR_SELECT },
    ]);

  await notify.notifyApprovers({
    request: po,
    currentUser,
    requestType: "purchaseOrder",
    title: label,
    header: `You have been assigned to approve this ${label}`,
  });

  return ResponseBuilder.operation(populated, "Purchase order created from RFQ successfully");
};

export const createIndependentPurchaseOrder = async (
  data: any,
  currentUser: CurrentUser,
  files: Express.Multer.File[] = []
): Promise<any> => {
  // Calculate total amount from item groups
  let totalAmount = 0;
  const itemGroups = data.itemGroups?.map((item: any) => {
    const total = item.quantity * item.unitCost;
    totalAmount += total;
    return {
      ...item,
      total,
    };
  }) || [];

  // Apply VAT if provided
  const vat = data.vat || 0;
  const label = "Purchase Order";

  // Create the purchase order
  const poData = {
    rfqTitle: data.rfqTitle || label,
    rfqCode: "",
    itemGroups,
    selectedVendor: data.selectedVendor,
    deliveryDate: data.deliveryDate || "",
    poDate: data.poDate || new Date().toISOString().split("T")[0],
    casfodAddressId: data.casfodAddressId || "",
    totalAmount,
    vat: vat,
    createdBy: currentUser._id,
    status: "pending" as const,
    isFromRfq: false,
    comments: [],
    approvedBy: data.approvedBy || null,
    copiedTo: data.copiedTo || [],
  };

  const po = new PurchaseOrder(poData);
  await po.save();

  // Handle file uploads if any
  if (files && files.length > 0) {
    await fileService.handleFileUploads(files, String(po._id), "PurchaseOrders");
  }

  // Populate the result
  const populated = await PurchaseOrder.findById(po._id)
    .populate([
      { path: "createdBy", select: USER_SELECT },
      { path: "approvedBy", select: USER_SELECT },
      { path: "copiedTo", select: VENDOR_SELECT },
      { path: "selectedVendor", select: VENDOR_SELECT },
    ]);

  await notify.notifyApprovers({
          request: po,
          currentUser,
          requestType: "purchaseOrder",
          title: label,
          header: `You have been assigned to approve this ${label}`,
        });

  return ResponseBuilder.operation(populated, "Purchase order created successfully");
};

// ─── Backward compatibility ──────────────────────────────────────────────────
export const getPurchaseOrder = getPurchaseOrderById;