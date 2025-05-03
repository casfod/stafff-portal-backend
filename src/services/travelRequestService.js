const TravelRequest = require("../models/TravelRequestModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");

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

// Create a new Travel request
const createTravelRequest = async (data) => {
  const travelRequest = new TravelRequest(data);
  return await travelRequest.save();
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
          file._id, // Use _id instead of id if that's what MongoDB uses
          "TravelRequests",
          travelRequest._id
          // "receipts"
        )
      )
    );
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
      // No additional filters for admin roles
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
  return await TravelRequest.findById(id).populate("createdBy", "email");
};

// Update a pdvance request
const updateTravelRequest = async (id, data) => {
  return await TravelRequest.findByIdAndUpdate(id, data, { new: true });
};

const updateRequestStatus = async (id, data) => {
  return await TravelRequest.findByIdAndUpdate(id, data, { new: true });
};

// Delete a pdvance request
const deleteTravelRequest = async (id) => {
  return await TravelRequest.findByIdAndDelete(id);
};

module.exports = {
  createTravelRequest,
  saveTravelRequest,
  saveAndSendTravelRequest,
  getTravelRequestStats,
  getTravelRequests,
  getTravelRequestById,
  updateTravelRequest,
  updateRequestStatus,
  deleteTravelRequest,
};
