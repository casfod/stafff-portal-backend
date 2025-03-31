const PaymentRequest = require("../models/paymentRequest.model");
const { paginate, buildQuery, buildSortQuery } = require("../utils/paginate");

/**
 * Get all payment requests with filters, sorting, and pagination
 */
const getPaymentRequests = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;

  // Fields to search in
  const searchFields = [
    "PurposeOfExpense",
    "grantCode",
    "accountNumber",
    "accountName",
    "bankName",
    "status",
    "requestedBy",
  ];

  // Build search query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  // Role-based filtering
  switch (currentUser.role) {
    case "STAFF":
      query.requestedBy = currentUser._id; // Only their own requests
      break;

    case "ADMIN":
      query.$or = [
        { requestedBy: currentUser._id }, // Their own requests
        { approvedBy: currentUser._id }, // Requests they approved
      ];
      break;

    case "REVIEWER":
      query.$or = [
        { requestedBy: currentUser._id }, // Their own requests
        { reviewedBy: currentUser._id }, // Requests they reviewed
      ];
      break;

    case "SUPER-ADMIN":
      query.$or = [
        { status: { $ne: "draft" } }, // All non-draft requests
        { requestedBy: currentUser._id, status: "draft" }, // Their own drafts
      ];
      break;

    default:
      throw new Error("Invalid user role");
  }

  // Sort logic
  const sortQuery = buildSortQuery(sort);

  // Populate referenced fields
  const populateOptions = [
    { path: "requestedBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
  ];

  // Pagination
  const { results, total, totalPages, currentPage } = await paginate(
    PaymentRequest,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  return {
    paymentRequests: results,
    total,
    totalPages,
    currentPage,
  };
};

/**
 * Create a new payment request (draft)
 */
const createPaymentRequest = async (data, currentUser) => {
  data.requestedBy = currentUser._id;
  data.status = "draft";
  return await PaymentRequest.create(data);
};

/**
 * Submit a payment request (pending)
 */
const submitPaymentRequest = async (data, currentUser) => {
  data.requestedBy = currentUser._id;
  data.status = "pending";
  return await PaymentRequest.create(data);
};

/**
 * Review a payment request
 */
const reviewPaymentRequest = async (id, currentUser, comment) => {
  const update = {
    reviewedBy: currentUser._id,
    status: "reviewed",
  };

  if (comment) {
    update.$push = {
      comments: {
        user: currentUser._id,
        text: comment,
      },
    };
  }

  return await PaymentRequest.findByIdAndUpdate(id, update, { new: true });
};

/**
 * Approve a payment request
 */
const approvePaymentRequest = async (id, currentUser, comment) => {
  const update = {
    approvedBy: currentUser._id,
    status: "approved",
  };

  if (comment) {
    update.$push = {
      comments: {
        user: currentUser._id,
        text: comment,
      },
    };
  }

  return await PaymentRequest.findByIdAndUpdate(id, update, { new: true });
};

/**
 * Reject a payment request
 */
const rejectPaymentRequest = async (id, currentUser, comment) => {
  const update = {
    status: "rejected",
  };

  if (comment) {
    update.$push = {
      comments: {
        user: currentUser._id,
        text: comment,
      },
    };
  }

  return await PaymentRequest.findByIdAndUpdate(id, update, { new: true });
};

module.exports = {
  getPaymentRequests,
  createPaymentRequest,
  submitPaymentRequest,
  reviewPaymentRequest,
  approvePaymentRequest,
  rejectPaymentRequest,
};
