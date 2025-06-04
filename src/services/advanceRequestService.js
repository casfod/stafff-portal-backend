const AdvanceRequest = require("../models/AdvanceRequestModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");
const handleFileUploads = require("../utils/FileUploads");
const notify = require("../utils/notify");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const BaseCopyService = require("./BaseCopyService");

class copyService extends BaseCopyService {
  constructor() {
    super(AdvanceRequest, "AdvanceRequest");
  }
}

const AdvanceRequestCopyService = new copyService();

// Get all advance requests
const getAdvanceRequests = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;

  // Define the fields you want to search in
  const searchFields = [
    "department",
    "suggestedSupplier",
    "status",
    "requestedBy",
    "finalDeliveryPoint",
    "address",
  ];

  // Build the search query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  // Common conditions for all users
  const commonConditions = [
    { createdBy: currentUser._id }, // Always see own requests
    { copiedTo: currentUser._id }, // Always see requests copied to you
  ];

  // Role-specific conditions
  let roleSpecificConditions = [];

  switch (currentUser.role) {
    case "STAFF":
      // Staff only get common conditions (no additional access)
      break;

    case "ADMIN":
      roleSpecificConditions.push({ approvedBy: currentUser._id });
      break;

    case "REVIEWER":
      roleSpecificConditions.push({ reviewedBy: currentUser._id });
      break;

    case "SUPER-ADMIN":
      roleSpecificConditions.push(
        { status: { $ne: "draft" } }, // All non-draft requests
        {
          $and: [
            { createdBy: currentUser._id },
            { status: "draft" }, // Only their own drafts
          ],
        }
      );
      break;

    default:
      throw new Error("Invalid user role");
  }

  // Combine all conditions
  query.$or = [...commonConditions, ...roleSpecificConditions];

  // Build the sort object
  const sortQuery = buildSortQuery(sort);

  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  // Filters, sorting, pagination, and populate
  const {
    results: advanceRequests,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    AdvanceRequest,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  // Fetch associated files
  const advanceRequestsWithFiles = await Promise.all(
    advanceRequests.map(async (request) => {
      const files = await fileService.getFilesByDocument(
        "AdvanceRequests",
        request._id
      );
      return {
        ...request.toJSON(),
        files,
      };
    })
  );

  return {
    advanceRequests: advanceRequestsWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// Get a single advance request by ID with complete data
const getAdvanceRequestById = async (id) => {
  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  const request = await AdvanceRequest.findById(id)
    .populate(populateOptions)
    .lean();

  if (!request) {
    throw new Error("Advance request not found");
  }

  // Fetch associated files
  const files = await fileService.getFilesByDocument("AdvanceRequests", id);

  return normalizeId({
    ...request,
    files: normalizeFiles(files),
  });
};
// Create a new advance request
const createAdvanceRequest = async (data) => {
  const advanceRequest = new AdvanceRequest(data);
  return await advanceRequest.save();
};

// Save a advance request (draft)
const saveAdvanceRequest = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.requestedBy = `${currentUser.first_name} ${currentUser.last_name}`;
  data.comments = undefined;

  const advanceRequest = new AdvanceRequest({ ...data, status: "draft" });
  return await advanceRequest.save();
};

// Save and send a advance request (pending)
const saveAndSendAdvanceRequest = async (data, currentUser, files = []) => {
  data.createdBy = currentUser._id;
  data.requestedBy = `${currentUser.first_name} ${currentUser.last_name}`;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }
  const advanceRequest = new AdvanceRequest({ ...data, status: "pending" });
  await advanceRequest.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: advanceRequest._id,
      modelTable: "AdvanceRequests",
    });
  }

  // Send notification to reviewers/admins if needed
  if (advanceRequest.status === "pending") {
    notify.notifyReviewers({
      request: advanceRequest,
      currentUser: currentUser,
      requestType: "advanceRequest",
      title: "Advance Request",
      header: "You have been assigned a request",
    });
  }
  return advanceRequest;
};

// Get advance request stats
const getAdvanceRequestStats = async (currentUser) => {
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
      baseMatch.createdBy = currentUser._id;
      break;
  }

  const stats = await AdvanceRequest.aggregate([
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

// Update a pdvance request
const updateAdvanceRequest = async (id, data, files = [], currentUser) => {
  const updatedAdvanceRequest = await AdvanceRequest.findByIdAndUpdate(
    id,
    data,
    { new: true }
  );

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: updatedAdvanceRequest._id,
      modelTable: "AdvanceRequests",
    });
  }

  // Send notification to reviewers/admins if needed
  if (updatedAdvanceRequest.status === "reviewed") {
    notify.notifyApprovers({
      request: updatedAdvanceRequest,
      currentUser: currentUser,
      requestType: "advanceRequest",
      title: "Advance Request",
      header: "You have been assigned a request",
    });
  }

  return updatedAdvanceRequest;
};

const updateRequestStatus = async (id, data, currentUser) => {
  // Fetch the existing advance request
  const existingRequest = await AdvanceRequest.findById(id);

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
    requestType: "advanceRequest",
    title: "Advance Request",
    header: "Your request has been updated",
  });
  return updatedRequest;
};

// Delete a pdvance request
const deleteAdvanceRequest = async (id) => {
  await fileService.deleteFilesByDocument("AdvanceRequests", id);

  return await AdvanceRequest.findByIdAndDelete(id);
};

module.exports = {
  AdvanceRequestCopyService,
  createAdvanceRequest,
  saveAdvanceRequest,
  saveAndSendAdvanceRequest,
  getAdvanceRequestStats,
  getAdvanceRequests,
  getAdvanceRequestById,
  updateAdvanceRequest,
  updateRequestStatus,
  deleteAdvanceRequest,
};
