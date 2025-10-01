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
const copyRFQ = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { vendorIds } = req.body;
  const currentUser = await userByToken(req, res);

  if (!vendorIds || !Array.isArray(vendorIds)) {
    throw new Error("Please provide valid vendor IDs");
  }

  const updatedRFQ = await copyRFQToVendors({
    currentUser,
    requestId: id,
    recipients: vendorIds,
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

// Save and send RFQ
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
  const currentUser = await userByToken(req, res);

  const rfqs = await getRFQs({ search, sort, page, limit }, currentUser);
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
  const currentUser = await userByToken(req, res);

  req.body.itemGroups = parseJsonField(req.body, "itemGroups", true);

  const rfq = await updateRFQ(id, data, files, currentUser);
  handleResponse(res, 200, "RFQ updated successfully", rfq);
});

// Update RFQ status
const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const currentUser = await userByToken(req, res);

  const rfq = await updateRFQStatus(id, status, currentUser);
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
