const TravelRequest = require("../models/TravelRequestModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");
const BaseCopyService = require("./BaseCopyService");
const handleFileUploads = require("../utils/FileUploads");
const notify = require("../utils/notify");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");

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
  const searchFields = ["project", "location", "staffName", "budget"];

  // Build the search query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  switch (currentUser.role) {
    case "STAFF":
      query.createdBy = currentUser._id; // STAFF can only see their own requests
      break;

    case "ADMIN":
      query.$or = [
        { createdBy: currentUser._id }, // Requests they created
        { approvedBy: currentUser._id }, // Requests they reviewed
      ];
      break;
    case "REVIEWER":
      query.$or = [
        { createdBy: currentUser._id }, // Requests they created
        { reviewedBy: currentUser._id }, // Requests they reviewed
      ];
      break;

    case "SUPER-ADMIN":
      query.$or = [
        { status: { $ne: "draft" } }, // All requests except drafts
        { createdBy: currentUser._id, status: "draft" }, // Their own drafts
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
    { path: "comments.user", select: "email first_name last_name role" }, // Simplified path
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
    { path: "comments.user", select: "email first_name last_name role" }, // Simplified path
  ];

  const request = await TravelRequest.findById(id)
    .populate(populateOptions)
    .lean();

  if (!request) {
    throw new Error("Travel Request not found");
  }

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

const updateRequestStatus = async (id, data, currentUser) => {
  const existingRequest = await TravelRequest.findById(id);

  if (!existingRequest) {
    throw new Error("Request not found");
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
    });

    // Update the data object to include the modified comments
    data.comments = existingRequest.comments;
  }

  // Update the status and other fields
  if (data.status) {
    existingRequest.status = data.status;
  }

  // Save and return the updated  request
  const updatedRequest = await existingRequest.save();

  // Notification
  notify.notifyCreator({
    request: updatedRequest,
    currentUser: currentUser,
    requestType: "travelRequest",
    title: "Travel Request",
    header: "Your request has been updated",
  });
  return updatedRequest;
};

// Delete a pdvance request
const deleteTravelRequest = async (id) => {
  await fileService.deleteFilesByDocument("TravelRequests", id);

  return await TravelRequest.findByIdAndDelete(id);
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
};
