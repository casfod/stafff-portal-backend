const {
  getAllUsersService,
  deleteUserService,
  updateUserAdminService,
  getAllAdminService,
  getAllReviewersService,
  getUserByIdService,
} = require("../services/userService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");

const getAllAdmins = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  if (!currentUser) return handleResponse(res, 404, "User not found");

  const result = await getAllAdminService(currentUser);
  handleResponse(res, 200, "Admins fetched successfully", result);
});
const getAllReviewers = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);
  if (!currentUser) return handleResponse(res, 404, "User not found");

  const result = await getAllReviewersService(currentUser);
  handleResponse(res, 200, "Reviewers fetched successfully", result);
});
const getAllUsers = catchAsync(async (req, res) => {
  const { search, role, sort, page, limit } = req.query;
  const result = await getAllUsersService({ search, role, sort, page, limit });
  handleResponse(res, 200, "Users fetched successfully", result);
});
const getUserByToken = catchAsync(async (req, res) => {
  const currentUser = await userByToken(req, res);

  if (!currentUser) return handleResponse(res, 404, "User not found");
  handleResponse(res, 200, "User fetched successfully", currentUser);
});
const getUserById = catchAsync(async (req, res) => {
  const { id } = req.params;

  const currentUser = await getUserByIdService(id);

  if (!currentUser) return handleResponse(res, 404, "User not found");
  handleResponse(res, 200, "User fetched successfully", currentUser);
});

const deleteUser = catchAsync(async (req, res) => {
  await deleteUserService(req.params.userID);
  handleResponse(res, 204, "User deleted successfully");
});
const updateUserAdmin = catchAsync(async (req, res) => {
  const updatedUser = await updateUserAdminService(req.params.userID, req.body);
  handleResponse(res, 200, "User updated successfully", updatedUser); // Changed to 200
});

module.exports = {
  getUserByToken,
  getUserById,
  getAllAdmins,
  getAllReviewers,
  getAllUsers,
  deleteUser,
  updateUserAdmin,
};
