const PaymentRequest = require("../models/PaymentRequestModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");
const BaseCopyService = require("./BaseCopyService");
const handleFileUploads = require("../utils/FileUploads");
const notify = require("../utils/notify");

class copyService extends BaseCopyService {
  constructor() {
    super(PaymentRequest, "PaymentRequest");
  }
}

const PaymentRequestCopyService = new copyService();

// Get request stats
const getPaymentRequestStats = async (currentUser) => {
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
      baseMatch.requestedBy = currentUser._id;
      break;
  }

  const stats = await PaymentRequest.aggregate([
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
  const {
    results: paymentRequests,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    PaymentRequest,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  // Fetch associated files
  const paymentRequestsWithFiles = await Promise.all(
    paymentRequests.map(async (request) => {
      const files = await fileService.getFilesByDocument(
        "PaymentRequests",
        request._id
      );
      return {
        ...request.toJSON(),
        files,
      };
    })
  );

  return {
    paymentRequests: paymentRequestsWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// /**
//  * Create a new payment request (draft)
//  */

// Save (draft)
const savePaymentRequest = async (data, currentUser) => {
  data.requestedBy = currentUser._id;
  data.requestBy = `${currentUser.first_name} ${currentUser.last_name}`;
  data.comments = undefined;

  const paymentRequest = new PaymentRequest({ ...data, status: "draft" });
  return await paymentRequest.save();
};

// Save and send (pending)
const saveAndSendPaymentRequest = async (data, currentUser, files = []) => {
  data.requestedBy = currentUser._id;
  data.requestBy = `${currentUser.first_name} ${currentUser.last_name}`;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }
  const paymentRequest = new PaymentRequest({ ...data, status: "pending" });
  await paymentRequest.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: paymentRequest._id,
      modelTable: "PaymentRequests",
    });
  }

  // Send notification to reviewers/admins if needed
  if (paymentRequest.status === "pending") {
    await notify.notifyReviewers({
      request: paymentRequest,
      currentUser: currentUser,
      requestType: "paymentRequest",
      title: "Payment Request",
      header: "You have been assigned a request",
    });
  }

  return paymentRequest;
};

// Get a single request by ID
const getPaymentRequestById = async (id) => {
  const populateOptions = [
    { path: "requestedBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
  ];

  const request = await PaymentRequest.findById(id)
    .populate(populateOptions)
    .lean();

  if (!request) {
    throw new Error("Payment Request not found");
  }

  // Fetch associated files
  const files = await fileService.getFilesByDocument("PaymentRequests", id);

  return {
    ...request,
    files,
  };
};

// Update a Payment request
const updatePaymentRequest = async (id, data, files = [], currentUser) => {
  const request = await PaymentRequest.findById(id);
  if (!request) throw new Error("Payment request not found");

  // Update fields
  Object.assign(request, data);

  // This will trigger the pre('save') middleware
  const updatedPaymentRequest = await request.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: updatedPaymentRequest._id,
      modelTable: "PaymentRequests",
    });
  }

  // Send notification to reviewers/admins if needed
  if (paymentRequest.status === "reviewed") {
    await notify.notifyApprovers({
      request: paymentRequest,
      currentUser: currentUser,
      requestType: "paymentRequest",
      title: "Payment Request",
      header: "You have been assigned a request",
    });
  }
  return updatedPaymentRequest;
};

const updateRequestStatus = async (id, data, currentUser) => {
  // Fetch the existing Concept Note
  const existingPaymentRequest = await PaymentRequest.findById(id);
  if (!existingPaymentRequest) {
    throw new Error("Concept Note not found");
  }

  if (!currentUser) {
    throw new Error("Unauthorized");
  }

  // Add a new comment if it exists in the request body
  if (data.comment) {
    // Initialize comments as an empty array if it doesn't exist
    if (!existingPaymentRequest.comments) {
      existingPaymentRequest.comments = [];
    }

    // Add the new comment to the top of the comments array
    existingPaymentRequest.comments.unshift({
      user: currentUser.id,
      text: data.comment,
    });

    // Update the data object to include the modified comments
    data.comments = existingPaymentRequest.comments;
  }

  // Update the status and other fields
  if (data.status) {
    existingPaymentRequest.status = data.status;
  }

  // Save and return the updated Concept Note
  const updatedRequest = await existingPaymentRequest.save();

  // Notification
  await notify.notifyCreator({
    request: updatedRequest,
    currentUser: currentUser,
    requestType: "paymentRequest",
    title: "Payment Request",
    header: "Your request has been updated",
  });

  return updatedRequest;
};

// Delete a Payment request
const deleteRequest = async (id) => {
  await fileService.deleteFilesByDocument("PaymentRequests", id);

  return await PaymentRequest.findByIdAndDelete(id);
};

module.exports = {
  PaymentRequestCopyService,
  getPaymentRequests,
  savePaymentRequest,
  saveAndSendPaymentRequest,
  getPaymentRequestStats,
  getPaymentRequestById,
  updatePaymentRequest,
  updateRequestStatus,
  deleteRequest,
};
