const User = require("../models/UserModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");

const getAllUsersService = async (queryParams) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;

  // Define the fields you want to search in
  const searchFields = ["first_name", "last_name", "email", "role"];

  // Build the query
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  const query = buildQuery(searchTerms, searchFields);

  // Build the sort object
  const sortQuery = buildSortQuery(sort);

  // Fetch users with filters, sorting, and pagination
  const {
    results: users,
    total,
    totalPages,
    currentPage,
  } = await paginate(User, query, { page, limit }, sortQuery);

  return {
    users,
    totalUsers: total,
    totalPages,
    currentPage,
  };
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
