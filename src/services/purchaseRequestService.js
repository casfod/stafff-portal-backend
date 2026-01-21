const PurchaseRequest = require("../models/PurchaseRequestModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");
const BaseCopyService = require("./BaseCopyService");
const handleFileUploads = require("../utils/FileUploads");
const notify = require("../utils/notify");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const searchConfig = require("../utils/searchConfig");
const statusUpdateService = require("./statusUpdateService");

class copyService extends BaseCopyService {
  constructor() {
    super(PurchaseRequest, "PurchaseRequest");
  }
}

const PurchaseRequestCopyService = new copyService();

// Get all purchase requests
const getPurchaseRequests = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;

  // Define the fields you want to search in
  const searchFields = searchConfig.purchaseRequest;

  // Build the search query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  switch (currentUser.role) {
    case "STAFF":
      query.$or = [
        { createdBy: currentUser._id },
        { copiedTo: currentUser._id },
      ]; // STAFF can only see their own requests
      break;

    case "ADMIN":
      query.$or = [
        { createdBy: currentUser._id }, // Requests they created
        { approvedBy: currentUser._id }, // Requests they reviewed
        { copiedTo: currentUser._id },
        { financeReviewBy: currentUser._id }, // Finance reviewer
        { procurementReviewBy: currentUser._id }, // Procurement reviewer
      ];
      break;
    case "REVIEWER":
      query.$or = [
        { createdBy: currentUser._id }, // Requests they created
        { reviewedBy: currentUser._id },
        { copiedTo: currentUser._id },
        { financeReviewBy: currentUser._id }, // Finance reviewer
        { procurementReviewBy: currentUser._id }, // Procurement reviewer
      ];
      break;

    case "SUPER-ADMIN":
      query.$or = [
        { status: { $ne: "draft" } }, // All requests except drafts
        { createdBy: currentUser._id, status: "draft" }, // Their own drafts
        { copiedTo: currentUser._id },
      ];
      break;

    default:
      throw new Error("Invalid user role");
  }

  // Build the sort object
  const sortQuery = buildSortQuery(sort);
  const populateOptions = [
    { path: "project", select: "project_code account_code" },
    { path: "createdBy", select: "email first_name last_name role position" },
    { path: "reviewedBy", select: "email first_name last_name role position" },
    { path: "approvedBy", select: "email first_name last_name role position" },
    {
      path: "financeReviewBy",
      select: "email first_name last_name role position",
    },
    {
      path: "procurementReviewBy",
      select: "email first_name last_name role position",
    },
    {
      path: "comments.user",
      select: "email first_name last_name role position",
    },
    { path: "copiedTo", select: "email first_name last_name role position" },
  ];

  // Filters, sorting, pagination, and populate
  const {
    results: purchaseRequests,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    PurchaseRequest,
    query,
    { page, limit },
    sortQuery,
    populateOptions // Pass the populate options
  );

  // Fetch associated files
  const purchaseRequestsWithFiles = await Promise.all(
    purchaseRequests.map(async (request) => {
      // Filter out deleted comments
      request.comments = request.comments.filter((comment) => !comment.deleted);

      const files = await fileService.getFilesByDocument(
        "PurchaseRequests",
        request._id
      );
      return {
        ...request.toJSON(),
        files,
      };
    })
  );

  return {
    purchaseRequests: purchaseRequestsWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// Create a new purchase request
const createPurchaseRequest = async (data) => {
  const purchaseRequest = new PurchaseRequest(data);
  return await purchaseRequest.save();
};

// Save a purchase request (draft)
const savePurchaseRequest = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.requestedBy = `${currentUser.first_name} ${currentUser.last_name}`;
  data.comments = undefined;

  // Initialize review statuses
  data.financeReviewStatus = "pending";
  data.procurementReviewStatus = "pending";

  const purchaseRequest = new PurchaseRequest({ ...data, status: "draft" });
  return await purchaseRequest.save();
};

// Save and send a purchase request (pending)
const saveAndSendPurchaseRequest = async (data, currentUser, files = []) => {
  data.createdBy = currentUser._id;
  data.requestedBy = `${currentUser.first_name} ${currentUser.last_name}`;

  // Initialize review statuses
  data.financeReviewStatus = "pending";
  data.procurementReviewStatus = "pending";

  if (!data.financeReviewBy || !data.procurementReviewBy) {
    throw new Error(
      "Both financeReviewBy and procurementReviewBy are required for submission."
    );
  }

  const purchaseRequest = new PurchaseRequest({ ...data, status: "pending" });
  await purchaseRequest.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: purchaseRequest._id,
      modelTable: "PurchaseRequests",
    });
  }

  // Send notification to finance reviewer
  await notify.notifyPurchaseRequestReviewers({
    request: purchaseRequest,
    currentUser: currentUser,
    requestType: "purchaseRequest",
    title: "Purchase Request",
    header: "You have been assigned as a reviewer for this purchase request",
  });

  return purchaseRequest;
};

// Get purchase request stats
const getPurchaseRequestStats = async (currentUser) => {
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
      // case "ADMIN":
      // No additional filters for admin roles
      break;

    default:
      // For all other roles, only count their own requests
      baseMatch.createdBy = currentUser._id;
      break;
  }

  const stats = await PurchaseRequest.aggregate([
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

// Get a single purchase request by ID
const getPurchaseRequestById = async (id) => {
  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role position" },
    { path: "reviewedBy", select: "email first_name last_name role position" },
    { path: "approvedBy", select: "email first_name last_name role position" },
    {
      path: "financeReviewBy",
      select: "email first_name last_name role position",
    },
    {
      path: "procurementReviewBy",
      select: "email first_name last_name role position",
    },
    {
      path: "comments.user",
      select: "email first_name last_name role position",
    },
    { path: "copiedTo", select: "email first_name last_name role position" },
  ];

  const request = await PurchaseRequest.findById(id)
    .populate(populateOptions)
    .lean();

  if (!request) {
    throw new Error("Purchase Request not found");
  }

  // Filter out deleted comments
  request.comments = request.comments.filter((comment) => !comment.deleted);

  // Fetch associated files
  const files = await fileService.getFilesByDocument("PurchaseRequests", id);

  return normalizeId({
    ...request,
    files: normalizeFiles(files),
  });
};

// Update a purchase request
const updatePurchaseRequest = async (id, data, files = [], currentUser) => {
  const updatedPurchaseRequest = await PurchaseRequest.findByIdAndUpdate(
    id,
    data,
    {
      new: true,
    }
  );

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: updatedPurchaseRequest._id,
      modelTable: "PurchaseRequests",
    });
  }

  return updatedPurchaseRequest;
};

const updateRequestStatus = async (id, data, currentUser) => {
  return await statusUpdateService.updateRequestStatusWithComment({
    Model: PurchaseRequest,
    id,
    data,
    currentUser,
    requestType: "purchaseRequest",
    title: "Purchase Request",
  });
};

// Delete a purchase request
const deletePurchaseRequest = async (id) => {
  await fileService.deleteFilesByDocument("PurchaseRequests", id);

  return await PurchaseRequest.findByIdAndDelete(id);
};

//////////////////////////
// comment to Request
//////////////////////////

// Add a comment to Request
const addComment = async (id, currentUser, text) => {
  const request = await PurchaseRequest.findById(id);
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
    (request.financeReviewBy &&
      request.financeReviewBy.toString() === userId.toString()) ||
    (request.procurementReviewBy &&
      request.procurementReviewBy.toString() === userId.toString()) ||
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
  const populatedRequest = await PurchaseRequest.findById(id)
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
  const request = await PurchaseRequest.findById(id);

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
  const populatedRequest = await PurchaseRequest.findById(id)
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
  const request = await PurchaseRequest.findById(id);

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
  PurchaseRequestCopyService,
  createPurchaseRequest,
  savePurchaseRequest,
  saveAndSendPurchaseRequest,
  getPurchaseRequestStats,
  getPurchaseRequests,
  getPurchaseRequestById,
  updatePurchaseRequest,
  updateRequestStatus,
  deletePurchaseRequest,
  addComment,
  updateComment,
  deleteComment,
};
