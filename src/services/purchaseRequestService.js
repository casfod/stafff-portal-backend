const PurchaseRequest = require("../models/PurchaseRequestModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");

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

  const purchaseRequest = new PurchaseRequest({ ...data, status: "draft" });
  return await purchaseRequest.save();
};

// Save and send a purchase request (pending)
const saveAndSendPurchaseRequest = async (data, currentUser, files = []) => {
  data.createdBy = currentUser._id;
  data.requestedBy = `${currentUser.first_name} ${currentUser.last_name}`;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }
  const purchaseRequest = new PurchaseRequest({ ...data, status: "pending" });
  await purchaseRequest.save();

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
          "PurchaseRequests",
          purchaseRequest._id
        )
      )
    );
  }

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
      //  case "ADMIN":
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
  return await PurchaseRequest.findById(id).populate("createdBy", "email");
};

// Update a purchase request
const updatePurchaseRequest = async (id, data, files = []) => {
  const purchaseRequest = await PurchaseRequest.findByIdAndUpdate(id, data, {
    new: true,
  });

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
          "PurchaseRequests",
          purchaseRequest._id
        )
      )
    );
  }

  return purchaseRequest;
};

const updateRequestStatus = async (id, data) => {
  return await PurchaseRequest.findByIdAndUpdate(id, data, { new: true });
};

// Delete a purchase request
const deletePurchaseRequest = async (id) => {
  await fileService.deleteFilesByDocument("PurchaseRequests", id);

  return await PurchaseRequest.findByIdAndDelete(id);
};

module.exports = {
  createPurchaseRequest,
  savePurchaseRequest,
  saveAndSendPurchaseRequest,
  getPurchaseRequestStats,
  getPurchaseRequests,
  getPurchaseRequestById,
  updatePurchaseRequest,
  updateRequestStatus,
  deletePurchaseRequest,
};
