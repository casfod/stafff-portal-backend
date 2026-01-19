const TravelRequest = require("../models/TravelRequestModel");
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
    super(TravelRequest, "TravelRequest");
  }
}

const TravelRequestCopyService = new copyService();

// Get all travel requests
const getTravelRequests = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;

  // Define the fields you want to search in
  const searchFields = searchConfig.travelRequest;

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
      ];
      break;
    case "REVIEWER":
      query.$or = [
        { createdBy: currentUser._id }, // Requests they created
        { reviewedBy: currentUser._id }, // Requests they reviewed
        { copiedTo: currentUser._id },
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
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  // Filters, sorting, pagination, and populate
  const {
    results: travelRequests,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    TravelRequest,
    query,
    { page, limit },
    sortQuery,
    populateOptions // Pass the populate options
  );

  const travelRequestsWithFiles = await Promise.all(
    travelRequests.map(async (request) => {
      // Filter out deleted comments
      request.comments = request.comments.filter((comment) => !comment.deleted);

      const files = await fileService.getFilesByDocument(
        "TravelRequests",
        request._id
      );
      return {
        ...request.toJSON(),
        files,
      };
    })
  );

  return {
    travelRequests: travelRequestsWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// Save a Travel request (draft)
const saveTravelRequest = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.staffName = `${currentUser.first_name} ${currentUser.last_name}`;
  data.comments = undefined;

  const travelRequest = new TravelRequest({ ...data, status: "draft" });
  return await travelRequest.save();
};

// Save and send a Travel request (pending)
const saveAndSendTravelRequest = async (data, currentUser, files = []) => {
  data.createdBy = currentUser._id;
  data.staffName = `${currentUser.first_name} ${currentUser.last_name}`;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }
  const travelRequest = new TravelRequest({ ...data, status: "pending" });
  await travelRequest.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: travelRequest._id,
      modelTable: "TravelRequests",
    });
  }

  // Send notification to reviewers/admins if needed
  if (travelRequest.status === "pending") {
    notify.notifyReviewers({
      request: travelRequest,
      currentUser: currentUser,
      requestType: "travelRequest",
      title: "Travel Request",
      header: "You have been assigned a request",
    });
  }

  return travelRequest;
};

// Get Travel request stats
const getTravelRequestStats = async (currentUser) => {
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
      // No additional filters for admin roless
      break;

    default:
      // For all other roles, only count their own requests
      baseMatch.createdBy = currentUser._id;
      break;
  }

  const stats = await TravelRequest.aggregate([
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

// Get a single pdvance request by ID
const getTravelRequestById = async (id) => {
  const populateOptions = [
    { path: "project", select: "project_code account_code" },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  const request = await TravelRequest.findById(id)
    .populate(populateOptions)
    .lean();

  if (!request) {
    throw new Error("Travel Request not found");
  }

  // Filter out deleted comments
  request.comments = request.comments.filter((comment) => !comment.deleted);

  // Fetch associated files
  const files = await fileService.getFilesByDocument("TravelRequests", id);

  return normalizeId({
    ...request,
    files: normalizeFiles(files),
  });
};

// Update a travel request
const updateTravelRequest = async (id, data, files = [], currentUser) => {
  const travelRequest = await TravelRequest.findByIdAndUpdate(id, data, {
    new: true,
  });

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: travelRequest._id,
      modelTable: "TravelRequests",
    });
  }

  // Send notification to reviewers/admins if needed
  if (travelRequest.status === "reviewed") {
    notify.notifyApprovers({
      request: travelRequest,
      currentUser: currentUser,
      requestType: "travelRequest",
      title: "Travel Request",
      header: "You have been assigned a request",
    });
  }

  return travelRequest;
};

// const updateRequestStatus = async (id, data, currentUser) => {
//   const existingRequest = await TravelRequest.findById(id);

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
//   if (data.status === "reviewed") {
//     // Also notify the creator
//     notify.notifyCreator({
//       request: updatedRequest,
//       currentUser: currentUser,
//       requestType: "travelRequest",
//       title: "Travel Request",
//       header: "Your request has been reviewed",
//     });
//   } else if (data.status === "approved" || data.status === "rejected") {
//     // Notify the creator when approved or rejected
//     notify.notifyCreator({
//       request: updatedRequest,
//       currentUser: currentUser,
//       requestType: "travelRequest",
//       title: "Travel Request",
//       header: `Your request has been ${data.status}`,
//     });

//     // If approved, also notify the reviewer
//     notify.notifyReviewers({
//       request: updatedRequest,
//       currentUser: currentUser,
//       requestType: "travelRequest",
//       title: "Travel Request",
//       header: `This request has been ${data.status}`,
//     });
//   }

//   return updatedRequest;
// };

const updateRequestStatus = async (id, data, currentUser) => {
  return await statusUpdateService.updateRequestStatus({
    Model: TravelRequest,
    id,
    data,
    currentUser,
    requestType: "travelRequest",
    title: "Travel Request",
  });
};

// Delete a pdvance request
const deleteTravelRequest = async (id) => {
  await fileService.deleteFilesByDocument("TravelRequests", id);

  return await TravelRequest.findByIdAndDelete(id);
};

//////////////////////////
// comment to Request
//////////////////////////

// Add a comment to Request
const addComment = async (id, currentUser, text) => {
  const request = await TravelRequest.findById(id);
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
  const populatedRequest = await TravelRequest.findById(id)
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
  const request = await TravelRequest.findById(id);

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
  const populatedRequest = await TravelRequest.findById(id)
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
  const request = await TravelRequest.findById(id);

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
  TravelRequestCopyService,
  saveTravelRequest,
  saveAndSendTravelRequest,
  getTravelRequestStats,
  getTravelRequests,
  getTravelRequestById,
  updateTravelRequest,
  updateRequestStatus,
  deleteTravelRequest,
  addComment,
  updateComment,
  deleteComment,
};
