const User = require("../models/UserModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");

const SUPERVISOR_POPULATE = {
  path: "employmentInfo.jobDetails.supervisorId",
  select: "first_name last_name email position",
};

const getAllAdminService = async (currentUser) => {
  const admins = await User.find({
    role: { $nin: ["STAFF", "REVIEWER"] },
    _id: { $ne: currentUser._id }, // Exclude current user
  }).populate(SUPERVISOR_POPULATE);
  return admins;
};

const getAllReviewersService = async (currentUser) => {
  const reviewers = await User.find({
    role: "REVIEWER",
    _id: { $ne: currentUser._id }, // Exclude current user
  }).populate(SUPERVISOR_POPULATE);
  return reviewers;
};

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
  } = await paginate(User, query, { page, limit }, sortQuery, [
    SUPERVISOR_POPULATE,
  ]);

  return {
    users,
    totalUsers: total,
    totalPages,
    currentPage,
  };
};

const getUserByIdService = async (id) => {
  const user = await User.findById(id).populate(SUPERVISOR_POPULATE);

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
const updateUserAdminService = async (id, role) => {
  const isUser = await User.findById(id);

  if (!isUser) {
    throw new Error(`User with ID ${id} not found`);
  }
  const user = await User.findByIdAndUpdate(id, role);
  return user;
};

module.exports = {
  getUserByIdService,
  getAllAdminService,
  getAllReviewersService,
  getAllUsersService,
  deleteUserService,
  updateUserAdminService,
};
