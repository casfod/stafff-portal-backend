// goodsReceivedController.js - Updated with file upload
const goodsReceivedService = require("../services/goodsReceivedService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");
const parseJsonField = require("../utils/parseJsonField");

/**
 * Helper function to clean and parse goods received data
 */
const cleanGoodsReceivedData = (data) => {
  const cleaned = { ...data };

  // Parse JSON fields
  if (cleaned.GRNitems && typeof cleaned.GRNitems === "string") {
    cleaned.GRNitems = JSON.parse(cleaned.GRNitems);
  }

  // Clean ObjectId fields
  if (cleaned.purchaseOrder && typeof cleaned.purchaseOrder === "string") {
    cleaned.purchaseOrder = cleaned.purchaseOrder.replace(/^"+|"+$/g, "");
  }

  return cleaned;
};

/**
 * Create Goods Received Note with file upload
 */
const create = catchAsync(async (req, res) => {
  // Parse JSON fields
  req.body.GRNitems = parseJsonField(req.body, "GRNitems", true);

  // Clean the form data
  const cleanedData = cleanGoodsReceivedData(req.body);

  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const result = await goodsReceivedService.createGoodsReceived(
    cleanedData,
    currentUser,
    files
  );

  handleResponse(res, 201, result.message, result.goodsReceived);
});

/**
 * Get all Goods Received Notes with filtering
 */
const getAll = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { search, sort, page, limit } = req.query;

  const result = await goodsReceivedService.getGoodsReceivedNotes(
    { search, sort, page, limit },
    currentUser
  );

  handleResponse(res, 200, "Goods Received Notes fetched successfully", result);
});

/**
 * Get Goods Received Note by ID
 */
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await goodsReceivedService.getGoodsReceivedById(id);

  handleResponse(res, 200, result.message, result.goodsReceived);
});

/**
 * Update Goods Received Note with file upload
 */
const update = catchAsync(async (req, res) => {
  const { id } = req.params;

  // Parse JSON fields
  req.body.GRNitems = parseJsonField(req.body, "GRNitems", true);

  // Clean the form data
  const cleanedData = cleanGoodsReceivedData(req.body);

  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const result = await goodsReceivedService.updateGoodsReceived(
    id,
    cleanedData,
    currentUser,
    files
  );

  handleResponse(res, 200, result.message, result.goodsReceived);
});

/**
 * Add files to existing Goods Received Note (dedicated endpoint)
 */
const addFiles = catchAsync(async (req, res) => {
  const { id } = req.params;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  if (!files || files.length === 0) {
    return handleResponse(res, 400, "No files provided");
  }

  const result = await goodsReceivedService.addFilesToGoodsReceived(
    id,
    files,
    currentUser
  );

  handleResponse(res, 200, result.message, result.goodsReceived);
});

/**
 * Delete Goods Received Note
 */
const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await goodsReceivedService.deleteGoodsReceived(id);

  handleResponse(res, 200, result.message, result.goodsReceived);
});

/**
 * Get Goods Received Notes by Purchase Order
 */
const getByPurchaseOrder = catchAsync(async (req, res) => {
  const { purchaseOrderId } = req.params;
  const result = await goodsReceivedService.getGoodsReceivedByPurchaseOrder(
    purchaseOrderId
  );

  handleResponse(res, 200, result.message, result);
});

/**
 * Check if GRN exists for Purchase Order
 */
const checkGRNExists = catchAsync(async (req, res) => {
  const { purchaseOrderId } = req.params;
  const grnStatus = await goodsReceivedService.checkGRNExists(purchaseOrderId);

  handleResponse(res, 200, grnStatus.message, grnStatus);
});

/**
 * Get Goods Received Summary
 */
const getSummary = catchAsync(async (req, res) => {
  const { purchaseOrderId } = req.query;
  const result = await goodsReceivedService.getGoodsReceivedSummary(
    purchaseOrderId
  );

  handleResponse(res, 200, result.message, result.summary);
});

module.exports = {
  create,
  getAll,
  getById,
  update,
  remove,
  getByPurchaseOrder,
  getSummary,
  checkGRNExists,
  addFiles, // New controller for dedicated file upload
};
