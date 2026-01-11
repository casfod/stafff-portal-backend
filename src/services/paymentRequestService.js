const PaymentRequest = require("../models/PaymentRequestModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");
const BaseCopyService = require("./BaseCopyService");
const handleFileUploads = require("../utils/FileUploads");
const notify = require("../utils/notify");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const searchConfig = require("../utils/searchConfig");

class copyService extends BaseCopyService {
  constructor() {
    super(PaymentRequest, "PaymentRequest");
  }
}

const PaymentRequestCopyService = new copyService();

// Get request stats
const getPaymentRequestStats = async (currentUser) => {
  if (!currentUser?._id) {
    throw new Error("Invalid user information");
  }

  // Initialize base match conditions
  const baseMatch = {
    status: { $ne: "draft" },
  };

  // Role-based filtering using switch
  switch (currentUser.role) {
    case "SUPER-ADMIN":
      //  case "ADMIN":
      // No additional filters for admin roles
      break;

    default:
      // For all other roles, only count their own requests
      baseMatch.requestedBy = currentUser._id;
      break;
  }

  const stats = await PaymentRequest.aggregate([
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

/**
 * Get all payment requests with filters, sorting, and pagination
 */
const getPaymentRequests = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;

  // Fields to search in
  const searchFields = searchConfig.paymentRequest;
  // Build search query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  // Role-based filtering
  switch (currentUser.role) {
    case "STAFF":
      query.$or = [
        { requestedBy: currentUser._id }, // Their own requests
        { copiedTo: currentUser._id }, // Requests they're copied on
      ];
      break;

    case "ADMIN":
      query.$or = [
        { requestedBy: currentUser._id }, // Their own requests
        { approvedBy: currentUser._id }, // Requests they approved
        { copiedTo: currentUser._id }, // Requests they're copied on
      ];
      break;

    case "REVIEWER":
      query.$or = [
        { requestedBy: currentUser._id }, // Their own requests
        { reviewedBy: currentUser._id }, // Requests they reviewed
        { copiedTo: currentUser._id }, // Requests they're copied on
      ];
      break;

    case "SUPER-ADMIN":
      query.$or = [
        { status: { $ne: "draft" } }, // All non-draft requests
        { requestedBy: currentUser._id, status: "draft" }, // Their own drafts
        { copiedTo: currentUser._id }, // Requests they're copied on
      ];
      break;

    default:
      throw new Error("Invalid user role");
  }

  // Sort logic
  const sortQuery = buildSortQuery(sort);

  // Populate referenced fields
  const populateOptions = [
    { path: "requestedBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  // Pagination
  const {
    results: paymentRequests,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    PaymentRequest,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  // Fetch associated files
  const paymentRequestsWithFiles = await Promise.all(
    paymentRequests.map(async (request) => {
      // Filter out deleted comments
      request.comments = request.comments.filter((comment) => !comment.deleted);

      const files = await fileService.getFilesByDocument(
        "PaymentRequests",
        request._id
      );
      return {
        ...request.toJSON(),
        files,
      };
    })
  );

  return {
    paymentRequests: paymentRequestsWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// /**
//  * Create a new payment request (draft)
//  */

// Save (draft)
const savePaymentRequest = async (data, currentUser) => {
  data.requestedBy = currentUser._id;
  data.requestBy = `${currentUser.first_name} ${currentUser.last_name}`;
  data.comments = undefined;

  const paymentRequest = new PaymentRequest({ ...data, status: "draft" });
  return await paymentRequest.save();
};

// Save and send (pending)
const saveAndSendPaymentRequest = async (data, currentUser, files = []) => {
  data.requestedBy = currentUser._id;
  data.requestBy = `${currentUser.first_name} ${currentUser.last_name}`;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }
  const paymentRequest = new PaymentRequest({ ...data, status: "pending" });
  await paymentRequest.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: paymentRequest._id,
      modelTable: "PaymentRequests",
    });
  }

  // Send notification to reviewers/admins if needed
  if (paymentRequest.status === "pending") {
    notify.notifyReviewers({
      request: paymentRequest,
      currentUser: currentUser,
      requestType: "paymentRequest",
      title: "Payment Request",
      header: "You have been assigned a request",
    });
  }

  return paymentRequest;
};

// Get a single request by ID
const getPaymentRequestById = async (id) => {
  const populateOptions = [
    { path: "requestedBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  const request = await PaymentRequest.findById(id)
    .populate(populateOptions)
    .lean();

  if (!request) {
    throw new Error("Payment Request not found");
  }

  // Filter out deleted comments
  request.comments = request.comments.filter((comment) => !comment.deleted);

  // Fetch associated files
  const files = await fileService.getFilesByDocument("PaymentRequests", id);

  return normalizeId({
    ...request,
    files: normalizeFiles(files),
  });
};

// Update a Payment request
const updatePaymentRequest = async (id, data, files = [], currentUser) => {
  const request = await PaymentRequest.findById(id);
  if (!request) throw new Error("Payment request not found");

  // Update fields
  Object.assign(request, data);

  // This will trigger the pre('save') middleware
  const updatedPaymentRequest = await request.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: updatedPaymentRequest._id,
      modelTable: "PaymentRequests",
    });
  }

  // Send notification to reviewers/admins if needed
  if (updatedPaymentRequest.status === "reviewed") {
    notify.notifyApprovers({
      request: updatedPaymentRequest,
      currentUser: currentUser,
      requestType: "paymentRequest",
      title: "Payment Request",
      header: "You have been assigned a request",
    });
  }
  return updatedPaymentRequest;
};

const updateRequestStatus = async (id, data, currentUser) => {
  // Fetch the existing Concept Note
  const existingRequest = await PaymentRequest.findById(id);
  if (!existingRequest) {
    throw new Error("Concept Note not found");
  }

  if (!currentUser) {
    throw new Error("Unauthorized");
  }

  // Add a new comment if it exists in the request body
  if (data.comment) {
    // Initialize comments as an empty array if it doesn't exist
    if (!existingRequest.comments) {
      existingRequest.comments = [];
    }

    // Add the new comment to the top of the comments array
    existingRequest.comments.unshift({
      user: currentUser.id,
      text: data.comment,
      edited: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Update the data object to include the modified comments
    data.comments = existingRequest.comments;
  }

  // Update the status and other fields
  if (data.status) {
    existingRequest.status = data.status;
  }

  // Save and return the updated Concept Note
  const updatedRequest = await existingRequest.save();

  if (data.status === "reviewed") {
    // Also notify the creator
    notify.notifyCreator({
      request: updatedRequest,
      currentUser: currentUser,
      requestType: "paymentRequest",
      title: "Payment Request",
      header: "Your request has been reviewed",
    });
  } else if (data.status === "approved" || data.status === "rejected") {
    // Notify the creator when approved or rejected
    notify.notifyCreator({
      request: updatedRequest,
      currentUser: currentUser,
      requestType: "paymentRequest",
      title: "Payment Request",
      header: `Your request has been ${data.status}`,
    });

    // If approved, also notify the reviewer
    notify.notifyReviewers({
      request: updatedRequest,
      currentUser: currentUser,
      requestType: "paymentRequest",
      title: "Payment Request",
      header: `This request has been ${data.status}`,
    });
  }

  return updatedRequest;
};

// Delete a Payment request
const deleteRequest = async (id) => {
  await fileService.deleteFilesByDocument("PaymentRequests", id);

  return await PaymentRequest.findByIdAndDelete(id);
};

//////////////////////////
// comment to Request
//////////////////////////

// Add a comment to Request
const addComment = async (id, currentUser, text) => {
  const request = await PaymentRequest.findById(id);
  const userId = currentUser._id;

  if (!request) {
    throw new Error("Request not found");
  }

  // Check if user has permission to comment
  const canComment =
    request.requestedBy.toString() === userId.toString() ||
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
  const populatedRequest = await PaymentRequest.findById(id)
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
  const request = await PaymentRequest.findById(id);

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
  const populatedRequest = await PaymentRequest.findById(id)
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
  const request = await PaymentRequest.findById(id);

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
  PaymentRequestCopyService,
  getPaymentRequests,
  savePaymentRequest,
  saveAndSendPaymentRequest,
  getPaymentRequestStats,
  getPaymentRequestById,
  updatePaymentRequest,
  updateRequestStatus,
  deleteRequest,
  addComment,
  updateComment,
  deleteComment,
};
