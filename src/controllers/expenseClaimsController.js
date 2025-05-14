const {
  saveExpenseClaim,
  saveAndSendExpenseClaim,
  getExpenseClaims,
  getExpenseClaimById,
  updateExpenseClaim,
  deleteExpenseClaim,
  getExpenseClaimStats,
} = require("../services/expenseClaimsService");
// const { upload } = require("../controllers/fileController");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const parseJsonField = require("../utils/parseJsonField");
const userByToken = require("../utils/userByToken");

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
  const { id } = req.params;
  const data = req.body;
  const files = req.files || [];

  const expenseClaim = await updateExpenseClaim(id, data, files);

  if (!expenseClaim) {
    return handleResponse(res, 404, "Expense Claim not found");
  }

  handleResponse(res, 200, "Expense Claim updated successfully", expenseClaim);
});

const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const files = req.files || [];

  const existingExpenseClaim = await getExpenseClaimById(id);
  if (!existingExpenseClaim) {
    return handleResponse(res, 404, "Expense Claim not found");
  }

  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  if (data.comment) {
    if (!existingExpenseClaim.comments) {
      existingExpenseClaim.comments = [];
    }

    existingExpenseClaim.comments.unshift({
      user: currentUser.id,
      text: data.comment,
    });

    data.comments = existingExpenseClaim.comments;
  }

  if (data.status) {
    existingExpenseClaim.status = data.status;
  }

  const updatedExpenseClaim = await updateExpenseClaim(
    id,
    existingExpenseClaim,
    files
  );

  handleResponse(res, 200, "Expense Claim status updated", updatedExpenseClaim);
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
  save,
  saveAndSend,
  getAll,
  getStats,
  getById,
  update,
  updateStatus,
  remove,
};
