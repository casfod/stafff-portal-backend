const Report = require("../models/ReportModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");
const handleFileUploads = require("../utils/FileUploads");
const notify = require("../utils/notify");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const BaseCopyService = require("./BaseCopyService");
const searchConfig = require("../utils/searchConfig");
const statusUpdateService = require("./statusUpdateService");

class copyService extends BaseCopyService {
  constructor() {
    super(Report, "Report");
  }
}

const ReportCopyService = new copyService();

// Get all reports
const getReports = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;

  const searchFields = searchConfig.report;

  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  const commonConditions = [
    { createdBy: currentUser._id },
    { copiedTo: currentUser._id },
  ];

  let roleSpecificConditions = [];

  switch (currentUser.role) {
    case "STAFF":
      break;

    case "ADMIN":
      roleSpecificConditions.push({ approvedBy: currentUser._id });
      break;

    case "REVIEWER":
      roleSpecificConditions.push({ reviewedBy: currentUser._id });
      break;

    case "SUPER-ADMIN":
      roleSpecificConditions.push(
        { status: { $ne: "draft" } },
        {
          $and: [{ createdBy: currentUser._id }, { status: "draft" }],
        }
      );
      break;

    default:
      throw new Error("Invalid user role");
  }

  query.$or = [...commonConditions, ...roleSpecificConditions];

  const sortQuery = buildSortQuery(sort);

  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
    { path: "project" }, // Changed from select: "*" to just populate the whole project
  ];

  const {
    results: reports,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    Report,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  const reportsWithFiles = await Promise.all(
    reports.map(async (report) => {
      report.comments = report.comments.filter((comment) => !comment.deleted);

      const files = await fileService.getFilesByDocument("Reports", report._id);
      return {
        ...report.toJSON(),
        files,
      };
    })
  );

  return {
    reports: reportsWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// Get a single report by ID
// Get a single report by ID
const getReportById = async (id) => {
  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
    { path: "project" }, // Changed from select: "*" to just populate the whole project
  ];

  const report = await Report.findById(id).populate(populateOptions).lean();

  if (!report) {
    throw new Error("Report not found");
  }

  // Ensure project is properly populated
  if (report.project && typeof report.project === "object") {
    // Convert project _id to id if needed
    if (report.project._id && !report.project.id) {
      report.project.id = report.project._id.toString();
    }
  }

  report.comments = report.comments.filter((comment) => !comment.deleted);

  const files = await fileService.getFilesByDocument("Reports", id);

  return normalizeId({
    ...report,
    files: normalizeFiles(files),
  });
};

// Create a new report
const createReport = async (data) => {
  const report = new Report(data);
  return await report.save();
};

// Save a report (draft)
const saveReport = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.comments = undefined;

  const report = new Report({ ...data, status: "draft" });
  return await report.save();
};

// Save and send a report (pending)
const saveAndSendReport = async (data, currentUser, files = []) => {
  data.createdBy = currentUser._id;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }

  const report = new Report({ ...data, status: "pending" });
  await report.save();

  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: report._id,
      modelTable: "Reports",
    });
  }

  notify.notifyReviewers({
    request: report,
    currentUser: currentUser,
    requestType: "report",
    title: "Report",
    header: "You have been assigned a report to review",
  });

  return report;
};

// Get report stats
const getReportStats = async (currentUser) => {
  if (!currentUser?._id) {
    throw new Error("Invalid user information");
  }

  const baseMatch = {
    status: { $ne: "draft" },
  };

  switch (currentUser.role) {
    case "SUPER-ADMIN":
      break;

    default:
      baseMatch.createdBy = currentUser._id;
      break;
  }

  const stats = await Report.aggregate([
    { $match: baseMatch },
    {
      $facet: {
        totalReports: [{ $count: "count" }],
        totalApprovedReports: [
          { $match: { status: "approved" } },
          { $count: "count" },
        ],
      },
    },
  ]);

  return {
    totalReports: stats[0].totalReports[0]?.count || 0,
    totalApprovedReports: stats[0].totalApprovedReports[0]?.count || 0,
  };
};

// Update a report
const updateReport = async (id, data, files = [], currentUser) => {
  const updatedReport = await Report.findByIdAndUpdate(id, data, { new: true });

  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: updatedReport._id,
      modelTable: "Reports",
    });
  }

  if (updatedReport.status === "reviewed") {
    notify.notifyApprovers({
      request: updatedReport,
      currentUser: currentUser,
      requestType: "report",
      title: "Report",
      header: "A report has been reviewed and needs your approval",
    });
  }

  return updatedReport;
};

const updateReportStatus = async (id, data, currentUser) => {
  return await statusUpdateService.updateRequestStatusWithComment({
    Model: Report,
    id,
    data,
    currentUser,
    requestType: "report",
    title: "Report",
  });
};

// Delete a report
const deleteReport = async (id) => {
  await fileService.deleteFilesByDocument("Reports", id);
  return await Report.findByIdAndDelete(id);
};

// Add a comment to a report
const addComment = async (id, currentUser, text) => {
  const report = await Report.findById(id);
  const userId = currentUser._id;

  if (!report) {
    throw new Error("Report not found");
  }

  const canComment =
    report.createdBy.toString() === userId.toString() ||
    report.copiedTo.some(
      (copiedUserId) => copiedUserId.toString() === userId.toString()
    ) ||
    (report.reviewedBy && report.reviewedBy.toString() === userId.toString()) ||
    (report.approvedBy && report.approvedBy.toString() === userId.toString()) ||
    currentUser.role === "SUPER-ADMIN";

  if (!canComment) {
    throw new Error("You don't have permission to comment on this report");
  }

  const newComment = {
    user: userId,
    text: text.trim(),
    edited: false,
    deleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  report.comments.unshift(newComment);
  await report.save();

  const populatedReport = await Report.findById(id)
    .populate("comments.user", "email first_name last_name role")
    .lean();

  const populatedComments = populatedReport.comments.filter(
    (comment) => !comment.deleted
  );
  const addedComment = populatedComments.find(
    (comment) =>
      comment.user._id.toString() === userId.toString() &&
      comment.text === text.trim() &&
      comment.createdAt.toString() === newComment.createdAt.toString()
  );

  return addedComment;
};

// Update a comment
const updateComment = async (id, commentId, userId, text) => {
  const report = await Report.findById(id);

  if (!report) {
    throw new Error("Report not found");
  }

  const comment = report.comments.id(commentId);

  if (!comment) {
    throw new Error("Comment not found");
  }

  if (comment.user.toString() !== userId.toString()) {
    throw new Error("You can only edit your own comments");
  }

  comment.text = text.trim();
  comment.edited = true;
  comment.updatedAt = new Date();

  await report.save();

  const populatedReport = await Report.findById(id)
    .populate("comments.user", "email first_name last_name role")
    .lean();

  const updatedComment = populatedReport.comments.find(
    (c) => c._id.toString() === commentId.toString()
  );
  return updatedComment;
};

// Delete a comment (soft delete)
const deleteComment = async (id, commentId, userId) => {
  const report = await Report.findById(id);

  if (!report) {
    throw new Error("Report not found");
  }

  const comment = report.comments.id(commentId);

  if (!comment) {
    throw new Error("Comment not found");
  }

  const isOwner = comment.user.toString() === userId.toString();
  const isAdminOrReviewer = false;

  if (!isOwner && !isAdminOrReviewer) {
    throw new Error("You don't have permission to delete this comment");
  }

  comment.deleted = true;
  comment.updatedAt = new Date();

  await report.save();

  return { success: true, message: "Comment deleted successfully" };
};

module.exports = {
  ReportCopyService,
  createReport,
  saveReport,
  saveAndSendReport,
  getReportStats,
  getReports,
  getReportById,
  updateReport,
  updateReportStatus,
  deleteReport,
  addComment,
  updateComment,
  deleteComment,
};
