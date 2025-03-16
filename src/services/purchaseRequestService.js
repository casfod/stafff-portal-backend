const PurchaseRequest = require("../models/PurchaseRequestModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");

// Create a new purchase request
const createPurchaseRequest = async (data) => {
  const purchaseRequest = new PurchaseRequest(data);
  return await purchaseRequest.save();
};

// Save a purchase request (draft)
const savePurchaseRequest = async (data) => {
  const purchaseRequest = new PurchaseRequest({ ...data, status: "draft" });
  return await purchaseRequest.save();
};

// Save and send a purchase request (pending)
const saveAndSendPurchaseRequest = async (data) => {
  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }
  const purchaseRequest = new PurchaseRequest({ ...data, status: "pending" });
  return await purchaseRequest.save();
};

// Get all purchase requests
const getPurchaseRequests = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;

  // Define the fields you want to search in
  const searchFields = [
    "department",
    "suggestedSupplier",
    "accountCode",
    "status",
    "requestedBy",
    "finalDeliveryPoint",
    "expenseChargedTo",
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
    case "INSPECTOR":
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

  // Define populate options for both createdBy and reviewedBy
  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
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

  return {
    purchaseRequests,
    total,
    totalPages,
    currentPage,
  };
};

// Get a single purchase request by ID
const getPurchaseRequestById = async (id) => {
  return await PurchaseRequest.findById(id).populate("createdBy", "email");
};

// Update a purchase request
const updatePurchaseRequest = async (id, data) => {
  return await PurchaseRequest.findByIdAndUpdate(id, data, { new: true });
};

const updateRequestStatus = async (id, data) => {
  return await PurchaseRequest.findByIdAndUpdate(id, data, { new: true });
};

// Delete a purchase request
const deletePurchaseRequest = async (id) => {
  return await PurchaseRequest.findByIdAndDelete(id);
};

module.exports = {
  createPurchaseRequest,
  savePurchaseRequest,
  saveAndSendPurchaseRequest,
  getPurchaseRequests,
  getPurchaseRequestById,
  updatePurchaseRequest,
  updateRequestStatus,
  deletePurchaseRequest,
};
