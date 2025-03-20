const {
  getAllUsersService,
  deleteUserService,
  updateUserRoleService,
  getAllAdminService,
  getAllReviewersService,
} = require("../services/userService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");

const getAllAdmins = catchAsync(async (req, res) => {
  const result = await getAllAdminService();
  handleResponse(res, 200, "Admins fetched successfully", result);
});
const getAllReviewers = catchAsync(async (req, res) => {
  const result = await getAllReviewersService();
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

const deleteUser = catchAsync(async (req, res) => {
  await deleteUserService(req.params.userID);
  handleResponse(res, 204, "User deleted successfully");
});
const updateRole = catchAsync(async (req, res) => {
  await updateUserRoleService(req.params.userID, req.body);
  handleResponse(res, 204, "User deleted successfully");
});

module.exports = {
  getUserByToken,
  getAllAdmins,
  getAllReviewers,
  getAllUsers,
  deleteUser,
  updateRole,
};
