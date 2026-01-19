const ExpenseClaims = require("../models/ExpenseClaimsModel");
const fileService = require("../services/fileService");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const handleFileUploads = require("../utils/FileUploads");

const notify = require("../utils/notify");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const paginate = require("../utils/paginate");
const BaseCopyService = require("./BaseCopyService");
const searchConfig = require("../utils/searchConfig");
const statusUpdateService = require("./statusUpdateService");

class copyService extends BaseCopyService {
  constructor() {
    super(ExpenseClaims, "ExpenseClaims");
  }
}

const ExpenseClaimCopyService = new copyService();

// Get all ExpenseClaims
const getExpenseClaims = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;
  const searchFields = searchConfig.expenseClaims;

  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  switch (currentUser.role) {
    case "STAFF":
      query.$or = [
        { createdBy: currentUser._id },
        { copiedTo: currentUser._id },
      ];
      break;
    case "ADMIN":
      query.$or = [
        { createdBy: currentUser._id },
        { approvedBy: currentUser._id },
        { copiedTo: currentUser._id },
      ];
      break;
    case "REVIEWER":
      query.$or = [
        { createdBy: currentUser._id },
        { reviewedBy: currentUser._id },
        { copiedTo: currentUser._id },
      ];
      break;
    case "SUPER-ADMIN":
      query.$or = [
        { status: { $ne: "draft" } },
        { createdBy: currentUser._id, status: "draft" },
        { copiedTo: currentUser._id },
      ];
      break;
    default:
      throw new Error("Invalid user role");
  }

  const sortQuery = buildSortQuery(sort);

  const populateOptions = [
    { path: "project", select: "project_code account_code" },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  const {
    results: expenseClaims,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    ExpenseClaims,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  // Fetch associated files
  const expenseClaimsWithFiles = await Promise.all(
    expenseClaims.map(async (request) => {
      // Filter out deleted comments
      request.comments = request.comments.filter((comment) => !comment.deleted);

      const files = await fileService.getFilesByDocument(
        "ExpenseClaims",
        request._id
      );
      return {
        ...request.toJSON(),
        files,
      };
    })
  );

  return {
    expenseClaims: expenseClaimsWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// Save a ExpenseClaim (draft)
const saveExpenseClaim = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.staffName = `${currentUser.first_name} ${currentUser.last_name}`;
  data.comments = undefined;

  const expenseClaim = new ExpenseClaims({ ...data, status: "draft" });
  await expenseClaim.save();

  return expenseClaim;
};

// Save and send a ExpenseClaim (pending)
const saveAndSendExpenseClaim = async (data, currentUser, files = []) => {
  data.createdBy = currentUser._id;
  data.staffName = `${currentUser.first_name} ${currentUser.last_name}`;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }

  const expenseClaim = new ExpenseClaims({ ...data, status: "pending" });
  await expenseClaim.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: expenseClaim._id,
      modelTable: "ExpenseClaims",
    });
  }

  // Send notification to reviewers/admins if needed
  if (expenseClaim.status === "pending") {
    notify.notifyReviewers({
      request: expenseClaim,
      currentUser: currentUser,
      requestType: "expenseClaim",
      title: "Expense Claim",
      header: "You have been assigned a request",
    });
  }

  return expenseClaim;
};

// Get ExpenseClaim stats
const getExpenseClaimStats = async (currentUser) => {
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

  const stats = await ExpenseClaims.aggregate([
    {
      $match: baseMatch,
    },
    {
      $facet: {
        totalRequests: [{ $count: "count" }],
        totalApprovedRequests: [
          { $match: { status: "approved" } },
          { $count: "count" },
        ],
      },
    },
  ]);

  return {
    totalRequests: stats[0].totalRequests[0]?.count || 0,
    totalApprovedRequests: stats[0].totalApprovedRequests[0]?.count || 0,
  };
};

// Get a single expense claim by ID with files
const getExpenseClaimById = async (id) => {
  const populateOptions = [
    { path: "project", select: "project_code account_code" },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  const request = await ExpenseClaims.findById(id)
    .populate(populateOptions)
    .lean();

  if (!request) {
    throw new Error("Expense Claim not found");
  }

  // Filter out deleted comments
  request.comments = request.comments.filter((comment) => !comment.deleted);

  // Fetch associated files
  const files = await fileService.getFilesByDocument("ExpenseClaims", id);
  return normalizeId({
    ...request,
    files: normalizeFiles(files),
  });
};

// Update a expense claim
const updateExpenseClaim = async (id, data, files = [], currentUser) => {
  const expenseClaim = await ExpenseClaims.findByIdAndUpdate(id, data, {
    new: true,
  });

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: expenseClaim._id,
      modelTable: "ExpenseClaims",
    });
  }

  if (expenseClaim.status === "reviewed") {
    notify.notifyApprovers({
      request: expenseClaim,
      currentUser: currentUser,
      requestType: "expenseClaim",
      title: "Expense Claim",
      header: "You have been assigned a request",
    });
  }
  return expenseClaim;
};

// const updateRequestStatus = async (id, data, currentUser) => {
//   const existingRequest = await ExpenseClaims.findById(id);

//   if (!existingRequest) {
//     throw new Error("Request not found");
//   }

//   // Add a new comment if it exists in the request body
//   if (data.comment) {
//     // Initialize comments as an empty array if it doesn't exist
//     if (!existingRequest.comments) {
//       existingRequest.comments = [];
//     }

//     // Add the new comment to the top of the comments array
//     existingRequest.comments.unshift({
//       user: currentUser.id,
//       text: data.comment,
//       edited: false,
//       deleted: false,
//       createdAt: new Date(),
//       updatedAt: new Date(),
//     });

//     // Update the data object to include the modified comments
//     data.comments = existingRequest.comments;
//   }

//   // Update the status and other fields
//   if (data.status) {
//     existingRequest.status = data.status;
//   }

//   // Save and return the updated  request
//   const updatedRequest = await existingRequest.save();

//   // Notification
//   notify.notifyCreator({
//     request: updatedRequest,
//     currentUser: currentUser,
//     requestType: "expenseClaim",
//     title: "Expense Claim",
//     header: "Your request has been updated",
//   });

//   // Enhanced notifications based on status transition
//   if (data.status === "reviewed") {
//     // Also notify the creator
//     notify.notifyCreator({
//       request: updatedRequest,
//       currentUser: currentUser,
//       requestType: "expenseClaim",
//       title: "Expense Claim",
//       header: "Your request has been reviewed",
//     });
//   } else if (data.status === "approved" || data.status === "rejected") {
//     // Notify the creator when approved or rejected
//     notify.notifyCreator({
//       request: updatedRequest,
//       currentUser: currentUser,
//       requestType: "expenseClaim",
//       title: "Expense Claim",
//       header: `Your request has been ${data.status}`,
//     });

//     // If approved, also notify the reviewer

//     notify.notifyReviewers({
//       request: updatedRequest,
//       currentUser: currentUser,
//       requestType: "expenseClaim",
//       title: "Expense Claim",
//       header: `This request has been ${data.status}`,
//     });
//   }
// };

const updateRequestStatus = async (id, data, currentUser) => {
  return await statusUpdateService.updateRequestStatusWithComment({
    Model: ExpenseClaims,
    id,
    data,
    currentUser,
    requestType: "expenseClaim",
    title: "Expense Claim",
  });
};

// Delete a expense claim and its files
const deleteExpenseClaim = async (id) => {
  await fileService.deleteFilesByDocument("ExpenseClaims", id);

  return await ExpenseClaims.findByIdAndDelete(id);
};

//////////////////////////
// comment to Request
//////////////////////////

// Add a comment to Request
const addComment = async (id, currentUser, text) => {
  const request = await ExpenseClaims.findById(id);
  const userId = currentUser._id;

  if (!request) {
    throw new Error("Request not found");
  }

  // Check if user has permission to comment
  const canComment =
    request.createdBy.toString() === userId.toString() ||
    request.copiedTo.some(
      (copiedUserId) => copiedUserId.toString() === userId.toString()
    ) ||
    (request.reviewedBy &&
      request.reviewedBy.toString() === userId.toString()) ||
    (request.approvedBy &&
      request.approvedBy.toString() === userId.toString()) ||
    currentUser.role === "SUPER-ADMIN";

  if (!canComment) {
    throw new Error("You don't have permission to comment on this request");
  }

  const newComment = {
    user: userId,
    text: text.trim(),
    edited: false,
    deleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  request.comments.unshift(newComment);
  await request.save();

  // Populate the user field in the new comment
  const populatedRequest = await ExpenseClaims.findById(id)
    .populate("comments.user", "email first_name last_name role")
    .lean();

  // Filter out deleted comments and return the new comment
  const populatedComments = populatedRequest.comments.filter(
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
  const request = await ExpenseClaims.findById(id);

  if (!request) {
    throw new Error("Request not found");
  }

  const comment = request.comments.id(commentId);

  if (!comment) {
    throw new Error("Comment not found");
  }

  // Check if user is the owner of the comment
  if (comment.user.toString() !== userId.toString()) {
    throw new Error("You can only edit your own comments");
  }

  comment.text = text.trim();
  comment.edited = true;
  comment.updatedAt = new Date();

  await request.save();

  // Populate the user field
  const populatedRequest = await ExpenseClaims.findById(id)
    .populate("comments.user", "email first_name last_name role")
    .lean();

  // Find and return the updated comment
  const updatedComment = populatedRequest.comments.find(
    (c) => c._id.toString() === commentId.toString()
  );
  return updatedComment;
};

// Delete a comment (soft delete)
const deleteComment = async (id, commentId, userId) => {
  const request = await ExpenseClaims.findById(id);

  if (!request) {
    throw new Error("Request not found");
  }

  const comment = request.comments.id(commentId);

  if (!comment) {
    throw new Error("Comment not found");
  }

  // Check if user is the owner of the comment or has admin privileges
  const isOwner = comment.user.toString() === userId.toString();
  const isAdminOrReviewer = false; // You can add role checking here if needed

  if (!isOwner && !isAdminOrReviewer) {
    throw new Error("You don't have permission to delete this comment");
  }

  // Soft delete the comment
  comment.deleted = true;
  comment.updatedAt = new Date();

  await request.save();

  return { success: true, message: "Comment deleted successfully" };
};

module.exports = {
  ExpenseClaimCopyService,
  saveExpenseClaim,
  saveAndSendExpenseClaim,
  getExpenseClaimStats,
  getExpenseClaims,
  getExpenseClaimById,
  updateExpenseClaim,
  updateRequestStatus,
  deleteExpenseClaim,
  addComment,
  updateComment,
  deleteComment,
};
