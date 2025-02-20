const {
  getAllUsersService,
  deleteUserService,
  updateUserRoleService,
} = require("../services/userService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/userByToken");

const getAllUsers = catchAsync(async (req, res) => {
  const Users = await getAllUsersService(req, res);
  handleResponse(res, 200, "Users fetched successfully", Users);
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

module.exports = { getUserByToken, getAllUsers, deleteUser, updateRole };
