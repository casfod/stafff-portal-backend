const AdvanceRequest = require("../models/AdvanceRequestModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");

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

  return {
    advanceRequests,
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

  const advanceRequest = new AdvanceRequest({ ...data, status: "draft" });
  return await advanceRequest.save();
};

// Save and send a advance request (pending)
const saveAndSendAdvanceRequest = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.requestedBy = `${currentUser.first_name} ${currentUser.last_name}`;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }
  const advanceRequest = new AdvanceRequest({ ...data, status: "pending" });
  return await advanceRequest.save();
};

// Get advance request stats
const getAdvanceRequestStats = async () => {
  // 1. Total number of requests
  const totalRequests = await AdvanceRequest.countDocuments({
    status: { $ne: "draft" },
  });

  // 2. Total number of approved requests
  const totalApprovedRequests = await AdvanceRequest.countDocuments({
    status: "approved",
  });

  // Return the stats
  return {
    totalRequests,
    totalApprovedRequests,
  };
};

// Get a single pdvance request by ID
const getAdvanceRequestById = async (id) => {
  return await AdvanceRequest.findById(id).populate("createdBy", "email");
};

// Update a pdvance request
const updateAdvanceRequest = async (id, data) => {
  return await AdvanceRequest.findByIdAndUpdate(id, data, { new: true });
};

const updateRequestStatus = async (id, data) => {
  return await AdvanceRequest.findByIdAndUpdate(id, data, { new: true });
};

// Delete a pdvance request
const deleteAdvanceRequest = async (id) => {
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
