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
  const { search, sort = "-createdAt", page = 1, limit = 10 } = queryParams; // Changed default sort to -createdAt

  const searchTerms = search ? search.trim().split(/\s+/) : [];

  // Build aggregation pipeline
  const pipeline = [];

  // Add $lookup to join with Vendor collection
  pipeline.push({
    $lookup: {
      from: "vendors",
      localField: "selectedVendor",
      foreignField: "_id",
      as: "selectedVendorDetails",
    },
  });

  // Add $lookup for createdBy
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "createdBy",
      foreignField: "_id",
      as: "createdByDetails",
    },
  });

  // Add $lookup for approvedBy
  pipeline.push({
    $lookup: {
      from: "users",
      localField: "approvedBy",
      foreignField: "_id",
      as: "approvedByDetails",
    },
  });

  // Unwind the arrays (but preserve empty arrays for documents without references)
  pipeline.push({
    $addFields: {
      selectedVendorDetails: { $arrayElemAt: ["$selectedVendorDetails", 0] },
      createdByDetails: { $arrayElemAt: ["$createdByDetails", 0] },
      approvedByDetails: { $arrayElemAt: ["$approvedByDetails", 0] },
    },
  });

  // Build match stage for filtering
  let matchStage = {};

  // Role-based filtering
  switch (currentUser.role) {
    case "STAFF":
      matchStage.createdBy = currentUser._id;
      break;
    case "ADMIN":
    case "SUPER-ADMIN":
      // Admins can see all purchase orders
      break;
    default:
      matchStage.createdBy = currentUser._id;
      break;
  }

  // Search filtering
  if (searchTerms.length > 0) {
    const searchConditions = [];

    // Search in local fields
    searchConditions.push(
      { RFQTitle: { $regex: searchTerms.join("|"), $options: "i" } },
      { RFQCode: { $regex: searchTerms.join("|"), $options: "i" } },
      { POCode: { $regex: searchTerms.join("|"), $options: "i" } },
      { status: { $regex: searchTerms.join("|"), $options: "i" } }
    );

    // Search in vendor business name
    searchConditions.push({
      "selectedVendorDetails.businessName": {
        $regex: searchTerms.join("|"),
        $options: "i",
      },
    });

    // If we already have role-based conditions, combine with AND
    if (Object.keys(matchStage).length > 0) {
      matchStage = {
        $and: [matchStage, { $or: searchConditions }],
      };
    } else {
      matchStage.$or = searchConditions;
    }
  }

  if (Object.keys(matchStage).length > 0) {
    pipeline.push({ $match: matchStage });
  }

  // Add sort stage - IMPORTANT: Always sort by createdAt descending by default
  let sortField = "createdAt";
  let sortOrder = -1; // Default: newest first

  if (sort) {
    // Parse the sort parameter
    if (sort.startsWith("-")) {
      sortField = sort.substring(1);
      sortOrder = -1;
    } else {
      sortField = sort;
      sortOrder = 1;
    }
  }

  // Handle special sorting cases
  if (sortField === "selectedVendor.businessName") {
    pipeline.push({
      $addFields: {
        vendorBusinessNameSort: "$selectedVendorDetails.businessName",
      },
    });
    pipeline.push({ $sort: { vendorBusinessNameSort: sortOrder } });
  } else if (sortField === "createdAt" || sortField === "updatedAt") {
    // Sort by date fields
    pipeline.push({ $sort: { [sortField]: sortOrder } });
  } else if (sortField === "createdBy") {
    // Sort by creator's name
    pipeline.push({
      $addFields: {
        creatorNameSort: {
          $concat: [
            "$createdByDetails.first_name",
            " ",
            "$createdByDetails.last_name",
          ],
        },
      },
    });
    pipeline.push({ $sort: { creatorNameSort: sortOrder } });
  } else if (sortField === "approvedBy") {
    // Sort by approver's name
    pipeline.push({
      $addFields: {
        approverNameSort: {
          $concat: [
            "$approvedByDetails.first_name",
            " ",
            "$approvedByDetails.last_name",
          ],
        },
      },
    });
    pipeline.push({ $sort: { approverNameSort: sortOrder } });
  } else {
    // Default sorting by createdAt descending (newest first)
    pipeline.push({ $sort: { createdAt: -1 } });
  }

  // ALWAYS ensure newest documents are at the top as secondary sort
  // This ensures consistent ordering when primary sort fields are equal
  const currentSortStage = pipeline[pipeline.length - 1];
  if (currentSortStage && currentSortStage.$sort) {
    // Add createdAt as secondary sort if not already the primary
    if (!currentSortStage.$sort.createdAt) {
      currentSortStage.$sort.createdAt = -1; // Newest first as secondary sort
    }
  } else {
    // No sort stage yet, add default sort
    pipeline.push({ $sort: { createdAt: -1 } });
  }

  // Add pagination
  const skip = (page - 1) * limit;
  pipeline.push({ $skip: skip });
  pipeline.push({ $limit: parseInt(limit) });

  // Debug: log the pipeline
  // console.log("Aggregation Pipeline:", JSON.stringify(pipeline, null, 2));

  // Execute aggregation
  const [purchaseOrders, totalCount] = await Promise.all([
    PurchaseOrder.aggregate(pipeline),
    PurchaseOrder.aggregate([...pipeline.slice(0, -2), { $count: "total" }]),
  ]);

  const total = totalCount.length > 0 ? totalCount[0].total : 0;
  const totalPages = Math.ceil(total / limit);
  const currentPage = parseInt(page);

  // Format the results to match the expected structure
  const formattedPurchaseOrders = purchaseOrders.map((po) => ({
    ...po,
    id: po._id.toString(),
    createdBy: po.createdByDetails,
    approvedBy: po.approvedByDetails,
    selectedVendor: po.selectedVendorDetails,
    // Remove the temporary fields
    selectedVendorDetails: undefined,
    createdByDetails: undefined,
    approvedByDetails: undefined,
    vendorBusinessNameSort: undefined,
    creatorNameSort: undefined,
    approverNameSort: undefined,
  }));

  // Get files for each purchase order
  const purchaseOrdersWithFiles = await Promise.all(
    formattedPurchaseOrders.map(async (po) => {
      const files = await fileService.getFilesByDocument(
        "PurchaseOrders",
        po._id
      );
      return {
        ...po,
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

// Create Purchase Order from RFQ
const createPurchaseOrderFromRFQ = async (
  rfqId,
  vendorId,
  data,
  currentUser,
  files = []
) => {
  const { itemGroups, approvedBy, deliveryDate, poDate, casfodAddressId, VAT } =
    data;

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
        `Unit cost is required and must be greater than 0 for item: ${item.itemName}`
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
  const finalDeliveryDate = deliveryDate || rfq.deliveryDate;
  const finalPoDate = poDate || rfq.poDate;
  const finalCasfodAddressId = casfodAddressId || rfq.casfodAddressId;
  const finalVAT = VAT || rfq.VAT;

  // Create purchase order with selectedVendor and isFromRFQ = true
  const purchaseOrder = new PurchaseOrder({
    RFQTitle: rfq.RFQTitle,
    RFQCode: rfq.RFQCode,
    deliveryDate: finalDeliveryDate,
    poDate: finalPoDate,
    casfodAddressId: finalCasfodAddressId,
    VAT: finalVAT,
    itemGroups: validatedItemGroups,
    copiedTo: rfq.copiedTo,
    selectedVendor: cleanedVendorId,
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
    selectedVendor,
    approvedBy,
    itemGroups,
    copiedTo,
    deliveryDate,
    poDate,
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
  if (!deliveryDate || !deliveryDate.trim()) {
    throw new Error("Delivery Date is required");
  }
  if (!poDate || !poDate.trim()) {
    throw new Error("PO Date is required");
  }
  if (!casfodAddressId) {
    throw new Error("CASFOD Address is required");
  }
  if (VAT === undefined || VAT === null) {
    throw new Error("VAT is required");
  }

  // Validate item groups
  const validatedItemGroups = itemGroups.map((item) => {
    if (!item.unitCost || item.unitCost <= 0) {
      throw new Error(
        `Unit cost is required and must be greater than 0 for item: ${item.itemName}`
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

  const purchaseOrder = new PurchaseOrder({
    RFQTitle,
    deliveryDate,
    poDate,
    casfodAddressId,
    VAT,
    itemGroups: validatedItemGroups,
    copiedTo: cleanedCopiedTo,
    selectedVendor: cleanedSelectedVendor,
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
      header: `Your Purchase Order is ${status}`,
    });

    // Notify approvers
    {
      purchaseOrder.status !== "approved" &&
        notify.notifyApprovers({
          request: purchaseOrder,
          currentUser: approvedByUser,
          requestType: "purchaseOrder",
          title: "Purchase Order",
          header: "You have been assigned a request",
        });
    }
    // notify.notifyApprovers({
    //   request: purchaseOrder,
    //   currentUser: approvedByUser,
    //   requestType: "purchaseOrder",
    //   title: "Purchase Order",
    //   header: `Your Purchase Order has been ${status}`,
    // });

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

        // Only send rejection emails for POs that are from RFQ
        if (status === "rejected" && !purchaseOrder.isFromRFQ) {
          console.log(
            `ℹ️  Skipping rejection email for independent PO: ${purchaseOrder.POCode}`
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
      `✅ Status update notifications sent for PO: ${purchaseOrder.POCode}`
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

// Update Purchase Order - handles optional fields properly
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

  // Validate required fields if provided
  if (data.deliveryDate !== undefined && !data.deliveryDate.trim()) {
    throw new Error("Delivery Date is required");
  }
  if (data.poDate !== undefined && !data.poDate.trim()) {
    throw new Error("PO Date is required");
  }
  if (data.casfodAddressId !== undefined && !data.casfodAddressId) {
    throw new Error("CASFOD Address is required");
  }
  if (data.VAT !== undefined && (data.VAT === null || data.VAT === "")) {
    throw new Error("VAT is required");
  }

  // Recalculate totals if itemGroups are updated
  if (data.itemGroups) {
    const validatedItemGroups = data.itemGroups.map((item) => {
      if (!item.unitCost || item.unitCost <= 0) {
        throw new Error(
          `Unit cost is required and must be greater than 0 for item: ${item.itemName}`
        );
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

// Update Purchase Order Status - handles pdfFile separately
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
