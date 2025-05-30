const AdvanceRequest = require("../models/AdvanceRequestModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");

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
    // { path: "project", select: "project_code account_code" },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" }, // Simplified path
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
    populateOptions // Pass the populate options
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

  // Handle file uploads
  if (files.length > 0) {
    const uploadedFiles = await Promise.all(
      files.map((file) =>
        fileService.uploadFile({
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        })
      )
    );

    await Promise.all(
      uploadedFiles.map((file) =>
        fileService.associateFile(
          file._id,
          "AdvanceRequests",
          advanceRequest._id
        )
      )
    );
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

// Get a single pdvance request by ID
const getAdvanceRequestById = async (id) => {
  return await AdvanceRequest.findById(id).populate("createdBy", "email");
};

// Update a pdvance request
const updateAdvanceRequest = async (id, data, files = []) => {
  const updatedAdvanceRequest = await AdvanceRequest.findByIdAndUpdate(
    id,
    data,
    { new: true }
  );

  // Handle file uploads
  if (files.length > 0) {
    const uploadedFiles = await Promise.all(
      files.map((file) =>
        fileService.uploadFile({
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        })
      )
    );

    await Promise.all(
      uploadedFiles.map((file) =>
        fileService.associateFile(
          file._id,
          "AdvanceRequests",
          updatedAdvanceRequest._id
        )
      )
    );
  }

  return updatedAdvanceRequest;
};

const updateRequestStatus = async (id, data) => {
  return await AdvanceRequest.findByIdAndUpdate(id, data, { new: true });
};

// Delete a pdvance request
const deleteAdvanceRequest = async (id) => {
  await fileService.deleteFilesByDocument("AdvanceRequests", id);

  return await AdvanceRequest.findByIdAndDelete(id);
};

module.exports = {
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
