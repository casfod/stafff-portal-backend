const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");

const {
  getPaymentRequestStats,
  getPaymentRequestById,
  getPaymentRequests,
  savePaymentRequest,
  saveAndSendPaymentRequest,
  updatePaymentRequest,
  updateRequestStatus,
  deleteRequest,
} = require("../services/paymentRequestService.js");

// Get all payment requests
const getAll = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const result = await getPaymentRequests(req.query, currentUser);
  handleResponse(res, 200, "Payment requests fetched successfully", result);
});

// Save as draft
const save = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const paymentRequest = await savePaymentRequest(req.body, currentUser);
  handleResponse(res, 201, "Payment request saved as draft", paymentRequest);
});

// Submit for review /
const saveAndSend = catchAsync(async (req, res) => {
  const files = req.files || [];

  const currentUser = await userByToken(req, res);
  const paymentRequest = await saveAndSendPaymentRequest(
    req.body,
    currentUser,
    files
  );
  handleResponse(
    res,
    201,
    "Payment request submitted successfully",
    paymentRequest
  );
});

//Get stats
const getStats = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const stats = await getPaymentRequestStats(currentUser);

  handleResponse(
    res,
    200,
    "Payment requests stats fetched successfully",
    stats
  );
});

// Get a single request by ID
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const paymentRequest = await getPaymentRequestById(id);
  if (!paymentRequest) {
    return handleResponse(res, 404, "Payment request not found");
  }

  handleResponse(
    res,
    200,
    "Payment request fetched successfully",
    paymentRequest
  );
});

// Update a request
const update = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { id } = req.params;
  const data = req.body;
  const files = req.files || [];

  const paymentRequest = await updatePaymentRequest(
    id,
    data,
    files,
    currentUser
  );
  if (!paymentRequest) {
    return handleResponse(res, 404, "Payment request not found");
  }

  handleResponse(
    res,
    200,
    "Payment request updated successfully",
    paymentRequest
  );
});

const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  // Fetch the current user
  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const updatedRequest = await updateRequestStatus(id, data, currentUser);

  handleResponse(res, 200, "Request status updated", updatedRequest);
});

const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const paymentRequest = deleteRequest(id);
  if (!paymentRequest) {
    return handleResponse(res, 404, "PaymentRequest not found");
  }

  handleResponse(
    res,
    200,
    "Payment Request deleted successfully",
    paymentRequest
  );
});

module.exports = {
  getStats,
  getAll,
  getById,
  save,
  saveAndSend,
  update,
  updateStatus,
  remove,
};

/*

// Review payment request
const review = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { id } = req.params;
  const { comment } = req.body;
  const paymentRequest = await reviewPaymentRequest(id, currentUser, comment);
  handleResponse(res, 200, "Payment request reviewed", paymentRequest);
});

// Approve payment request
const approve = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { id } = req.params;
  const { comment } = req.body;
  const paymentRequest = await approvePaymentRequest(id, currentUser, comment);
  handleResponse(res, 200, "Payment request approved", paymentRequest);
});

// Reject payment request
const reject = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { id } = req.params;
  const { comment } = req.body;
  const paymentRequest = await rejectPaymentRequest(id, currentUser, comment);
  handleResponse(res, 200, "Payment request rejected", paymentRequest);
});
*/
