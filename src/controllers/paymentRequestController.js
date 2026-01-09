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
  PaymentRequestCopyService,
  addComment,
  updateComment,
  deleteComment,
} = require("../services/paymentRequestService.js");

const copyRequest = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body;
  const currentUser = await userByToken(req, res);

  if (!userIds || !Array.isArray(userIds)) {
    throw new appError("Please provide valid recipient user IDs", 400);
  }
  const paymentRequest = await getPaymentRequestById(id);
  if (!paymentRequest) {
    throw new appError("Request not found", 404);
  }

  const updatedRequest = await PaymentRequestCopyService.copyDocument({
    currentUser: currentUser,
    requestId: id,
    requestType: "paymentRequest",
    requestTitle: "Payment Request",
    recipients: userIds,
  });

  handleResponse(res, 200, "Request copied successfully", updatedRequest);
});

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

// Add a comment to advance request
const addCommentToRequest = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text || text.trim() === "") {
    throw new appError("Comment text is required", 400);
  }

  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const comment = await addComment(id, currentUser._id, text);

  handleResponse(res, 201, "Comment added successfully", comment);
});

// Update a comment
const updateCommentInRequest = catchAsync(async (req, res) => {
  const { id, commentId } = req.params;
  const { text } = req.body;

  if (!text || text.trim() === "") {
    throw new appError("Comment text is required", 400);
  }

  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const updatedComment = await updateComment(
    id,
    commentId,
    currentUser._id,
    text
  );

  handleResponse(res, 200, "Comment updated successfully", updatedComment);
});

// Delete a comment
const deleteCommentFromRequest = catchAsync(async (req, res) => {
  const { id, commentId } = req.params;

  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const result = await deleteComment(id, commentId, currentUser._id);

  handleResponse(res, 200, result.message, result);
});

module.exports = {
  copyRequest,
  getStats,
  getAll,
  getById,
  save,
  saveAndSend,
  update,
  updateStatus,
  remove,
  addCommentToRequest,
  updateCommentInRequest,
  deleteCommentFromRequest,
};
