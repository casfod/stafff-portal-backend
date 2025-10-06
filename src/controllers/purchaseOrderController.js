const purchaseOrderService = require("../services/purchaseOrderService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");
const parseJsonField = require("../utils/parseJsonField");

// Helper function to clean form data
const cleanFormData = (data) => {
  const cleaned = { ...data };

  // Remove any extra quotes from string fields
  if (cleaned.approvedBy && typeof cleaned.approvedBy === "string") {
    cleaned.approvedBy = cleaned.approvedBy.replace(/^"+|"+$/g, "");
  }
  if (cleaned.selectedVendor && typeof cleaned.selectedVendor === "string") {
    cleaned.selectedVendor = cleaned.selectedVendor.replace(/^"+|"+$/g, "");
  }

  return cleaned;
};

// UPDATED: Create Purchase Order from RFQ - now handles timeline fields
const createFromRFQ = catchAsync(async (req, res) => {
  const { rfqId, vendorId } = req.params;
  const {
    itemGroups,
    approvedBy,
    deliveryPeriod,
    bidValidityPeriod,
    guaranteePeriod,
  } = req.body;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  // Clean the approvedBy field
  const cleanedApprovedBy = approvedBy
    ? approvedBy.replace(/^"+|"+$/g, "")
    : null;

  // Parse itemGroups if it's a string
  const parsedItemGroups =
    typeof itemGroups === "string" ? JSON.parse(itemGroups) : itemGroups;

  const purchaseOrder = await purchaseOrderService.createPurchaseOrderFromRFQ(
    rfqId,
    vendorId,
    {
      itemGroups: parsedItemGroups,
      approvedBy: cleanedApprovedBy,
      deliveryPeriod,
      bidValidityPeriod,
      guaranteePeriod,
    },
    currentUser,
    files
  );

  handleResponse(
    res,
    201,
    "Purchase Order created successfully from RFQ",
    purchaseOrder
  );
});

// Create Independent Purchase Order
const createIndependent = catchAsync(async (req, res) => {
  req.body.itemGroups = parseJsonField(req.body, "itemGroups", true);
  req.body.copiedTo = parseJsonField(req.body, "copiedTo", false);
  req.body.selectedVendor = parseJsonField(req.body, "selectedVendor", false);

  // Clean the form data
  const cleanedData = cleanFormData(req.body);

  const purchaseOrderData = cleanedData;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const purchaseOrder =
    await purchaseOrderService.createIndependentPurchaseOrder(
      purchaseOrderData,
      currentUser,
      files
    );

  handleResponse(
    res,
    201,
    "Purchase Order created successfully",
    purchaseOrder
  );
});

// Update Purchase Order
const update = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  req.body.itemGroups = parseJsonField(req.body, "itemGroups", true);
  req.body.copiedTo = parseJsonField(req.body, "copiedTo", false);
  req.body.selectedVendor = parseJsonField(req.body, "selectedVendor", false);

  // Clean the form data
  const cleanedData = cleanFormData(req.body);

  const purchaseOrder = await purchaseOrderService.updatePurchaseOrder(
    id,
    cleanedData,
    files,
    currentUser
  );

  handleResponse(
    res,
    200,
    "Purchase Order updated successfully",
    purchaseOrder
  );
});

// Get all Purchase Orders
const getAll = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { search, sort, page, limit } = req.query;

  const result = await purchaseOrderService.getPurchaseOrders(
    { search, sort, page, limit },
    currentUser
  );

  handleResponse(res, 200, "Purchase Orders fetched successfully", result);
});

// Get Purchase Order by ID
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const purchaseOrder = await purchaseOrderService.getPurchaseOrderById(id);

  handleResponse(
    res,
    200,
    "Purchase Order fetched successfully",
    purchaseOrder
  );
});

// Update Purchase Order Status (with PDF support)
const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, comment } = req.body;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const purchaseOrder = await purchaseOrderService.updatePurchaseOrderStatus(
    id,
    { status, comment },
    currentUser,
    files
  );

  handleResponse(
    res,
    200,
    `Purchase Order ${status} successfully`,
    purchaseOrder
  );
});

// Add Comment to Purchase Order
const addComment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { comment } = req.body;
  const currentUser = await userByToken(req, res);

  if (!comment || !comment.trim()) {
    return handleResponse(res, 400, "Comment text is required");
  }

  const purchaseOrder = await purchaseOrderService.addCommentToPurchaseOrder(
    id,
    comment,
    currentUser
  );

  handleResponse(res, 200, "Comment added successfully", purchaseOrder);
});

// Delete Purchase Order
const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const purchaseOrder = await purchaseOrderService.deletePurchaseOrder(id);

  handleResponse(
    res,
    200,
    "Purchase Order deleted successfully",
    purchaseOrder
  );
});

module.exports = {
  createFromRFQ,
  createIndependent,
  getAll,
  getById,
  update,
  updateStatus,
  addComment,
  remove,
};
