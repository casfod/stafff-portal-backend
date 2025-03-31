const catchAsync = require("../utils/catchAsync");
const { handleResponse } = require("../utils/responseHandler");
const {
  getPaymentRequests,
  createPaymentRequest,
  submitPaymentRequest,
  reviewPaymentRequest,
  approvePaymentRequest,
  rejectPaymentRequest,
} = require("../services/paymentRequest.service");
const { userByToken } = require("../services/auth.service");

// Get all payment requests
const getAll = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const result = await getPaymentRequests(req.query, currentUser);
  handleResponse(res, 200, "Payment requests fetched successfully", result);
});

// Save as draft
const save = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const paymentRequest = await createPaymentRequest(req.body, currentUser);
  handleResponse(res, 201, "Payment request saved as draft", paymentRequest);
});

// Submit for review
const saveAndSend = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const paymentRequest = await submitPaymentRequest(req.body, currentUser);
  handleResponse(
    res,
    201,
    "Payment request submitted successfully",
    paymentRequest
  );
});

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

module.exports = {
  getAll,
  save,
  saveAndSend,
  review,
  approve,
  reject,
};
