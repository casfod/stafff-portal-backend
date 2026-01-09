const {
  savePurchaseRequest,
  saveAndSendPurchaseRequest,
  getPurchaseRequests,
  getPurchaseRequestById,
  updatePurchaseRequest,
  updateRequestStatus,
  deletePurchaseRequest,
  getPurchaseRequestStats,
  PurchaseRequestCopyService,
  addComment,
  updateComment,
  deleteComment,
} = require("../services/purchaseRequestService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const parseJsonField = require("../utils/parseJsonField");
const userByToken = require("../utils/userByToken");

const copyRequest = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body;
  const currentUser = await userByToken(req, res);

  if (!userIds || !Array.isArray(userIds)) {
    throw new appError("Please provide valid recipient user IDs", 400);
  }

  const purchaseRequest = await getPurchaseRequestById(id);
  if (!purchaseRequest) {
    throw new appError("Request not found", 404);
  }

  const updatedRequest = await PurchaseRequestCopyService.copyDocument({
    currentUser: currentUser,
    requestId: id,
    requestType: "purchaseRequest",
    requestTitle: "Purchase Request",
    recipients: userIds,
  });

  handleResponse(res, 200, "Request copied successfully", updatedRequest);
});

const save = catchAsync(async (req, res) => {
  const data = req.body;
  const currentUser = await userByToken(req, res);

  const purchaseRequest = await savePurchaseRequest(data, currentUser);

  handleResponse(
    res,
    201,
    "Purchase request saved successfully",
    purchaseRequest
  );
});

// Save and send a purchase request (pending)
const saveAndSend = catchAsync(async (req, res) => {
  req.body.periodOfActivity = parseJsonField(
    req.body,
    "periodOfActivity",
    true
  );
  req.body.itemGroups = parseJsonField(req.body, "itemGroups", true);

  const data = req.body;
  const files = req.files || [];

  const currentUser = await userByToken(req, res);

  const purchaseRequest = await saveAndSendPurchaseRequest(
    data,
    currentUser,
    files
  );

  handleResponse(
    res,
    201,
    "Purchase request saved and sent successfully",
    purchaseRequest
  );
});

//Get stats
const getStats = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  const stats = await getPurchaseRequestStats(currentUser);

  handleResponse(
    res,
    200,
    "Purchase requests stats fetched successfully",
    stats
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
  const currentUser = await userByToken(req, res);
  const { id } = req.params;
  const data = req.body;
  const files = req.files || [];

  const purchaseRequest = await updatePurchaseRequest(
    id,
    data,
    files,
    currentUser
  );
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
  save,
  saveAndSend,
  getAll,
  getStats,
  getById,
  update,
  updateStatus,
  remove,
  addCommentToRequest,
  updateCommentInRequest,
  deleteCommentFromRequest,
};
