const TravelRequest = require("../models/TravelRequestModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");

// Get all travel requests
const gettravelRequests = async (queryParams, currentUser) => {
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
    // { path: "project", select: "project_code account_code" },
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
    travelRequests,
    query,
    { page, limit },
    sortQuery,
    populateOptions // Pass the populate options
  );

  return {
    travelRequests,
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

  const travelRequest = new TravelRequest({ ...data, status: "draft" });
  return await travelRequest.save();
};

// Save and send a Travel request (pending)
const saveAndSendTravelRequest = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.staffName = `${currentUser.first_name} ${currentUser.last_name}`;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }
  const travelRequest = new TravelRequest({ ...data, status: "pending" });
  return await travelRequest.save();
};

// Get Travel request stats
const getTravelRequestStats = async () => {
  // 1. Total number of requests
  const totalRequests = await TravelRequest.countDocuments({
    status: { $ne: "draft" },
  });

  // 2. Total number of approved requests
  const totalApprovedRequests = await TravelRequest.countDocuments({
    status: "approved",
  });

  // Return the stats
  return {
    totalRequests,
    totalApprovedRequests,
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
  gettravelRequests,
  getTravelRequestById,
  updateTravelRequest,
  updateRequestStatus,
  deleteTravelRequest,
};
