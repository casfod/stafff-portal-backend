const {
  saveRFQ,
  getRFQs,
  getRFQById,
  updateRFQ,
  updateRFQStatus,
  deleteRFQ,
  copyRFQToVendors,
  savetoSendRFQ,
} = require("../services/rfqService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");
const parseJsonField = require("../utils/parseJsonField");

// Copy RFQ to vendors
// Copy RFQ to vendors - handles FormData array format
const copyRFQ = catchAsync(async (req, res) => {
  const { id } = req.params;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  let vendorIdsArray = [];

  // Check for different possible formats
  if (req.body.vendorIds && Array.isArray(req.body.vendorIds)) {
    vendorIdsArray = req.body.vendorIds;
  } else if (req.body.vendorIds) {
    vendorIdsArray = [req.body.vendorIds];
  } else if (
    req.body["vendorIds[]"] &&
    Array.isArray(req.body["vendorIds[]"])
  ) {
    vendorIdsArray = req.body["vendorIds[]"];
  } else if (req.body["vendorIds[]"]) {
    vendorIdsArray = [req.body["vendorIds[]"]];
  } else {
    // Try to find any keys that start with vendorIds
    const vendorKeys = Object.keys(req.body).filter(
      (key) => key.startsWith("vendorIds") || key.includes("vendorIds")
    );
    if (vendorKeys.length > 0) {
      vendorKeys.forEach((key) => {
        if (Array.isArray(req.body[key])) {
          vendorIdsArray = vendorIdsArray.concat(req.body[key]);
        } else {
          vendorIdsArray.push(req.body[key]);
        }
      });
    }
  }

  // Enhanced validation
  if (!vendorIdsArray || vendorIdsArray.length === 0) {
    throw new Error("Please provide at least one valid vendor ID");
  }

  // Clean the array
  vendorIdsArray = vendorIdsArray.filter((id) => id && id.trim().length > 0);

  if (vendorIdsArray.length === 0) {
    throw new Error("Please provide valid vendor IDs");
  }

  // Validate MongoDB ObjectIds
  const isValidObjectId = (id) => /^[0-9a-fA-F]{24}$/.test(id);
  const invalidIds = vendorIdsArray.filter((id) => !isValidObjectId(id));

  if (invalidIds.length > 0) {
    throw new Error(`Invalid vendor ID format: ${invalidIds.join(", ")}`);
  }

  // Validate PDF file
  if (files.length > 1) {
    throw new Error("Only one PDF file is allowed for RFQ distribution");
  }

  const updatedRFQ = await copyRFQToVendors({
    currentUser,
    requestId: id,
    recipients: vendorIdsArray,
    files,
  });

  handleResponse(res, 200, "RFQ sent to vendors successfully", updatedRFQ);
});

// Save RFQ (draft)
const save = catchAsync(async (req, res) => {
  const data = req.body;
  const currentUser = await userByToken(req, res);

  const rfq = await saveRFQ(data, currentUser);
  handleResponse(res, 201, "RFQ saved successfully", rfq);
});

// Save and send RFQ (preview)
const savetoSend = catchAsync(async (req, res) => {
  req.body.itemGroups = parseJsonField(req.body, "itemGroups", true);

  const data = req.body;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const rfq = await savetoSendRFQ(data, currentUser, files);
  handleResponse(res, 201, "RFQ prepared successfully", rfq);
});

// Get all RFQs
const getAll = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;

  const rfqs = await getRFQs({ search, sort, page, limit });
  handleResponse(res, 200, "RFQs fetched successfully", rfqs);
});

// Get RFQ by ID
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const rfq = await getRFQById(id);

  handleResponse(res, 200, "RFQ fetched successfully", rfq);
});

// Update RFQ - only for preview/draft
const update = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const files = req.files || [];

  req.body.itemGroups = parseJsonField(req.body, "itemGroups", true);

  const rfq = await updateRFQ(id, data, files);
  handleResponse(res, 200, "RFQ updated successfully", rfq);
});

// Update RFQ status
const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  const rfq = await updateRFQStatus(id, status);
  handleResponse(res, 200, "RFQ status updated successfully", rfq);
});

// Delete RFQ
const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const rfq = await deleteRFQ(id);

  handleResponse(res, 200, "RFQ deleted successfully", rfq);
});

module.exports = {
  copyRFQ,
  save,
  savetoSend,
  getAll,
  getById,
  update,
  updateStatus,
  remove,
};
