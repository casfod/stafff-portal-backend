const {
  saveExpenseClaim,
  saveAndSendExpenseClaim,
  getExpenseClaims,
  getExpenseClaimById,
  updateExpenseClaim,
  updateRequestStatus,
  deleteExpenseClaim,
  getExpenseClaimStats,
  ExpenseClaimCopyService,
} = require("../services/expenseClaimsService");
// const { upload } = require("../controllers/fileController");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const parseJsonField = require("../utils/parseJsonField");
const userByToken = require("../utils/userByToken");

const copyRequest = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { userIds } = req.body;
  const currentUser = await userByToken(req, res);

  if (!userIds || !Array.isArray(userIds)) {
    throw new appError("Please provide valid recipient user IDs", 400);
  }

  const expenseClaim = await getExpenseClaimById(id);
  if (!expenseClaim) {
    throw new appError("Request not found", 404);
  }

  const updatedRequest = await ExpenseClaimCopyService.copyDocument({
    userId: currentUser._id,
    requestId: id,
    requestType: "expenseClaim",
    requestTitle: "Expense Claim",
    recipients: userIds,
  });

  handleResponse(res, 200, "Request copied successfully", updatedRequest);
});

const save = catchAsync(async (req, res) => {
  const data = req.body;
  const currentUser = await userByToken(req, res);

  const expenseClaim = await saveExpenseClaim(data, currentUser);

  handleResponse(res, 201, "Expense Claim saved successfully", expenseClaim);
});

const saveAndSend = catchAsync(async (req, res) => {
  req.body.expenseClaim = parseJsonField(req.body, "expenseClaim", true);
  req.body.expenses = parseJsonField(req.body, "expenses", true);

  const data = req.body;
  const files = req.files || [];

  const currentUser = await userByToken(req, res);

  const expenseClaim = await saveAndSendExpenseClaim(data, currentUser, files);

  handleResponse(
    res,
    201,
    "Expense Claim saved and sent successfully",
    expenseClaim
  );
});

const getStats = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const stats = await getExpenseClaimStats(currentUser);
  handleResponse(res, 200, "Expense Claims stats fetched successfully", stats);
});

const getAll = catchAsync(async (req, res) => {
  const { search, sort, page, limit } = req.query;
  const currentUser = await userByToken(req, res);

  const expenseClaims = await getExpenseClaims(
    { search, sort, page, limit },
    currentUser
  );

  handleResponse(
    res,
    200,
    "All Expense Claims fetched successfully",
    expenseClaims
  );
});

const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const expenseClaim = await getExpenseClaimById(id);
  if (!expenseClaim) {
    return handleResponse(res, 404, "Expense Claim not found");
  }

  handleResponse(res, 200, "Expense Claim fetched successfully", expenseClaim);
});

const update = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  const { id } = req.params;
  const data = req.body;
  const files = req.files || [];

  const expenseClaim = await updateExpenseClaim(id, data, files, currentUser);

  if (!expenseClaim) {
    return handleResponse(res, 404, "Expense Claim not found");
  }

  handleResponse(res, 200, "Expense Claim updated successfully", expenseClaim);
});

const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  // Fetch the current user
  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  const updatedRequest = await updateRequestStatus(id, data, currentUser);

  handleResponse(res, 200, "Request status updated", updatedRequest);
});

const remove = catchAsync(async (req, res) => {
  const { id } = req.params;
  const expenseClaim = await deleteExpenseClaim(id);
  if (!expenseClaim) {
    return handleResponse(res, 404, "Expense Claim not found");
  }

  handleResponse(res, 200, "Expense Claim deleted successfully", expenseClaim);
});

module.exports = {
  copyRequest,
  save,
  saveAndSend,
  getAll,
  getStats,
  getById,
  update,
  updateStatus,
  remove,
};
