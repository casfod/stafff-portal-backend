const ExpenseClaims = require("../models/ExpenseClaimsModel");
const fileService = require("../services/fileService");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");

// Get all ExpenseClaims
const getExpenseClaims = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 8 } = queryParams;
  const searchFields = ["project", "location", "staffName", "budget"];
  const searchTerms = search ? search.trim().split(/\s+/) : [];
  let query = buildQuery(searchTerms, searchFields);

  switch (currentUser.role) {
    case "STAFF":
      query.createdBy = currentUser._id;
      break;
    case "ADMIN":
      query.$or = [
        { createdBy: currentUser._id },
        { approvedBy: currentUser._id },
      ];
      break;
    case "REVIEWER":
      query.$or = [
        { createdBy: currentUser._id },
        { reviewedBy: currentUser._id },
      ];
      break;
    case "SUPER-ADMIN":
      query.$or = [
        { status: { $ne: "draft" } },
        { createdBy: currentUser._id, status: "draft" },
      ];
      break;
    default:
      throw new Error("Invalid user role");
  }

  const sortQuery = buildSortQuery(sort);

  const populateOptions = [
    { path: "project", select: "project_code account_code" },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
  ];

  const {
    results: expenseClaims,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    ExpenseClaims,
    query,
    { page, limit },
    sortQuery,
    populateOptions
  );

  // Fetch associated files for each expense claim
  const expenseClaimsWithFiles = await Promise.all(
    expenseClaims.map(async (claim) => {
      const files = await fileService.getFilesByDocument(
        "ExpenseClaims",
        claim._id
      );
      return {
        ...claim.toJSON(),
        files,
      };
    })
  );

  return {
    expenseClaims: expenseClaimsWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// Create a new ExpenseClaim with files
const createExpenseClaim = async (data, files = []) => {
  const expenseClaim = new ExpenseClaims(data);
  await expenseClaim.save();

  // Upload and associate files if provided
  if (files.length > 0) {
    const uploadPromises = files.map((file) =>
      fileService.uploadFile({
        buffer: file.buffer,
        originalname: file.originalname,
        mimetype: file.mimetype,
        size: file.size,
      })
    );

    const uploadedFiles = await Promise.all(uploadPromises);

    // Associate files with the expense claim
    await Promise.all(
      uploadedFiles.map((file) =>
        fileService.associateFile(
          file.id,
          "ExpenseClaims",
          expenseClaim._id,
          "receipts"
        )
      )
    );
  }

  return expenseClaim;
};

// Save a ExpenseClaim (draft)
const saveExpenseClaim = async (data, currentUser) => {
  data.createdBy = currentUser._id;
  data.staffName = `${currentUser.first_name} ${currentUser.last_name}`;
  data.comments = undefined;

  const expenseClaim = new ExpenseClaims({ ...data, status: "draft" });
  await expenseClaim.save();

  return expenseClaim;
};

// Save and send a ExpenseClaim (pending)
const saveAndSendExpenseClaim = async (data, currentUser, files = []) => {
  data.createdBy = currentUser._id;
  data.staffName = `${currentUser.first_name} ${currentUser.last_name}`;

  if (!data.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }

  const expenseClaim = new ExpenseClaims({ ...data, status: "pending" });
  await expenseClaim.save();

  // Handle file uploads
  if (files.length > 0) {
    const uploadedFiles = await Promise.all(
      files.map((file) =>
        fileService.uploadFile({
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        })
      )
    );

    await Promise.all(
      uploadedFiles.map((file) =>
        fileService.associateFile(
          file._id, // Use _id instead of id if that's what MongoDB uses
          "ExpenseClaims",
          expenseClaim._id,
          "receipts"
        )
      )
    );
  }

  return expenseClaim;
};

// Get ExpenseClaim stats
const getExpenseClaimStats = async (currentUser) => {
  if (!currentUser?._id) {
    throw new Error("Invalid user information");
  }

  const baseMatch = {
    status: { $ne: "draft" },
  };

  switch (currentUser.role) {
    case "SUPER-ADMIN":
      break;
    default:
      baseMatch.createdBy = currentUser._id;
      break;
  }

  const stats = await ExpenseClaims.aggregate([
    {
      $match: baseMatch,
    },
    {
      $facet: {
        totalRequests: [{ $count: "count" }],
        totalApprovedRequests: [
          { $match: { status: "approved" } },
          { $count: "count" },
        ],
      },
    },
  ]);

  return {
    totalRequests: stats[0].totalRequests[0]?.count || 0,
    totalApprovedRequests: stats[0].totalApprovedRequests[0]?.count || 0,
  };
};

// Get a single expense claim by ID with files
const getExpenseClaimById = async (id) => {
  const expenseClaim = await ExpenseClaims.findById(id).populate(
    "createdBy",
    "email"
  );
  if (!expenseClaim) return null;

  const files = await fileService.getFilesByDocument("ExpenseClaims", id);
  return {
    ...expenseClaim.toJSON(),
    files,
  };
};

// Update a expense claim
const updateExpenseClaim = async (id, data, files = []) => {
  const expenseClaim = await ExpenseClaims.findByIdAndUpdate(id, data, {
    new: true,
  });
  if (!expenseClaim) return null;

  // Handle new file uploads
  if (files.files?.length > 0) {
    const uploadedFiles = await Promise.all(
      files.files.map((file) =>
        fileService.uploadFile({
          buffer: file.buffer,
          originalname: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
        })
      )
    );

    await Promise.all(
      uploadedFiles.map((file) =>
        fileService.associateFile(
          file._id, // Use _id instead of id if that's what MongoDB uses
          "ExpenseClaims",
          expenseClaim._id,
          "receipts"
        )
      )
    );
  }

  return expenseClaim;
};

// Delete a expense claim and its files
const deleteExpenseClaim = async (id) => {
  console.log(`Deleting expense claim ID:`, id);

  const deletedFilesCount = fileService.deleteFilesByDocument(
    "ExpenseClaims",
    id
  );

  console.log(`Deleted ${deletedFilesCount} associated files.`);

  return await ExpenseClaims.findByIdAndDelete(id);
};

module.exports = {
  saveExpenseClaim,
  saveAndSendExpenseClaim,
  getExpenseClaims,
  getExpenseClaimById,
  updateExpenseClaim,
  deleteExpenseClaim,
  getExpenseClaimStats,
};
