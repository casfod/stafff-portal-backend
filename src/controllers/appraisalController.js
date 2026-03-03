// controllers/appraisalController.js
const appraisalService = require("../services/appraisalService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");
const parseJsonField = require("../utils/parseJsonField");
const appError = require("../utils/appError");

const cleanFormData = (data) => {
  const cleaned = { ...data };

  ["staffId", "supervisorId", "approvedBy"].forEach((field) => {
    if (cleaned[field] && typeof cleaned[field] === "string") {
      cleaned[field] = cleaned[field].replace(/^"+|"+$/g, "");
    }
  });

  return cleaned;
};

// Create draft
const saveDraft = catchAsync(async (req, res) => {
  req.body.objectives = parseJsonField(req.body, "objectives", true);
  req.body.safeguarding = parseJsonField(req.body, "safeguarding");

  const cleanedData = cleanFormData(req.body);
  const currentUser = await userByToken(req, res);

  const appraisal = await appraisalService.saveAppraisal(
    cleanedData,
    currentUser
  );

  handleResponse(res, 201, "Appraisal draft saved successfully", appraisal);
});

// FIXED: Submit for approval (from draft to pending)
const submit = catchAsync(async (req, res) => {
  const { id } = req.params;
  const currentUser = await userByToken(req, res);

  const appraisal = await appraisalService.submitAppraisal(id, currentUser);

  handleResponse(
    res,
    200,
    "Appraisal submitted for approval successfully",
    appraisal
  );
});

// Create and Submit in one step
const createAndSubmit = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  // First save as draft
  req.body.objectives = parseJsonField(req.body, "objectives", true);
  req.body.safeguarding = parseJsonField(req.body, "safeguarding");

  const cleanedData = cleanFormData(req.body);

  // Save the appraisal first
  const savedAppraisal = await appraisalService.saveAppraisal(
    cleanedData,
    currentUser
  );

  // Then submit it
  const appraisal = await appraisalService.submitAppraisal(
    savedAppraisal.id,
    currentUser
  );

  handleResponse(
    res,
    200,
    "Appraisal created and submitted successfully",
    appraisal
  );
});

// FIXED: Update status (Approve/Reject)
const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status, comment } = req.body;
  const currentUser = await userByToken(req, res);

  if (!["approved", "rejected"].includes(status)) {
    throw new appError("Status must be either 'approved' or 'rejected'", 400);
  }

  const appraisal = await appraisalService.updateAppraisalStatus(
    id,
    { status, comment },
    currentUser
  );

  handleResponse(res, 200, `Appraisal ${status} successfully`, appraisal);
});

// Get all
const getAll = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { search, sort, page, limit, status, period } = req.query;

  const result = await appraisalService.getAppraisals(
    { search, sort, page, limit, status, period },
    currentUser
  );

  handleResponse(res, 200, "Appraisals fetched successfully", result);
});

// Get by ID
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const appraisal = await appraisalService.getAppraisalById(id);

  handleResponse(res, 200, "Appraisal fetched successfully", appraisal);
});

// Update
const update = catchAsync(async (req, res) => {
  const { id } = req.params;

  if (req.body.objectives) {
    req.body.objectives = parseJsonField(req.body, "objectives", true);
  }
  if (req.body.performanceAreas) {
    req.body.performanceAreas = parseJsonField(
      req.body,
      "performanceAreas",
      true
    );
  }
  if (req.body.safeguarding) {
    req.body.safeguarding = parseJsonField(req.body, "safeguarding");
  }

  const cleanedData = cleanFormData(req.body);
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const appraisal = await appraisalService.updateAppraisal(
    id,
    cleanedData,
    files,
    currentUser
  );

  handleResponse(res, 200, "Appraisal updated successfully", appraisal);
});

// Update objectives only
const updateObjectives = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { objectives } = req.body;
  const currentUser = await userByToken(req, res);

  const parsedObjectives = parseJsonField({ objectives }, "objectives", true);

  const appraisal = await appraisalService.updateObjectives(
    id,
    parsedObjectives,
    currentUser
  );

  handleResponse(res, 200, "Objectives updated successfully", appraisal);
});

// Sign appraisal
const sign = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { signatureType, comments } = req.body;
  const currentUser = await userByToken(req, res);

  if (!["staff", "supervisor"].includes(signatureType)) {
    throw new appError("Signature type must be 'staff' or 'supervisor'", 400);
  }

  const appraisal = await appraisalService.signAppraisal(
    id,
    currentUser,
    signatureType,
    comments
  );

  handleResponse(res, 200, "Appraisal signed successfully", appraisal);
});

// Get stats
const getStats = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const stats = await appraisalService.getAppraisalStats(currentUser);

  handleResponse(res, 200, "Appraisal stats fetched successfully", stats);
});

// Delete
const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const currentUser = await userByToken(req, res);

  const appraisal = await appraisalService.deleteAppraisal(id);

  handleResponse(res, 200, "Appraisal deleted successfully", appraisal);
});

// Comments
const addComment = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text || text.trim() === "") {
    throw new appError("Comment text is required", 400);
  }

  const currentUser = await userByToken(req, res);
  const comment = await appraisalService.addComment(id, currentUser, text);

  handleResponse(res, 201, "Comment added successfully", comment);
});

const updateComment = catchAsync(async (req, res) => {
  const { id, commentId } = req.params;
  const { text } = req.body;

  if (!text || text.trim() === "") {
    throw new appError("Comment text is required", 400);
  }

  const currentUser = await userByToken(req, res);
  const updatedComment = await appraisalService.updateComment(
    id,
    commentId,
    currentUser._id,
    text
  );

  handleResponse(res, 200, "Comment updated successfully", updatedComment);
});

const deleteComment = catchAsync(async (req, res) => {
  const { id, commentId } = req.params;

  const currentUser = await userByToken(req, res);
  const result = await appraisalService.deleteComment(
    id,
    commentId,
    currentUser
  );

  handleResponse(res, 200, result.message, result);
});

module.exports = {
  saveDraft,
  submit,
  createAndSubmit, // FIXED: Renamed from submitFull
  updateStatus, // FIXED: Added new function
  getAll,
  getById,
  update,
  updateObjectives,
  sign,
  getStats,
  remove,
  addComment,
  updateComment,
  deleteComment,
};
