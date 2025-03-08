const {
  createPurchaseRequest,
  savePurchaseRequest,
  saveAndSendPurchaseRequest,
  getPurchaseRequests,
  getPurchaseRequestById,
  updatePurchaseRequest,
  deletePurchaseRequest,
} = require("../services/purchaseRequestService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");

// Create a new purchase request
const create = catchAsync(async (req, res) => {
  const data = req.body;
  const purchaseRequest = await createPurchaseRequest(data);

  handleResponse(
    res,
    201,
    "Purchase request created successfully",
    purchaseRequest
  );
});

// Save a purchase request (draft)
const save = catchAsync(async (req, res) => {
  const data = req.body;
  const purchaseRequest = await savePurchaseRequest(data);

  handleResponse(
    res,
    201,
    "Purchase request saved successfully",
    purchaseRequest
  );
});

// Save and send a purchase request (pending)
const saveAndSend = catchAsync(async (req, res) => {
  const data = req.body;
  const purchaseRequest = await saveAndSendPurchaseRequest(data);

  handleResponse(
    res,
    201,
    "Purchase request saved and sent successfully",
    purchaseRequest
  );
});

// Get all purchase requests
const getAll = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;
  const currentUser = await userByToken(req, res);

  const purchaseRequests = await getPurchaseRequests(
    { search, sort, page, limit },
    currentUser
  );

  handleResponse(
    res,
    200,
    "All purchase requests fetched successfully",
    purchaseRequests
  );
});

// Get a single purchase request by ID
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const purchaseRequest = await getPurchaseRequestById(id);
  if (!purchaseRequest) {
    return handleResponse(res, 404, "Purchase request not found");
  }

  handleResponse(
    res,
    200,
    "Purchase request fetched successfully",
    purchaseRequest
  );
});

// Update a purchase request
const update = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const purchaseRequest = await updatePurchaseRequest(id, data);
  if (!purchaseRequest) {
    return handleResponse(res, 404, "Purchase request not found");
  }

  handleResponse(
    res,
    200,
    "Purchase request updated successfully",
    purchaseRequest
  );
});

// Delete a purchase request
const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const purchaseRequest = await deletePurchaseRequest(id);
  if (!purchaseRequest) {
    return handleResponse(res, 404, "Purchase request not found");
  }

  handleResponse(
    res,
    200,
    "Purchase request deleted successfully",
    purchaseRequest
  );
});

module.exports = { create, save, saveAndSend, getAll, getById, update, remove };
