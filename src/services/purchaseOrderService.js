// purchaseOrderService.js
const PurchaseOrder = require("../models/PurchaseOrderModel");
const RFQ = require("../models/RFQModel");
const Vendor = require("../models/VendorModel");
const fileService = require("./fileService");
const handleFileUploads = require("../utils/FileUploads");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const notify = require("../utils/notify");
const ProcurementNotificationService = require("./procurementNotification");

// Helper function to clean and validate ObjectId
const cleanObjectId = (id) => {
  if (!id) return null;

  // Remove any extra quotes or whitespace
  let cleanedId = id.toString().trim();
  cleanedId = cleanedId.replace(/^"+|"+$/g, ""); // Remove surrounding quotes

  // Validate if it's a valid ObjectId format (24 hex characters)
  if (!/^[0-9a-fA-F]{24}$/.test(cleanedId)) {
    throw new Error(`Invalid ObjectId format: ${id}`);
  }

  return cleanedId;
};

// Get all Purchase Orders
const getPurchaseOrders = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 10 } = queryParams;

  const searchFields = ["RFQTitle", "RFQCode", "deliveryPeriod", "status"];

  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  // Role-based filtering
  switch (currentUser.role) {
    case "STAFF":
      query.createdBy = currentUser._id;
      break;
    case "ADMIN":
    case "SUPER-ADMIN":
      // Admins can see all purchase orders
      break;
    default:
      query.createdBy = currentUser._id;
      break;
  }

  const sortQuery = buildSortQuery(sort);
  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "copiedTo", select: "businessName email contactPerson" },
    { path: "selectedVendor", select: "businessName email contactPerson" },
    { path: "comments.user", select: "email first_name last_name role" },
  ];

  const {
    results: purchaseOrders,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    PurchaseOrder,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  const purchaseOrdersWithFiles = await Promise.all(
    purchaseOrders.map(async (po) => {
      const files = await fileService.getFilesByDocument(
        "PurchaseOrders",
        po._id
      );
      return {
        ...po.toJSON(),
        files: normalizeFiles(files),
      };
    })
  );

  return {
    purchaseOrders: purchaseOrdersWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// FIXED: Create Purchase Order from RFQ - adjusted params to include vendorId separately, added casfodAddressId handling
const createPurchaseOrderFromRFQ = async (
  rfqId,
  vendorId,
  data,
  currentUser,
  files = []
) => {
  const {
    itemGroups,
    approvedBy,
    deliveryPeriod,
    bidValidityPeriod,
    guaranteePeriod,
    deadlineDate,
    rfqDate,
    casfodAddressId,
    VAT,
  } = data;

  // Clean and validate IDs
  const cleanedRfqId = cleanObjectId(rfqId);
  const cleanedVendorId = cleanObjectId(vendorId);
  const cleanedApprovedBy = approvedBy ? cleanObjectId(approvedBy) : null;

  // Fetch the RFQ
  const rfq = await RFQ.findById(cleanedRfqId);
  if (!rfq) {
    throw new Error("RFQ not found");
  }

  // Verify the vendor exists and was copied in the RFQ
  const vendor = await Vendor.findById(cleanedVendorId);
  if (!vendor) {
    throw new Error("Vendor not found");
  }

  if (!rfq.copiedTo.includes(cleanedVendorId)) {
    throw new Error("Vendor was not part of the original RFQ");
  }

  // Validate that all items have prices
  const validatedItemGroups = itemGroups.map((item) => {
    if (!item.unitCost || item.unitCost <= 0) {
      throw new Error(
        `Unit cost is required and must be greater than 0 for item: ${item.description}`
      );
    }
    return {
      ...item,
      total: item.quantity * item.unitCost * item.frequency,
    };
  });

  // Calculate total amount
  const totalAmount = validatedItemGroups.reduce(
    (sum, item) => sum + item.total,
    0
  );

  // Use provided timeline fields or fall back to RFQ values
  const finalDeliveryPeriod = deliveryPeriod || rfq.deliveryPeriod;
  const finalBidValidityPeriod = bidValidityPeriod || rfq.bidValidityPeriod;
  const finalGuaranteePeriod = guaranteePeriod || rfq.guaranteePeriod;
  const finalDeadlineDate = deadlineDate || rfq.deadlineDate;
  const finalRFQDate = rfqDate || rfq.rfqDate;
  const finalCasfodAddressId = casfodAddressId || rfq.casfodAddressId; // FIXED: Use casfodAddressId from data
  const finalVAT = VAT || rfq.VAT; // FIXED: Use casfodAddressId from data

  // Validate required timeline fields
  if (!finalDeliveryPeriod) {
    throw new Error("Delivery Period is required");
  }
  if (!finalBidValidityPeriod) {
    throw new Error("Bid Validity Period is required");
  }
  if (!finalGuaranteePeriod) {
    throw new Error("Guarantee Period is required");
  }

  // Create purchase order with selectedVendor and isFromRFQ = true
  // FIXED: copiedTo should inherit from RFQ
  const purchaseOrder = new PurchaseOrder({
    RFQTitle: rfq.RFQTitle,
    RFQCode: rfq.RFQCode,
    deadlineDate: finalDeadlineDate,
    rfqDate: finalRFQDate,
    casfodAddressId: finalCasfodAddressId,
    VAT: finalVAT,
    itemGroups: validatedItemGroups,
    copiedTo: rfq.copiedTo, // FIXED: Use RFQ's copiedTo
    selectedVendor: cleanedVendorId,
    deliveryPeriod: finalDeliveryPeriod,
    bidValidityPeriod: finalBidValidityPeriod,
    guaranteePeriod: finalGuaranteePeriod,
    createdBy: currentUser._id,
    status: "pending",
    totalAmount: totalAmount,
    isFromRFQ: true,
    approvedBy: cleanedApprovedBy,
  });

  await purchaseOrder.save();

  // Handle file uploads
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: purchaseOrder._id,
      modelTable: "PurchaseOrders",
    });
  }

  // Notify creator and vendor
  await notifyStatusUpdate(purchaseOrder, "pending", null, currentUser);

  // Populate for response
  await purchaseOrder.populate([
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    {
      path: "copiedTo",
      select: "businessName email contactPerson businessPhoneNumber address",
    },
    {
      path: "selectedVendor",
      select: "businessName email contactPerson businessPhoneNumber address",
    },
    { path: "comments.user", select: "email first_name last_name role" },
  ]);

  const filesData = await fileService.getFilesByDocument(
    "PurchaseOrders",
    purchaseOrder._id
  );

  return normalizeId({
    ...purchaseOrder.toObject(),
    files: normalizeFiles(filesData),
  });
};

// Create Independent Purchase Order
const createIndependentPurchaseOrder = async (
  data,
  currentUser,
  files = []
) => {
  const {
    RFQTitle,
    deliveryPeriod,
    bidValidityPeriod,
    guaranteePeriod,
    selectedVendor,
    approvedBy,
    itemGroups,
    copiedTo,
    deadlineDate,
    rfqDate,
    casfodAddressId,
    VAT,
  } = data;

  // Clean and validate IDs
  const cleanedSelectedVendor = cleanObjectId(selectedVendor);
  const cleanedApprovedBy = approvedBy ? cleanObjectId(approvedBy) : null;
  let cleanedCopiedTo = [];
  if (copiedTo && Array.isArray(copiedTo)) {
    cleanedCopiedTo = copiedTo.map((id) => cleanObjectId(id)).filter(Boolean);
  }
  if (cleanedCopiedTo.length === 0) {
    cleanedCopiedTo = [cleanedSelectedVendor];
  }

  // Verify vendor exists
  const vendor = await Vendor.findById(cleanedSelectedVendor);
  if (!vendor) {
    throw new Error("Selected vendor not found");
  }

  // Validate required fields
  if (!RFQTitle || !RFQTitle.trim()) {
    throw new Error("Purchase Order Title is required");
  }
  if (!deliveryPeriod || !deliveryPeriod.trim()) {
    throw new Error("Delivery Period is required");
  }
  if (!bidValidityPeriod || !bidValidityPeriod.trim()) {
    throw new Error("Bid Validity Period is required");
  }
  if (!guaranteePeriod || !guaranteePeriod.trim()) {
    throw new Error("Guarantee Period is required");
  }
  if (!casfodAddressId) {
    throw new Error("CASFOD Address is required");
  }
  if (!VAT) {
    throw new Error("VAT is required");
  }

  // Validate item groups
  const validatedItemGroups = itemGroups.map((item) => {
    if (!item.unitCost || item.unitCost <= 0) {
      throw new Error(
        `Unit cost is required and must be greater than 0 for item: ${item.description}`
      );
    }
    // if (!item.description || !item.description.trim()) {
    //   throw new Error(`Description is required for item: ${item.itemName}`);
    // }
    return {
      ...item,
      total: item.quantity * item.unitCost * item.frequency,
    };
  });

  // Calculate total amount
  const totalAmount = validatedItemGroups.reduce(
    (sum, item) => sum + item.total,
    0
  );

  const purchaseOrder = new PurchaseOrder({
    RFQTitle,
    deadlineDate,
    rfqDate,
    casfodAddressId,
    VAT,
    itemGroups: validatedItemGroups,
    copiedTo: cleanedCopiedTo,
    selectedVendor: cleanedSelectedVendor,
    deliveryPeriod,
    bidValidityPeriod,
    guaranteePeriod,
    createdBy: currentUser._id,
    status: "pending",
    totalAmount,
    isFromRFQ: false,
    approvedBy: cleanedApprovedBy,
  });

  await purchaseOrder.save();

  // Handle file uploads
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: purchaseOrder._id,
      modelTable: "PurchaseOrders",
    });
  }

  // Notify creator
  await notifyStatusUpdate(purchaseOrder, "pending", null, currentUser);

  // Populate for response
  await purchaseOrder.populate([
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    {
      path: "copiedTo",
      select: "businessName email contactPerson businessPhoneNumber address",
    },
    {
      path: "selectedVendor",
      select: "businessName email contactPerson businessPhoneNumber address",
    },
    { path: "comments.user", select: "email first_name last_name role" },
  ]);

  const filesData = await fileService.getFilesByDocument(
    "PurchaseOrders",
    purchaseOrder._id
  );

  return normalizeId({
    ...purchaseOrder.toObject(),
    files: normalizeFiles(filesData),
  });
};

// Get Purchase Order by ID
const getPurchaseOrderById = async (id) => {
  const cleanedId = cleanObjectId(id);

  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    {
      path: "copiedTo",
      select: "businessName email contactPerson businessPhoneNumber address",
    },
    {
      path: "selectedVendor",
      select: "businessName email contactPerson businessPhoneNumber address",
    },
    { path: "comments.user", select: "email first_name last_name role" },
  ];

  const purchaseOrder = await PurchaseOrder.findById(cleanedId)
    .populate(populateOptions)
    .lean();

  if (!purchaseOrder) {
    throw new Error("Purchase Order not found");
  }

  // Fetch associated files
  const files = await fileService.getFilesByDocument(
    "PurchaseOrders",
    cleanedId
  );

  return normalizeId({
    ...purchaseOrder,
    files: normalizeFiles(files),
  });
};

// Update notifyStatusUpdate function to use selectedVendor
const notifyStatusUpdate = async (
  purchaseOrder,
  status,
  comment,
  approvedByUser
) => {
  try {
    // Notify creator
    notify.notifyCreator({
      request: purchaseOrder,
      currentUser: approvedByUser,
      requestType: "purchaseOrder",
      title: "Purchase Order",
      header: `Your Purchase Order has been ${status}`,
    });

    // Notify vendor with files if approved, without files if rejected
    if (
      ["approved", "rejected"].includes(status) &&
      purchaseOrder.selectedVendor
    ) {
      const vendor = await Vendor.findById(purchaseOrder.selectedVendor);
      if (vendor) {
        let fileDownloads = [];

        // Only include files for approved status
        if (status === "approved") {
          // Get all files associated with this purchase order
          const files = await fileService.getFilesByDocument(
            "PurchaseOrders",
            purchaseOrder._id
          );

          // Create download links for all files
          fileDownloads = await createFileDownloadsForPO(files);
        }

        // FIX: Only send rejection emails for POs that are from RFQ
        if (status === "rejected" && !purchaseOrder.isFromRFQ) {
          console.log(
            `ℹ️  Skipping rejection email for independent PO: ${purchaseOrder.RFQCode}`
          );
          return; // Skip sending rejection email for independent POs
        }

        await ProcurementNotificationService.sendPurchaseOrderStatusNotification(
          {
            vendor,
            purchaseOrder,
            currentUser: approvedByUser,
            status,
            fileDownloads, // Empty array for rejected, populated for approved
          }
        );
      }
    }

    console.log(
      `✅ Status update notifications sent for PO: ${purchaseOrder.RFQCode}`
    );
  } catch (error) {
    console.error("Error sending status update notifications:", error);
    throw error;
  }
};

// Helper function to create download links for all PO files
const createFileDownloadsForPO = async (files) => {
  if (!files || !Array.isArray(files)) {
    return [];
  }

  // Use Set to track unique file IDs to avoid duplicates
  const uniqueFiles = [];
  const seenFileIds = new Set();

  for (const file of files) {
    const fileId = file._id ? file._id.toString() : file.id;

    // Skip if we've already processed this file
    if (seenFileIds.has(fileId)) {
      continue;
    }

    seenFileIds.add(fileId);

    // Create download URL for each file
    const downloadUrl = `${process.env.API_BASE_URL}/files/${fileId}/download`;

    uniqueFiles.push({
      id: fileId,
      name: file.name || `PO-File-${fileId}`,
      url: downloadUrl,
      mimeType: file.mimeType,
      fileType: file.fileType,
      size: file.size,
    });
  }

  return uniqueFiles;
};

// FIXED: Update Purchase Order - handles optional fields properly
const updatePurchaseOrder = async (id, data, files = [], currentUser) => {
  const cleanedId = cleanObjectId(id);
  const existingPO = await PurchaseOrder.findById(cleanedId);

  if (!existingPO) {
    throw new Error("Purchase Order not found");
  }

  // Prevent updating approved/rejected POs
  if (["approved", "rejected"].includes(existingPO.status)) {
    throw new Error("Cannot update an approved or rejected Purchase Order");
  }

  // Handle comments if provided
  if (data.comment && currentUser) {
    if (!existingPO.comments) {
      existingPO.comments = [];
    }

    existingPO.comments.unshift({
      user: currentUser._id,
      text: data.comment,
    });

    data.comments = existingPO.comments;
  }

  // Clean and validate IDs if provided
  if (data.selectedVendor) {
    data.selectedVendor = cleanObjectId(data.selectedVendor);
  }
  if (data.approvedBy) {
    data.approvedBy = cleanObjectId(data.approvedBy);
  }
  if (data.copiedTo && Array.isArray(data.copiedTo)) {
    data.copiedTo = data.copiedTo
      .map((id) => cleanObjectId(id))
      .filter(Boolean);
  }

  // Validate required timeline fields if provided
  if (data.deliveryPeriod !== undefined && !data.deliveryPeriod.trim()) {
    throw new Error("Delivery Period is required");
  }
  if (data.bidValidityPeriod !== undefined && !data.bidValidityPeriod.trim()) {
    throw new Error("Bid Validity Period is required");
  }
  if (data.guaranteePeriod !== undefined && !data.guaranteePeriod.trim()) {
    throw new Error("Guarantee Period is required");
  }
  if (data.casfodAddressId !== undefined && !data.casfodAddressId) {
    throw new Error("CASFOD Address is required");
  }

  if (data.VAT !== undefined && !data.VAT) {
    throw new Error("VAT is required");
  }

  // Recalculate totals if itemGroups are updated
  if (data.itemGroups) {
    const validatedItemGroups = data.itemGroups.map((item) => {
      if (!item.unitCost || item.unitCost <= 0) {
        throw new Error(
          `Unit cost is required and must be greater than 0 for item: ${item.description}`
        );
      }
      if (!item.description || !item.description.trim()) {
        throw new Error(`Description is required for item: ${item.itemName}`);
      }
      return {
        ...item,
        total: item.quantity * item.unitCost * item.frequency,
      };
    });

    data.itemGroups = validatedItemGroups;
    data.totalAmount = validatedItemGroups.reduce(
      (sum, item) => sum + item.total,
      0
    );
  }

  const updatedPO = await PurchaseOrder.findByIdAndUpdate(
    cleanedId,
    {
      ...data,
      updatedAt: new Date(),
    },
    { new: true, runValidators: true }
  ).populate([
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    {
      path: "copiedTo",
      select: "businessName email contactPerson businessPhoneNumber address",
    },
    {
      path: "selectedVendor",
      select: "businessName email contactPerson businessPhoneNumber address",
    },
    { path: "comments.user", select: "email first_name last_name role" },
  ]);

  // Handle file uploads if any - replace existing files
  if (files.length > 0) {
    await fileService.deleteFilesByDocument("PurchaseOrders", cleanedId);
    await handleFileUploads({
      files,
      requestId: updatedPO._id,
      modelTable: "PurchaseOrders",
    });
  }

  const filesData = await fileService.getFilesByDocument(
    "PurchaseOrders",
    cleanedId
  );

  return normalizeId({
    ...updatedPO.toObject(),
    files: normalizeFiles(filesData),
  });
};

// FIXED: Update Purchase Order Status - handles pdfFile separately
const updatePurchaseOrderStatus = async (
  id,
  data,
  currentUser,
  pdfFile = null
) => {
  const cleanedId = cleanObjectId(id);
  const { status, comment } = data;

  const existingPO = await PurchaseOrder.findById(cleanedId);
  if (!existingPO) {
    throw new Error("Purchase Order not found");
  }

  // Validate status transition
  if (!["pending", "approved", "rejected"].includes(status)) {
    throw new Error("Invalid status");
  }

  // Add comment if provided
  if (comment && comment.trim()) {
    if (!existingPO.comments) {
      existingPO.comments = [];
    }
    existingPO.comments.unshift({
      user: currentUser._id,
      text: comment.trim(),
    });
  }

  // Update status and comments
  existingPO.status = status;
  existingPO.updatedAt = new Date();

  await existingPO.save();

  // Handle PDF upload if provided (e.g., approval document)
  if (pdfFile) {
    await handleFileUploads({
      files: [pdfFile],
      requestId: existingPO._id,
      modelTable: "PurchaseOrders",
    });
  }

  // Notify
  await notifyStatusUpdate(existingPO, status, comment, currentUser);

  // Populate and return
  await existingPO.populate([
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    {
      path: "copiedTo",
      select: "businessName email contactPerson businessPhoneNumber address",
    },
    {
      path: "selectedVendor",
      select: "businessName email contactPerson businessPhoneNumber address",
    },
    { path: "comments.user", select: "email first_name last_name role" },
  ]);

  const filesData = await fileService.getFilesByDocument(
    "PurchaseOrders",
    cleanedId
  );

  return normalizeId({
    ...existingPO.toObject(),
    files: normalizeFiles(filesData),
  });
};

// Add comment to Purchase Order
const addCommentToPurchaseOrder = async (id, commentText, currentUser) => {
  if (!commentText || !commentText.trim()) {
    throw new Error("Comment text is required");
  }

  if (!currentUser) {
    throw new Error("Unauthorized");
  }

  const cleanedId = cleanObjectId(id);
  const purchaseOrder = await PurchaseOrder.findById(cleanedId);
  if (!purchaseOrder) {
    throw new Error("Purchase Order not found");
  }

  // Initialize comments array if it doesn't exist
  if (!purchaseOrder.comments) {
    purchaseOrder.comments = [];
  }

  // Add the new comment to the top
  purchaseOrder.comments.unshift({
    user: currentUser._id,
    text: commentText.trim(),
  });

  await purchaseOrder.save();

  // Populate the comment user details for response
  await purchaseOrder.populate([
    { path: "comments.user", select: "email first_name last_name role" },
  ]);

  return purchaseOrder;
};

// Delete Purchase Order
const deletePurchaseOrder = async (id) => {
  const cleanedId = cleanObjectId(id);
  await fileService.deleteFilesByDocument("PurchaseOrders", cleanedId);
  return await PurchaseOrder.findByIdAndDelete(cleanedId);
};

module.exports = {
  getPurchaseOrders,
  createPurchaseOrderFromRFQ,
  createIndependentPurchaseOrder,
  getPurchaseOrderById,
  updatePurchaseOrder,
  updatePurchaseOrderStatus,
  addCommentToPurchaseOrder,
  deletePurchaseOrder,
};
