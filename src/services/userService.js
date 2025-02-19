const User = require("../models/UserModel");

const getAllUsersService = async (id, req) => {
  const users = await User.find();
  return users;
};
const getUserByIdService = async (id, req) => {
  const user = await User.findById(id);

  if (!user) {
    throw new Error(`User with ID ${id} not found`);
  }

  return user;
};

module.exports = { getUserByIdService, getAllUsersService };
