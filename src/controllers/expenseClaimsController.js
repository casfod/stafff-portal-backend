const {
  saveExpenseClaim,
  saveAndSendExpenseClaim,
  getExpenseClaims,
  getExpenseClaimById,
  updateExpenseClaim,
  deleteExpenseClaim,
  // updateRequestStatus,
  getExpenseClaimStats,
} = require("../services/expenseClaimsService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");

const save = catchAsync(async (req, res) => {
  const data = req.body;
  const currentUser = await userByToken(req, res);

  const expenseClaim = await saveExpenseClaim(data, currentUser);

  handleResponse(res, 201, "Expense Claim saved successfully", expenseClaim);
});

// Save and send a Expense Claim request (pending)
const saveAndSend = catchAsync(async (req, res) => {
  const data = req.body;

  const currentUser = await userByToken(req, res);

  const expenseClaim = await saveAndSendExpenseClaim(data, currentUser);

  handleResponse(
    res,
    201,
    "Expense Claim saved and sent successfully",
    expenseClaim
  );
});

//Get stats
const getStats = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  const stats = await getExpenseClaimStats(currentUser);

  handleResponse(res, 200, "Expense Claims stats fetched successfully", stats);
});

// Get all Expense Claim requests
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

// Get a single Expense Claim request by ID
const getById = catchAsync(async (req, res) => {
  const { id } = req.params;
  const expenseClaim = await getExpenseClaimById(id);
  if (!expenseClaim) {
    return handleResponse(res, 404, "Expense Claim not found");
  }

  handleResponse(res, 200, "Expense Claim fetched successfully", expenseClaim);
});

// Update a Expense Claim request
const update = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;
  const expenseClaim = await updateExpenseClaim(id, data);
  if (!expenseClaim) {
    return handleResponse(res, 404, "Expense Claim not found");
  }

  handleResponse(res, 200, "Expense Claim updated successfully", expenseClaim);
});

const updateStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const data = req.body;

  // Fetch the existing Expense Claim request
  const existingExpenseClaim = await getExpenseClaimById(id);
  if (!existingExpenseClaim) {
    return handleResponse(res, 404, "Expense Claim not found");
  }

  // Fetch the current user
  const currentUser = await userByToken(req, res);
  if (!currentUser) {
    return handleResponse(res, 401, "Unauthorized");
  }

  // Add a new comment if it exists in the request body
  if (data.comment) {
    // Initialize comments as an empty array if it doesn't exist
    if (!existingExpenseClaim.comments) {
      existingExpenseClaim.comments = [];
    }

    // Add the new comment to the top of the comments array
    existingExpenseClaim.comments.unshift({
      user: currentUser.id, // Add the current user's ID
      text: data.comment, // Add the comment text (using the new `text` field)
    });

    // Update the data object to include the modified comments
    data.comments = existingExpenseClaim.comments;
  }

  // Update the status and other fields
  if (data.status) {
    existingExpenseClaim.status = data.status;
  }

  // Save the updated Expense Claim request
  const updatedExpenseClaim = await existingExpenseClaim.save();

  // Send success response
  handleResponse(res, 200, "Expense Claim status updated", updatedExpenseClaim);
});

// Delete a Expense Claim request
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
