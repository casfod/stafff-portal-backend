const {
  saveReport,
  saveAndSendReport,
  getReports,
  getReportById,
  updateReport,
  updateReportStatus,
  deleteReport,
  getReportStats,
  ReportCopyService,
  addComment,
  updateComment,
  deleteComment,
} = require("../services/reportService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");
const appError = require("../utils/appError");

const copyReport = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body;
  const currentUser = await userByToken(req, res);

  if (!userIds || !Array.isArray(userIds)) {
    throw new appError("Please provide valid recipient user IDs", 400);
  }

  const report = await getReportById(id);
  if (!report) {
    throw new appError("Report not found", 404);
  }

  const updatedReport = await ReportCopyService.copyDocument({
    currentUser: currentUser,
    requestId: id,
    requestType: "report",
    requestTitle: "Report",
    recipients: userIds,
  });

  handleResponse(res, 200, "Report copied successfully", updatedReport);
});

const save = catchAsync(async (req, res) => {
  const data = req.body;
  const currentUser = await userByToken(req, res);

  const report = await saveReport(data, currentUser);

  handleResponse(res, 201, "Report saved successfully", report);
});

// Save and send a report (pending)
const saveAndSend = catchAsync(async (req, res) => {
  const data = req.body;
  const files = req.files || [];

  const currentUser = await userByToken(req, res);

  const report = await saveAndSendReport(data, currentUser, files);

  handleResponse(res, 201, "Report saved and sent successfully", report);
});

// Get stats
const getStats = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  const stats = await getReportStats(currentUser);

  handleResponse(res, 200, "Report stats fetched successfully", stats);
});

// Get all reports
const getAll = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;
  const currentUser = await userByToken(req, res);

  const reports = await getReports({ search, sort, page, limit }, currentUser);

  handleResponse(res, 200, "All reports fetched successfully", reports);
});

// Get a single report by ID
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const report = await getReportById(id);
  if (!report) {
    return handleResponse(res, 404, "Report not found");
  }

  handleResponse(res, 200, "Report fetched successfully", report);
});

// Update a report
const update = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { id } = req.params;
  const data = req.body;
  const files = req.files || [];

  const report = await updateReport(id, data, files, currentUser);
  if (!report) {
    return handleResponse(res, 404, "Report not found");
  }

  handleResponse(res, 200, "Report updated successfully", report);
});

const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const updatedReport = await updateReportStatus(id, data, currentUser);

  handleResponse(res, 200, "Report status updated", updatedReport);
});

// Delete a report
const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const report = await deleteReport(id);
  if (!report) {
    return handleResponse(res, 404, "Report not found");
  }

  handleResponse(res, 200, "Report deleted successfully", report);
});

// Add a comment to a report
const addCommentToReport = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { text } = req.body;

  if (!text || text.trim() === "") {
    throw new appError("Comment text is required", 400);
  }

  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const comment = await addComment(id, currentUser, text);

  handleResponse(res, 201, "Comment added successfully", comment);
});

// Update a comment
const updateCommentInReport = catchAsync(async (req, res) => {
  const { id, commentId } = req.params;
  const { text } = req.body;

  if (!text || text.trim() === "") {
    throw new appError("Comment text is required", 400);
  }

  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const updatedComment = await updateComment(id, commentId, currentUser._id, text);

  handleResponse(res, 200, "Comment updated successfully", updatedComment);
});

// Delete a comment
const deleteCommentFromReport = catchAsync(async (req, res) => {
  const { id, commentId } = req.params;

  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const result = await deleteComment(id, commentId, currentUser._id);

  handleResponse(res, 200, result.message, result);
});

module.exports = {
  copyReport,
  save,
  saveAndSend,
  getAll,
  getStats,
  getById,
  update,
  updateStatus,
  remove,
  addCommentToReport,
  updateCommentInReport,
  deleteCommentFromReport,
};
