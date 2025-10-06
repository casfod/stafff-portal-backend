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

// UPDATED: Create Purchase Order from RFQ - now accepts timeline fields
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
  } = data;

  // Clean and validate IDs
  const cleanedRfqId = cleanObjectId(rfqId);
  const cleanedVendorId = cleanObjectId(vendorId);
  const cleanedApprovedBy = cleanObjectId(approvedBy);

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
  const purchaseOrder = new PurchaseOrder({
    RFQTitle: rfq.RFQTitle,
    RFQCode: rfq.RFQCode,
    itemGroups: validatedItemGroups,
    copiedTo: [cleanedVendorId],
    selectedVendor: cleanedVendorId,
    deliveryPeriod: finalDeliveryPeriod,
    bidValidityPeriod: finalBidValidityPeriod,
    guaranteePeriod: finalGuaranteePeriod,
    createdBy: currentUser._id,
    status: "pending",
    totalAmount: totalAmount,
    approvedBy: cleanedApprovedBy,
    isFromRFQ: true,
  });

  await purchaseOrder.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: purchaseOrder._id,
      modelTable: "PurchaseOrders",
    });
  }

  // Notify vendor that their bid has been selected
  await notifyVendorSelection(purchaseOrder, vendor, currentUser);

  // Notify approvers for approval
  await notifyApprovers(purchaseOrder, currentUser);

  return purchaseOrder;
};

// Create Purchase Order without RFQ
const createIndependentPurchaseOrder = async (
  purchaseOrderData,
  currentUser,
  files = []
) => {
  // Clean and validate IDs
  const cleanedSelectedVendor = cleanObjectId(purchaseOrderData.selectedVendor);
  const cleanedApprovedBy = cleanObjectId(purchaseOrderData.approvedBy);
  const cleanedCopiedTo = purchaseOrderData.copiedTo
    ? purchaseOrderData.copiedTo.map((id) => cleanObjectId(id))
    : [];

  // Validate required timeline fields
  if (!purchaseOrderData.deliveryPeriod) {
    throw new Error("Delivery Period is required");
  }
  if (!purchaseOrderData.bidValidityPeriod) {
    throw new Error("Bid Validity Period is required");
  }
  if (!purchaseOrderData.guaranteePeriod) {
    throw new Error("Guarantee Period is required");
  }

  // Validate that all items have prices
  const validatedItemGroups = purchaseOrderData.itemGroups.map((item) => {
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

  // Create purchase order with isFromRFQ = false
  const purchaseOrder = new PurchaseOrder({
    ...purchaseOrderData,
    RFQTitle: purchaseOrderData.RFQTitle || "Purchase Order",
    itemGroups: validatedItemGroups,
    copiedTo: cleanedCopiedTo,
    selectedVendor: cleanedSelectedVendor,
    approvedBy: cleanedApprovedBy,
    createdBy: currentUser._id,
    status: "pending",
    totalAmount: totalAmount,
    isFromRFQ: false,
  });

  await purchaseOrder.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: purchaseOrder._id,
      modelTable: "PurchaseOrders",
    });
  }

  // Notify vendor that their bid has been selected (if vendor is specified)
  if (purchaseOrder.selectedVendor) {
    const vendor = await Vendor.findById(purchaseOrder.selectedVendor);
    if (vendor) {
      await notifyVendorSelection(purchaseOrder, vendor, currentUser);
    }
  }

  // Notify approvers for approval
  await notifyApprovers(purchaseOrder, currentUser);

  return purchaseOrder;
};

// Notify vendor about selection
const notifyVendorSelection = async (purchaseOrder, vendor, currentUser) => {
  try {
    await ProcurementNotificationService.sendPurchaseOrderNotification({
      vendor,
      purchaseOrder,
      currentUser,
      type: "selection",
    });

    console.log(
      `✅ Vendor ${vendor.businessName} notified about PO selection: ${purchaseOrder.POCode}`
    );
  } catch (error) {
    console.error("Error notifying vendor about selection:", error);
    throw error;
  }
};

// Notify approvers
const notifyApprovers = async (purchaseOrder, currentUser) => {
  try {
    notify.notifyApprovers({
      request: purchaseOrder,
      currentUser: currentUser,
      requestType: "purchaseOrder",
      title: "Purchase Order",
      header: "New Purchase Order requires approval",
    });

    console.log(`✅ Approvers notified for PO: ${purchaseOrder.POCode}`);
  } catch (error) {
    console.error("Error notifying approvers:", error);
    throw error;
  }
};

// Update Purchase Order status with comments and handle PDF sending
const updatePurchaseOrderStatus = async (id, data, currentUser, files = []) => {
  // Fetch the existing Purchase Order
  const existingPurchaseOrder = await PurchaseOrder.findById(id);
  if (!existingPurchaseOrder) {
    throw new Error("Purchase Order not found");
  }

  if (!currentUser) {
    throw new Error("Unauthorized");
  }

  // Add a new comment if it exists in the request body
  if (data.comment) {
    if (!existingPurchaseOrder.comments) {
      existingPurchaseOrder.comments = [];
    }

    existingPurchaseOrder.comments.unshift({
      user: currentUser.id,
      text: data.comment,
    });

    data.comments = existingPurchaseOrder.comments;
  }

  // Store the old status for comparison
  const oldStatus = existingPurchaseOrder.status;

  // Update the status and other fields
  if (data.status) {
    const validStatuses = ["pending", "approved", "rejected"];
    if (!validStatuses.includes(data.status)) {
      throw new Error("Invalid status");
    }

    existingPurchaseOrder.status = data.status;

    // Set approvedBy if status is approved
    if (data.status === "approved" && currentUser) {
      existingPurchaseOrder.approvedBy = currentUser._id;
    }
  }

  // Save the updated Purchase Order
  const updatedPurchaseOrder = await existingPurchaseOrder.save();

  // Handle PDF upload if status changed to approved and files are provided
  if (
    oldStatus !== "approved" &&
    data.status === "approved" &&
    files.length > 0
  ) {
    await handleApprovedPOWithPDF(updatedPurchaseOrder, files, currentUser);
  }

  // Notification
  await notifyStatusUpdate(
    updatedPurchaseOrder,
    data.status,
    data.comment,
    currentUser
  );

  // Return the updated Purchase Order
  return updatedPurchaseOrder;
};

// NEW: Handle approved PO with PDF
const handleApprovedPOWithPDF = async (purchaseOrder, files, currentUser) => {
  try {
    // Validate it's a PDF file
    const pdfFile = files[0];
    if (pdfFile.mimetype !== "application/pdf") {
      throw new Error(
        "Only PDF files are allowed for Purchase Order distribution"
      );
    }

    // Upload and associate the PDF file
    await handleFileUploads({
      files: [pdfFile],
      requestId: purchaseOrder._id,
      modelTable: "PurchaseOrders",
      fileType: "po_pdf",
    });

    // Get the vendor details
    const vendor = await Vendor.findById(purchaseOrder.selectedVendor);
    if (!vendor) {
      throw new Error("Selected vendor not found");
    }

    // Send PO with PDF attachment to vendor
    await sendPOWithPDFToVendor(purchaseOrder, vendor, currentUser, pdfFile);

    console.log(
      `✅ PO ${purchaseOrder.POCode} PDF sent to vendor: ${vendor.businessName}`
    );
  } catch (error) {
    console.error("Error handling approved PO with PDF:", error);
    throw error;
  }
};

// NEW: Send PO with PDF to vendor (similar to RFQ flow)
const sendPOWithPDFToVendor = async (
  purchaseOrder,
  vendor,
  currentUser,
  pdfFile
) => {
  try {
    // Upload file to get the URL
    const uploadedFile = await fileService.uploadFile(pdfFile);

    // Associate the file with the purchase order
    await fileService.associateFile(
      uploadedFile._id,
      "PurchaseOrders",
      purchaseOrder._id,
      "po_pdf"
    );

    const downloadUrl = `${process.env.API_BASE_URL}/files/${uploadedFile._id}/download`;
    const downloadFilename = `${purchaseOrder.POCode}.pdf`;

    // Send notification with PDF download link
    await ProcurementNotificationService.sendPOWithAttachment({
      vendor,
      purchaseOrder,
      currentUser,
      downloadUrl,
      downloadFilename,
    });

    console.log(
      `✅ PO ${purchaseOrder.POCode} with PDF sent to: ${vendor.businessName}`
    );
  } catch (error) {
    console.error(
      `❌ Failed to send PO with PDF to ${vendor.businessName}:`,
      error
    );
    throw error;
  }
};

// Get Purchase Order by ID
const getPurchaseOrderById = async (id) => {
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

  const purchaseOrder = await PurchaseOrder.findById(id)
    .populate(populateOptions)
    .lean();

  if (!purchaseOrder) {
    throw new Error("Purchase Order not found");
  }

  // Fetch associated files
  const files = await fileService.getFilesByDocument("PurchaseOrders", id);

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

    // Notify vendor if approved
    if (status === "approved" && purchaseOrder.selectedVendor) {
      const vendor = await Vendor.findById(purchaseOrder.selectedVendor);
      if (vendor) {
        await ProcurementNotificationService.sendPurchaseOrderNotification({
          vendor,
          purchaseOrder,
          currentUser: approvedByUser,
          type: "approval",
        });
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

// Update Purchase Order
const updatePurchaseOrder = async (id, data, files = [], currentUser) => {
  const existingPO = await PurchaseOrder.findById(id);

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
    data.copiedTo = data.copiedTo.map((id) => cleanObjectId(id));
  }

  // Validate required timeline fields if provided
  if (data.deliveryPeriod !== undefined && !data.deliveryPeriod) {
    throw new Error("Delivery Period is required");
  }
  if (data.bidValidityPeriod !== undefined && !data.bidValidityPeriod) {
    throw new Error("Bid Validity Period is required");
  }
  if (data.guaranteePeriod !== undefined && !data.guaranteePeriod) {
    throw new Error("Guarantee Period is required");
  }

  // Recalculate totals if itemGroups are updated
  if (data.itemGroups) {
    const validatedItemGroups = data.itemGroups.map((item) => {
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

    data.itemGroups = validatedItemGroups;
    data.totalAmount = validatedItemGroups.reduce(
      (sum, item) => sum + item.total,
      0
    );
  }

  const updatedPO = await PurchaseOrder.findByIdAndUpdate(
    id,
    {
      ...data,
      updatedAt: new Date(),
    },
    { new: true, runValidators: true }
  );

  // Handle file uploads if any
  if (files.length > 0) {
    await fileService.deleteFilesByDocument("PurchaseOrders", id);
    await handleFileUploads({
      files,
      requestId: updatedPO._id,
      modelTable: "PurchaseOrders",
    });
  }

  return updatedPO;
};

// Add comment to Purchase Order
const addCommentToPurchaseOrder = async (id, commentText, currentUser) => {
  if (!commentText || !commentText.trim()) {
    throw new Error("Comment text is required");
  }

  if (!currentUser) {
    throw new Error("Unauthorized");
  }

  const purchaseOrder = await PurchaseOrder.findById(id);
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
  await fileService.deleteFilesByDocument("PurchaseOrders", id);
  return await PurchaseOrder.findByIdAndDelete(id);
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
