// controllers/paymentVoucherController.js
const {
  savePaymentVoucher,
  saveAndSendPaymentVoucher,
  getPaymentVouchers,
  getPaymentVoucherById,
  updatePaymentVoucher,
  updateVoucherStatus,
  deletePaymentVoucher,
  getPaymentVoucherStats,
  paymentVoucherCopyService,
  addFilesService,
} = require("../services/paymentVoucherService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const parseJsonField = require("../utils/parseJsonField");
const userByToken = require("../utils/userByToken");

const copyVoucher = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body;
  const currentUser = await userByToken(req, res);

  if (!userIds || !Array.isArray(userIds)) {
    throw new appError("Please provide valid recipient user IDs", 400);
  }

  const paymentVoucher = await getPaymentVoucherById(id);
  if (!paymentVoucher) {
    throw new appError("Payment voucher not found", 404);
  }

  const updatedVoucher = await paymentVoucherCopyService.copyDocument({
    currentUser: currentUser,
    requestId: id,
    requestType: "paymentVoucher",
    requestTitle: "Payment Voucher",
    recipients: userIds,
  });

  handleResponse(
    res,
    200,
    "Payment voucher copied successfully",
    updatedVoucher
  );
});

const save = catchAsync(async (req, res) => {
  const data = req.body;
  const currentUser = await userByToken(req, res);

  const paymentVoucher = await savePaymentVoucher(data, currentUser);

  handleResponse(
    res,
    201,
    "Payment voucher saved successfully",
    paymentVoucher
  );
});

const saveAndSend = catchAsync(async (req, res) => {
  const data = req.body;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  const paymentVoucher = await saveAndSendPaymentVoucher(
    data,
    currentUser,
    files
  );

  handleResponse(
    res,
    201,
    "Payment voucher saved and sent successfully",
    paymentVoucher
  );
});

const getStats = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const stats = await getPaymentVoucherStats(currentUser);

  handleResponse(
    res,
    200,
    "Payment vouchers stats fetched successfully",
    stats
  );
});

const getAll = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;
  const currentUser = await userByToken(req, res);

  const paymentVouchers = await getPaymentVouchers(
    { search, sort, page, limit },
    currentUser
  );

  handleResponse(
    res,
    200,
    "All payment vouchers fetched successfully",
    paymentVouchers
  );
});

const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const paymentVoucher = await getPaymentVoucherById(id);
  if (!paymentVoucher) {
    return handleResponse(res, 404, "Payment voucher not found");
  }

  handleResponse(
    res,
    200,
    "Payment voucher fetched successfully",
    paymentVoucher
  );
});

const update = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { id } = req.params;
  const data = req.body;
  const files = req.files || [];

  const paymentVoucher = await updatePaymentVoucher(
    id,
    data,
    files,
    currentUser
  );
  if (!paymentVoucher) {
    return handleResponse(res, 404, "Payment voucher not found");
  }

  handleResponse(
    res,
    200,
    "Payment voucher updated successfully",
    paymentVoucher
  );
});

const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const currentUser = await userByToken(req, res);

  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const updatedVoucher = await updateVoucherStatus(id, data, currentUser);

  handleResponse(res, 200, "Payment voucher status updated", updatedVoucher);
});

const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const paymentVoucher = await deletePaymentVoucher(id);
  if (!paymentVoucher) {
    return handleResponse(res, 404, "Payment voucher not found");
  }

  handleResponse(
    res,
    200,
    "Payment voucher deleted successfully",
    paymentVoucher
  );
});

/**
 * Add files (dedicated endpoint)
 */
const addFiles = catchAsync(async (req, res) => {
  const { id } = req.params;
  const files = req.files || [];
  const currentUser = await userByToken(req, res);

  if (!files || files.length === 0) {
    return handleResponse(res, 400, "No files provided");
  }

  const result = await addFilesService(id, files, currentUser);

  handleResponse(res, 200, "Files added successfully", result);
});

module.exports = {
  copyVoucher,
  save,
  saveAndSend,
  getAll,
  getStats,
  getById,
  update,
  updateStatus,
  remove,
  addFiles,
};
