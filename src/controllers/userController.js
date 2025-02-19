const { getAllUsersService } = require("../services/userService");
const catchAsync = require("../utils/catchAsync");
const handleResponse = require("../utils/handleResponse");
const userByToken = require("../utils/UserByToken");

const getAllUsers = catchAsync(async (req, res, next) => {
  const Users = await getAllUsersService(req, res);
  handleResponse(res, 200, "Users fetched successfully", Users);
});
const getUserByToken = catchAsync(async (req, res, next) => {
  const currentUser = await userByToken(req, res);

  if (!currentUser) return handleResponse(res, 404, "User not found");
  handleResponse(res, 200, "User fetched successfully", currentUser);
});

module.exports = { getUserByToken, getAllUsers };
