// services/paymentVoucherService.js
const PaymentVoucher = require("../models/PaymentVoucherModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");
const BaseCopyService = require("./BaseCopyService");
const handleFileUploads = require("../utils/FileUploads");
const notify = require("../utils/notify");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");

class PaymentVoucherCopyService extends BaseCopyService {
  constructor() {
    super(PaymentVoucher, "PaymentVoucher");
  }
}

const paymentVoucherCopyService = new PaymentVoucherCopyService();

// Get all payment vouchers
const getPaymentVouchers = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;

  const searchFields = [
    "departmentalCode",
    "pvNumber",
    "payTo",
    "being",
    "grantCode",
    "chartOfAccountCode",
    "mandateReference",
    "status",
  ];

  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  switch (currentUser.role) {
    case "STAFF":
      query.createdBy = currentUser._id;
      break;

    case "ADMIN":
      query.$or = [
        { createdBy: currentUser._id },
        { approvedBy: currentUser._id },
      ];
      break;

    case "REVIEWER":
      query.$or = [
        { createdBy: currentUser._id },
        { reviewedBy: currentUser._id },
      ];
      break;

    case "SUPER-ADMIN":
      query.$or = [
        { status: { $ne: "draft" } },
        { createdBy: currentUser._id, status: "draft" },
      ];
      break;

    default:
      throw new Error("Invalid user role");
  }

  const sortQuery = buildSortQuery(sort);
  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  const {
    results: paymentVouchers,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    PaymentVoucher,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  const paymentVouchersWithFiles = await Promise.all(
    paymentVouchers.map(async (voucher) => {
      const files = await fileService.getFilesByDocument(
        "PaymentVouchers",
        voucher._id
      );
      return {
        ...voucher.toJSON(),
        files,
      };
    })
  );

  return {
    paymentVouchers: paymentVouchersWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// Create a new payment voucher
const createPaymentVoucher = async (data) => {
  const paymentVoucher = new PaymentVoucher(data);
  return await paymentVoucher.save();
};

// Save a payment voucher (draft)
const savePaymentVoucher = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.comments = undefined;

  const paymentVoucher = new PaymentVoucher({ ...data, status: "draft" });
  return await paymentVoucher.save();
};

// Save and send payment voucher
const saveAndSendPaymentVoucher = async (data, currentUser, files = []) => {
  data.createdBy = currentUser._id;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }

  const paymentVoucher = new PaymentVoucher({ ...data, status: "pending" });
  await paymentVoucher.save();

  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: paymentVoucher._id,
      modelTable: "PaymentVouchers",
    });
  }

  if (paymentVoucher.status === "pending") {
    notify.notifyReviewers({
      request: paymentVoucher,
      currentUser: currentUser,
      requestType: "paymentVoucher",
      title: "Payment Voucher",
      header: "You have been assigned a payment voucher for review",
    });
  }

  return paymentVoucher;
};

// Update payment voucher
const updatePaymentVoucher = async (id, data, files = [], currentUser) => {
  const updatedPaymentVoucher = await PaymentVoucher.findByIdAndUpdate(
    id,
    data,
    { new: true }
  );

  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: updatedPaymentVoucher._id,
      modelTable: "PaymentVouchers",
    });
  }

  if (updatedPaymentVoucher.status === "reviewed") {
    notify.notifyApprovers({
      request: updatedPaymentVoucher,
      currentUser: currentUser,
      requestType: "paymentVoucher",
      title: "Payment Voucher",
      header: "You have been assigned a payment voucher for approval",
    });
  }

  return updatedPaymentVoucher;
};

// Get payment voucher stats
const getPaymentVoucherStats = async (currentUser) => {
  if (!currentUser?._id) {
    throw new Error("Invalid user information");
  }

  const baseMatch = {
    status: { $ne: "draft" },
  };

  switch (currentUser.role) {
    case "SUPER-ADMIN":
      break;

    default:
      baseMatch.createdBy = currentUser._id;
      break;
  }

  const stats = await PaymentVoucher.aggregate([
    {
      $match: baseMatch,
    },
    {
      $facet: {
        totalVouchers: [{ $count: "count" }],
        totalApprovedVouchers: [
          { $match: { status: "approved" } },
          { $count: "count" },
        ],
        totalPaidVouchers: [
          { $match: { status: "paid" } },
          { $count: "count" },
        ],
        totalAmount: [
          { $match: { status: { $in: ["approved", "paid"] } } },
          { $group: { _id: null, total: { $sum: "$netAmount" } } },
        ],
      },
    },
  ]);

  return {
    totalVouchers: stats[0].totalVouchers[0]?.count || 0,
    totalApprovedVouchers: stats[0].totalApprovedVouchers[0]?.count || 0,
    totalPaidVouchers: stats[0].totalPaidVouchers[0]?.count || 0,
    totalAmount: stats[0].totalAmount[0]?.total || 0,
  };
};

// Get a single payment voucher by ID
const getPaymentVoucherById = async (id) => {
  const populateOptions = [
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  const voucher = await PaymentVoucher.findById(id)
    .populate(populateOptions)
    .lean();

  if (!voucher) {
    throw new Error("Payment Voucher not found");
  }

  const files = await fileService.getFilesByDocument("PaymentVouchers", id);

  return normalizeId({
    ...voucher,
    files: normalizeFiles(files),
  });
};

const updateVoucherStatus = async (id, data, currentUser) => {
  const existingVoucher = await PaymentVoucher.findById(id);

  if (!existingVoucher) {
    throw new Error("Payment voucher not found");
  }

  if (data.comment) {
    if (!existingVoucher.comments) {
      existingVoucher.comments = [];
    }

    existingVoucher.comments.unshift({
      user: currentUser.id,
      text: data.comment,
    });

    data.comments = existingVoucher.comments;
  }

  if (data.status) {
    existingVoucher.status = data.status;
  }

  const updatedVoucher = await existingVoucher.save();

  notify.notifyCreator({
    request: updatedVoucher,
    currentUser: currentUser,
    requestType: "paymentVoucher",
    title: "Payment Voucher",
    header: "Your payment voucher has been updated",
  });

  return updatedVoucher;
};

// Delete a payment voucher
const deletePaymentVoucher = async (id) => {
  await fileService.deleteFilesByDocument("PaymentVouchers", id);
  return await PaymentVoucher.findByIdAndDelete(id);
};

const addFilesService = async (id, files, currentUser) => {
  const paymentVoucher = await PaymentVoucher.findById(id);
  if (!paymentVoucher) {
    throw new Error("Payment Voucher not found");
  }

  if (files.length > 0) {
    await fileService.deleteFilesByDocument("PaymentVouchers", id);

    await handleFileUploads({
      files,
      requestId: paymentVoucher._id,
      modelTable: "PaymentVouchers",
    });
  }

  // Return the updated payment voucher with files
  const updatedVoucher = await getPaymentVoucherById(id);
  return updatedVoucher;
};

module.exports = {
  paymentVoucherCopyService,
  createPaymentVoucher,
  savePaymentVoucher,
  saveAndSendPaymentVoucher,
  getPaymentVoucherStats,
  getPaymentVouchers,
  getPaymentVoucherById,
  updatePaymentVoucher,
  updateVoucherStatus,
  deletePaymentVoucher,
  addFilesService,
};
