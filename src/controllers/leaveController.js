// controllers/leaveController.js
const leaveService = require("../services/leaveService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const parseJsonField = require("../utils/parseJsonField");
const userByToken = require("../utils/userByToken");
const appError = require("../utils/appError");

// Get leave statistics
const getStats = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const stats = await leaveService.getLeaveStats(currentUser);
  handleResponse(res, 200, "Leave stats fetched successfully", stats);
});

// Get user's leave balance
const getMyLeaveBalance = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const balance = await leaveService.getUserLeaveBalance(currentUser._id);
  handleResponse(res, 200, "Leave balance fetched successfully", balance);
});

// Get leave balance for a specific user (admin only)
const getUserLeaveBalance = catchAsync(async (req, res) => {
  const { userId } = req.params;
  const balance = await leaveService.getUserLeaveBalance(userId);
  handleResponse(res, 200, "User leave balance fetched successfully", balance);
});

// Create new leave application
const createLeaveApplication = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  if (req.body.status === "pending" && !req.body.reviewedBy) {
    throw new appError("ReviewedBy field is required for submission", 400);
  }

  const leaveData = {
    ...req.body,
  };

  const files = req.files || [];

  const leave = await leaveService.createLeaveApplication(
    currentUser,
    leaveData,
    files
  );

  handleResponse(res, 201, "Leave application created successfully", leave);
});

// Save leave as draft
const saveLeaveDraft = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  const leaveData = {
    ...req.body,
    status: "draft",
  };

  const leave = await leaveService.saveLeaveDraft(currentUser, leaveData);

  handleResponse(res, 201, "Leave draft saved successfully", leave);
});

// Get all leave applications
const getAllLeaves = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  const { search, sort, page, limit } = req.query;
  const result = await leaveService.getAllLeaves(
    { search, sort, page, limit },
    currentUser
  );

  handleResponse(res, 200, "Leave applications fetched successfully", result);
});

// Get leave by ID
const getLeaveById = catchAsync(async (req, res) => {
  const leave = await leaveService.getLeaveById(req.params.id);
  handleResponse(res, 200, "Leave application fetched successfully", leave);
});

// Update leave application
const updateLeaveApplication = catchAsync(async (req, res) => {
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const leave = await leaveService.updateLeaveApplication(
    req.params.id,
    req.body,
    files,
    currentUser
  );

  handleResponse(res, 200, "Leave application updated successfully", leave);
});

// Update leave status
const updateLeaveStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const currentUser = await userByToken(req, res);

  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const updatedLeave = await leaveService.updateLeaveStatus(
    id,
    data,
    currentUser
  );

  handleResponse(res, 200, "Leave status updated successfully", updatedLeave);
});

// Delete leave application
const deleteLeaveApplication = catchAsync(async (req, res) => {
  await leaveService.deleteLeave(req.params.id);
  handleResponse(res, 200, "Leave application deleted successfully");
});

// Copy leave to other users
const copyLeave = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body;
  const currentUser = await userByToken(req, res);

  if (!userIds || !Array.isArray(userIds)) {
    throw new appError("Please provide valid recipient user IDs", 400);
  }

  const leave = await leaveService.getLeaveById(id);
  if (!leave) {
    throw new appError("Leave application not found", 404);
  }

  const updatedLeave = await leaveService.copyLeave({
    currentUser,
    requestId: id,
    recipients: userIds,
  });

  handleResponse(
    res,
    200,
    "Leave application copied successfully",
    updatedLeave
  );
});

// Add comment
const addComment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;
  const currentUser = await userByToken(req, res);

  if (!text || text.trim() === "") {
    throw new appError("Comment text is required", 400);
  }

  const comment = await leaveService.addComment(id, currentUser, text);
  handleResponse(res, 201, "Comment added successfully", comment);
});

// Update comment
const updateComment = catchAsync(async (req, res) => {
  const { id, commentId } = req.params;
  const { text } = req.body;
  const currentUser = await userByToken(req, res);

  if (!text || text.trim() === "") {
    throw new appError("Comment text is required", 400);
  }

  const updatedComment = await leaveService.updateComment(
    id,
    commentId,
    currentUser._id,
    text
  );

  handleResponse(res, 200, "Comment updated successfully", updatedComment);
});

// Delete comment
const deleteComment = catchAsync(async (req, res) => {
  const { id, commentId } = req.params;
  const currentUser = await userByToken(req, res);

  const result = await leaveService.deleteComment(
    id,
    commentId,
    currentUser._id
  );

  handleResponse(res, 200, result.message);
});

module.exports = {
  getStats,
  getMyLeaveBalance,
  getUserLeaveBalance,
  getAllLeaves,
  getLeaveById,
  createLeaveApplication,
  saveLeaveDraft,
  updateLeaveApplication,
  updateLeaveStatus,
  deleteLeaveApplication,
  copyLeave,
  addComment,
  updateComment,
  deleteComment,
};
