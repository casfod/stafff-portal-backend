// controllers/staffStrategyController.js
const staffStrategyService = require("../services/staffStrategyService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");
const parseJsonField = require("../utils/parseJsonField");
const appError = require("../utils/appError");

// Helper function to clean form data
const cleanFormData = (data) => {
  const cleaned = { ...data };

  // Remove any extra quotes from string fields
  ["staffId", "supervisorId", "approvedBy"].forEach((field) => {
    if (cleaned[field] && typeof cleaned[field] === "string") {
      cleaned[field] = cleaned[field].replace(/^"+|"+$/g, "");
    }
  });

  return cleaned;
};

// Create and Submit Staff Strategy (direct submission)
const create = catchAsync(async (req, res) => {
  // Parse JSON fields
  req.body.accountabilityAreas = parseJsonField(
    req.body,
    "accountabilityAreas",
    true
  );

  const cleanedData = cleanFormData(req.body);
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  // // Check if approvedBy is provided
  // if (!cleanedData.approvedBy) {
  //   throw new appError("Approver (approvedBy) is required", 400);
  // }

  const strategy = await staffStrategyService.createStaffStrategy(
    cleanedData,
    currentUser,
    files
  );

  handleResponse(
    res,
    201,
    "Staff Strategy created and submitted successfully",
    strategy
  );
});

// Save as Draft
const saveDraft = catchAsync(async (req, res) => {
  // Parse JSON fields
  req.body.accountabilityAreas = parseJsonField(
    req.body,
    "accountabilityAreas",
    true
  );

  const cleanedData = cleanFormData(req.body);
  const currentUser = await userByToken(req, res);

  const strategy = await staffStrategyService.saveStaffStrategy(
    cleanedData,
    currentUser
  );

  handleResponse(res, 201, "Staff Strategy draft saved successfully", strategy);
});

// Submit Draft for Approval
const submitDraft = catchAsync(async (req, res) => {
  const { id } = req.params;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const strategy = await staffStrategyService.submitStaffStrategy(
    id,
    currentUser,
    files
  );

  handleResponse(
    res,
    200,
    "Staff Strategy submitted for approval successfully",
    strategy
  );
});

// Get All Staff Strategies
const getAll = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { search, sort, page, limit } = req.query;

  const result = await staffStrategyService.getStaffStrategies(
    { search, sort, page, limit },
    currentUser
  );

  handleResponse(res, 200, "Staff Strategies fetched successfully", result);
});

// Get Staff Strategy by ID
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const strategy = await staffStrategyService.getStaffStrategyById(id);

  handleResponse(res, 200, "Staff Strategy fetched successfully", strategy);
});

// Update Staff Strategy
const update = catchAsync(async (req, res) => {
  const { id } = req.params;

  // Parse JSON fields
  if (req.body.accountabilityAreas) {
    req.body.accountabilityAreas = parseJsonField(
      req.body,
      "accountabilityAreas",
      true
    );
  }

  const cleanedData = cleanFormData(req.body);
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const strategy = await staffStrategyService.updateStaffStrategy(
    id,
    cleanedData,
    files,
    currentUser
  );

  handleResponse(res, 200, "Staff Strategy updated successfully", strategy);
});

// Update Status (Approve/Reject)
const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, comment } = req.body;
  const pdfFile = req.file;
  const currentUser = await userByToken(req, res);

  // Validate status
  if (!["approved", "rejected"].includes(status)) {
    return handleResponse(
      res,
      400,
      "Status must be either 'approved' or 'rejected'"
    );
  }

  const strategy = await staffStrategyService.updateStaffStrategyStatus(
    id,
    { status, comment },
    currentUser,
    pdfFile
  );

  handleResponse(res, 200, `Staff Strategy ${status} successfully`, strategy);
});

// Add a comment to Staff Strategy
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

  const comment = await staffStrategyService.addComment(id, currentUser, text);

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

  const updatedComment = await staffStrategyService.updateComment(
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

  const result = await staffStrategyService.deleteComment(
    id,
    commentId,
    currentUser._id
  );

  handleResponse(res, 200, result.message, result);
});

// Delete Staff Strategy (only drafts)
const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const currentUser = await userByToken(req, res);

  const strategy = await staffStrategyService.deleteStaffStrategy(id);

  handleResponse(res, 200, "Staff Strategy deleted successfully", strategy);
});

module.exports = {
  create,
  saveDraft,
  submitDraft,
  getAll,
  getById,
  update,
  updateStatus,
  addCommentToRequest,
  updateCommentInRequest,
  deleteCommentFromRequest,
  remove,
};
