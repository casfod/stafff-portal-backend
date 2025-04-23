const ExpenseClaims = require("../models/ExpenseClaimsModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");

// Get all ExpenseClaims
const getExpenseClaims = async (queryParams, currentUser) => {
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
    results: expenseClaims,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    ExpenseClaims,
    query,
    { page, limit },
    sortQuery,
    populateOptions // Pass the populate options
  );

  return {
    expenseClaims,
    total,
    totalPages,
    currentPage,
  };
};

// Create a new ExpenseClaim
const createExpenseClaim = async (data) => {
  const expenseClaim = new ExpenseClaims(data);
  return await expenseClaim.save();
};

// Save a ExpenseClaim (draft)
const saveExpenseClaim = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.staffName = `${currentUser.first_name} ${currentUser.last_name}`;

  const expenseClaims = new ExpenseClaims({ ...data, status: "draft" });
  return await expenseClaims.save();
};

// Save and send a ExpenseClaim (pending)
const saveAndSendExpenseClaim = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.staffName = `${currentUser.first_name} ${currentUser.last_name}`;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }
  const expenseClaim = new ExpenseClaims({ ...data, status: "pending" });
  return await expenseClaim.save();
};

// Get ExpenseClaim stats
const getExpenseClaimStats = async (currentUser) => {
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
    case "ADMIN":
      // No additional filters for admin roles
      break;

    default:
      // For all other roles, only count their own requests
      baseMatch.createdBy = currentUser._id;
      break;
  }

  const stats = await ExpenseClaims.aggregate([
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
const getExpenseClaimById = async (id) => {
  return await ExpenseClaims.findById(id).populate("createdBy", "email");
};

// Update a pdvance request
const updateExpenseClaim = async (id, data) => {
  return await ExpenseClaims.findByIdAndUpdate(id, data, { new: true });
};

const updateRequestStatus = async (id, data) => {
  return await ExpenseClaims.findByIdAndUpdate(id, data, { new: true });
};

// Delete a pdvance request
const deleteExpenseClaim = async (id) => {
  return await ExpenseClaims.findByIdAndDelete(id);
};

module.exports = {
  createExpenseClaim,
  saveExpenseClaim,
  saveAndSendExpenseClaim,
  getExpenseClaimStats,
  getExpenseClaims,
  getExpenseClaimById,
  updateExpenseClaim,
  updateRequestStatus,
  deleteExpenseClaim,
};
