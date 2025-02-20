const User = require("../models/UserModel");

const getAllUsersService = async () => {
  const users = await User.find();
  return users;
};
const getUserByIdService = async (id) => {
  const user = await User.findById(id);

  if (!user) {
    throw new Error(`User with ID ${id} not found`);
  }

  return user;
};

const deleteUserService = async (id) => {
  const isUser = await User.findById(id);

  if (!isUser) {
    throw new Error(`User with ID ${id} not found`);
  }
  const user = await User.findByIdAndUpdate(id, { isDeleted: true });
  return user;
};
const updateUserRoleService = async (id, role) => {
  const isUser = await User.findById(id);

  if (!isUser) {
    throw new Error(`User with ID ${id} not found`);
  }
  const user = await User.findByIdAndUpdate(id, role);
  return user;
};

module.exports = {
  getUserByIdService,
  getAllUsersService,
  deleteUserService,
  updateUserRoleService,
};
