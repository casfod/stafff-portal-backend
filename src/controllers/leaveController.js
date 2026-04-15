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

// Create new leave application - UPDATED for single-step approval
const createLeaveApplication = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  // Log the entire req.body for debugging
  console.log("Raw req.body:", req.body);
  console.log("Raw req.files:", req.files);

  // Parse any JSON fields
  const parsedBody = { ...req.body };

  // Handle leaveCover - it might be a string or already an object
  if (req.body.leaveCover) {
    try {
      if (typeof req.body.leaveCover === "string") {
        parsedBody.leaveCover = JSON.parse(req.body.leaveCover);
      }
    } catch (error) {
      console.error("Error parsing leaveCover:", error);
      parsedBody.leaveCover = req.body.leaveCover;
    }
  }

  console.log("Parsed body:", parsedBody);

  // SUPPORT BOTH OLD AND NEW FIELD NAMES FOR BACKWARD COMPATIBILITY
  // Priority: approvedBy > approvedById > reviewedBy > reviewedById
  let approverId = null;

  if (parsedBody.approvedBy) {
    approverId = parsedBody.approvedBy;
  } else if (parsedBody.approvedById) {
    approverId = parsedBody.approvedById;
  } else if (parsedBody.reviewedBy) {
    approverId = parsedBody.reviewedBy;
    console.log(
      "⚠ Using deprecated reviewedBy field, please update frontend to use approvedBy"
    );
  } else if (parsedBody.reviewedById) {
    approverId = parsedBody.reviewedById;
    console.log(
      "⚠ Using deprecated reviewedById field, please update frontend to use approvedBy"
    );
  }

  // Validate approver is provided
  if (!approverId) {
    throw new appError(
      "Approver field is required for submission. Please select an approver.",
      400
    );
  }

  // Validate required fields
  if (!parsedBody.leaveType) {
    throw new appError("Leave type is required", 400);
  }
  if (!parsedBody.startDate) {
    throw new appError("Start date is required", 400);
  }
  if (!parsedBody.endDate) {
    throw new appError("End date is required", 400);
  }
  if (!parsedBody.reasonForLeave) {
    throw new appError("Reason for leave is required", 400);
  }

  // Map frontend field names to backend field names - USE approvedBy
  const leaveData = {
    leaveType: parsedBody.leaveType,
    startDate: parsedBody.startDate,
    endDate: parsedBody.endDate,
    reasonForLeave: parsedBody.reasonForLeave,
    contactDuringLeave: parsedBody.contactDuringLeave || "",
    leaveCover: parsedBody.leaveCover,
    approvedBy: approverId, // Changed from reviewedBy to approvedBy
  };

  const files = req.files || [];

  const leave = await leaveService.createLeaveApplication(
    currentUser,
    leaveData,
    files
  );

  handleResponse(res, 201, "Leave application created successfully", leave);
});

// Save leave as draft - UPDATED
const saveLeaveDraft = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  console.log("Raw req.body for draft:", req.body);

  const parsedBody = { ...req.body };

  // Handle leaveCover - it might be a string or already an object
  if (req.body.leaveCover) {
    try {
      if (typeof req.body.leaveCover === "string") {
        parsedBody.leaveCover = JSON.parse(req.body.leaveCover);
      }
    } catch (error) {
      console.error("Error parsing leaveCover for draft:", error);
      parsedBody.leaveCover = req.body.leaveCover;
    }
  }

  console.log("Parsed body for draft:", parsedBody);

  // Support both old and new field names (optional for drafts)
  let approverId = null;
  if (parsedBody.approvedBy) {
    approverId = parsedBody.approvedBy;
  } else if (parsedBody.approvedById) {
    approverId = parsedBody.approvedById;
  } else if (parsedBody.reviewedBy) {
    approverId = parsedBody.reviewedBy;
  } else if (parsedBody.reviewedById) {
    approverId = parsedBody.reviewedById;
  }

  const leaveData = {
    leaveType: parsedBody.leaveType,
    startDate: parsedBody.startDate,
    endDate: parsedBody.endDate,
    reasonForLeave: parsedBody.reasonForLeave,
    contactDuringLeave: parsedBody.contactDuringLeave,
    leaveCover: parsedBody.leaveCover,
    approvedBy: approverId, // Can be null for drafts
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

// Update leave application - UPDATED for single-step approval
const updateLeaveApplication = catchAsync(async (req, res) => {
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const parsedBody = { ...req.body };

  // Handle leaveCover - it might be a string or already an object
  if (req.body.leaveCover) {
    try {
      if (typeof req.body.leaveCover === "string") {
        parsedBody.leaveCover = JSON.parse(req.body.leaveCover);
      }
    } catch (error) {
      console.error("Error parsing leaveCover for update:", error);
      parsedBody.leaveCover = req.body.leaveCover;
    }
  }

  // Support both old and new field names for backward compatibility
  const updateData = { ...parsedBody };

  // Map old field names to new ones if they exist
  if (parsedBody.reviewedBy && !parsedBody.approvedBy) {
    updateData.approvedBy = parsedBody.reviewedBy;
    console.log("⚠ Mapping reviewedBy to approvedBy in update");
  }
  if (parsedBody.reviewedById && !parsedBody.approvedById) {
    updateData.approvedById = parsedBody.reviewedById;
    console.log("⚠ Mapping reviewedById to approvedById in update");
  }

  const leave = await leaveService.updateLeaveApplication(
    req.params.id,
    updateData,
    files,
    currentUser
  );

  handleResponse(res, 200, "Leave application updated successfully", leave);
});

// Update leave status - UPDATED for single-step approval
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
