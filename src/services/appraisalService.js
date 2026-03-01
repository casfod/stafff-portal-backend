// services/appraisalService.js
const Appraisal = require("../models/AppraisalModel");
const User = require("../models/UserModel");
const fileService = require("./fileService");
const handleFileUploads = require("../utils/FileUploads");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const notify = require("../utils/notify");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const searchConfig = require("../utils/searchConfig");
const mongoose = require("mongoose");

const cleanObjectId = (id) => {
  if (!id) return null;
  let cleanedId = id.toString().trim();
  cleanedId = cleanedId.replace(/^"+|"+$/g, "");
  if (!/^[0-9a-fA-F]{24}$/.test(cleanedId)) {
    throw new Error(`Invalid ObjectId format: ${id}`);
  }
  return cleanedId;
};

// Get all Appraisals
const getAppraisals = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = 10, status, period } = queryParams;

  const searchFields = searchConfig.appraisal || [
    "appraisalCode",
    "staffName",
    "position",
    "department",
    "appraisalPeriod",
    "status",
  ];

  const searchTerms = search ? search.trim().split(/\s+/) : [];
  const baseQuery = buildQuery(searchTerms, searchFields);

  // Add filters
  if (status) baseQuery.status = status;
  if (period) baseQuery.appraisalPeriod = period;

  // Role-based access control
  switch (currentUser.role) {
    case "STAFF":
      baseQuery.$or = [
        { staffId: currentUser._id },
        { createdBy: currentUser._id },
      ];
      break;

    case "ADMIN":
    case "SUPER-ADMIN":
      // Can see all except maybe filter by department
      if (currentUser.department) {
        baseQuery.department = currentUser.department;
      }
      break;

    default:
      throw new Error("Invalid user role");
  }

  const sortQuery = buildSortQuery(sort);

  const populateOptions = [
    { path: "staffId", select: "email first_name last_name role position" },
    {
      path: "supervisorId",
      select: "email first_name last_name role position",
    },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
  ];

  const {
    results: appraisals,
    total,
    totalPages,
    currentPage,
  } = await paginate(
    Appraisal,
    baseQuery,
    { page, limit },
    sortQuery,
    populateOptions
  );

  const appraisalsWithFiles = await Promise.all(
    appraisals.map(async (appraisal) => {
      if (appraisal.comments) {
        appraisal.comments = appraisal.comments.filter(
          (comment) => !comment.deleted
        );
      }

      const files = await fileService.getFilesByDocument(
        "Appraisals",
        appraisal._id
      );
      return {
        ...appraisal.toJSON(),
        files: normalizeFiles(files),
      };
    })
  );

  return {
    appraisals: appraisalsWithFiles,
    total,
    totalPages,
    currentPage,
  };
};

// Create Appraisal (as draft)
const saveAppraisal = async (data, currentUser) => {
  const {
    staffId,
    staffName,
    position,
    department,
    lengthOfTimeInPosition,
    appraisalPeriod,
    supervisorId,
    supervisorName,
    lengthOfTimeSupervised,
    objectives,
    safeguarding,
  } = data;

  // Validate required fields
  if (!staffId || !supervisorId) {
    throw new Error("Staff and Supervisor are required");
  }

  // Initialize with default objectives if not provided
  const defaultObjectives = objectives || [
    { objective: "" },
    { objective: "" },
    { objective: "" },
    { objective: "" },
    { objective: "" },
    { objective: "Safeguarding" },
  ];

  const appraisal = new Appraisal({
    staffId: cleanObjectId(staffId),
    staffName,
    position,
    department,
    lengthOfTimeInPosition,
    appraisalPeriod,
    dateOfAppraisal: new Date(),
    supervisorId: cleanObjectId(supervisorId),
    supervisorName,
    lengthOfTimeSupervised,
    objectives: defaultObjectives,
    safeguarding: safeguarding || {
      actionsTaken: "",
      trainingCompleted: "No",
      areasNotUnderstood: [],
    },
    performanceAreas: [
      { area: "Job Knowledge", rating: "Meets Expectations" },
      { area: "Judgement", rating: "Meets Expectations" },
      { area: "Reliability", rating: "Meets Expectations" },
      { area: "Quality & Quantity of Work", rating: "Meets Expectations" },
      {
        area: "Interpersonal and Communication Skills",
        rating: "Meets Expectations",
      },
      { area: "Teamwork", rating: "Meets Expectations" },
    ],
    overallRating: "Meets Requirements",
    createdBy: currentUser._id,
    status: "draft",
  });

  await appraisal.save();

  await appraisal.populate([
    { path: "staffId", select: "email first_name last_name role position" },
    {
      path: "supervisorId",
      select: "email first_name last_name role position",
    },
    { path: "createdBy", select: "email first_name last_name role" },
  ]);

  return normalizeId(appraisal.toObject());
};

// Submit Appraisal (move from draft to pending-employee or pending-supervisor)
const submitAppraisal = async (id, currentUser, submitterRole) => {
  const cleanedId = cleanObjectId(id);

  const appraisal = await Appraisal.findById(cleanedId);
  if (!appraisal) {
    throw new Error("Appraisal not found");
  }

  // Check permissions
  const isStaff = appraisal.staffId.toString() === currentUser._id.toString();
  const isSupervisor =
    appraisal.supervisorId.toString() === currentUser._id.toString();
  const isAdmin = ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);

  if (!isStaff && !isSupervisor && !isAdmin) {
    throw new Error("You don't have permission to submit this appraisal");
  }

  // Handle submission based on role
  if (submitterRole === "employee" && isStaff) {
    appraisal.submittedByEmployee = true;
    appraisal.status = "pending-supervisor";
  } else if (submitterRole === "supervisor" && isSupervisor) {
    appraisal.submittedBySupervisor = true;

    // If employee already submitted, mark as completed
    if (appraisal.submittedByEmployee) {
      appraisal.status = "completed";
      appraisal.completedAt = new Date();
    } else {
      appraisal.status = "pending-employee";
    }
  } else if (isAdmin) {
    // Admin can force complete
    appraisal.status = "completed";
    appraisal.completedAt = new Date();
    appraisal.submittedByEmployee = true;
    appraisal.submittedBySupervisor = true;
  } else {
    throw new Error("You don't have permission to submit this appraisal");
  }

  await appraisal.save();

  // Notify the other party
  if (submitterRole === "employee") {
    notify.notifyApprovers({
      request: appraisal,
      currentUser,
      requestType: "appraisal",
      title: "Appraisal Submission",
      header: "Staff appraisal has been submitted for your review",
      recipientId: appraisal.supervisorId,
    });
  } else if (
    submitterRole === "supervisor" &&
    appraisal.status === "pending-employee"
  ) {
    notify.notifyApprovers({
      request: appraisal,
      currentUser,
      requestType: "appraisal",
      title: "Appraisal Feedback",
      header: "Supervisor has provided feedback on your appraisal",
      recipientId: appraisal.staffId,
    });
  }

  await appraisal.populate([
    { path: "staffId", select: "email first_name last_name role position" },
    {
      path: "supervisorId",
      select: "email first_name last_name role position",
    },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
  ]);

  const filesData = await fileService.getFilesByDocument(
    "Appraisals",
    cleanedId
  );

  return normalizeId({
    ...appraisal.toObject(),
    files: normalizeFiles(filesData),
  });
};

// Get Appraisal by ID
const getAppraisalById = async (id) => {
  const cleanedId = cleanObjectId(id);

  const populateOptions = [
    {
      path: "staffId",
      select: "email first_name last_name role position employmentInfo",
    },
    {
      path: "supervisorId",
      select: "email first_name last_name role position",
    },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
  ];

  const appraisal = await Appraisal.findById(cleanedId)
    .populate(populateOptions)
    .lean();

  if (!appraisal) {
    throw new Error("Appraisal not found");
  }

  if (appraisal.comments) {
    appraisal.comments = appraisal.comments.filter(
      (comment) => !comment.deleted
    );
  }

  const files = await fileService.getFilesByDocument("Appraisals", cleanedId);

  return normalizeId({
    ...appraisal,
    files: normalizeFiles(files),
  });
};

// Update Appraisal
const updateAppraisal = async (id, data, files = [], currentUser) => {
  const cleanedId = cleanObjectId(id);
  const existingAppraisal = await Appraisal.findById(cleanedId);

  if (!existingAppraisal) {
    throw new Error("Appraisal not found");
  }

  // Check permissions
  const isStaff =
    existingAppraisal.staffId.toString() === currentUser._id.toString();
  const isSupervisor =
    existingAppraisal.supervisorId.toString() === currentUser._id.toString();
  const isAdmin = ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);

  if (!isStaff && !isSupervisor && !isAdmin) {
    throw new Error("You don't have permission to update this appraisal");
  }

  // Prevent updates to completed appraisals
  if (existingAppraisal.status === "completed" && !isAdmin) {
    throw new Error("Cannot update a completed appraisal");
  }

  // Handle comments
  if (data.comment && currentUser) {
    if (!existingAppraisal.comments) {
      existingAppraisal.comments = [];
    }
    existingAppraisal.comments.unshift({
      user: currentUser._id,
      text: data.comment,
      edited: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    data.comments = existingAppraisal.comments;
  }

  // Clean IDs
  if (data.staffId) data.staffId = cleanObjectId(data.staffId);
  if (data.supervisorId) data.supervisorId = cleanObjectId(data.supervisorId);

  const updatedAppraisal = await Appraisal.findByIdAndUpdate(
    cleanedId,
    { ...data, updatedAt: new Date() },
    { new: true, runValidators: true }
  ).populate([
    { path: "staffId", select: "email first_name last_name role position" },
    {
      path: "supervisorId",
      select: "email first_name last_name role position",
    },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
  ]);

  if (files.length > 0) {
    await handleFileUploads({
      files,
      requestId: updatedAppraisal._id,
      modelTable: "Appraisals",
    });
  }

  const filesData = await fileService.getFilesByDocument(
    "Appraisals",
    cleanedId
  );

  return normalizeId({
    ...updatedAppraisal.toObject(),
    files: normalizeFiles(filesData),
  });
};

// Update objectives (specific to employee/supervisor)
const updateObjectives = async (id, objectives, currentUser) => {
  const cleanedId = cleanObjectId(id);
  const appraisal = await Appraisal.findById(cleanedId);

  if (!appraisal) {
    throw new Error("Appraisal not found");
  }

  const isStaff = appraisal.staffId.toString() === currentUser._id.toString();
  const isSupervisor =
    appraisal.supervisorId.toString() === currentUser._id.toString();

  if (!isStaff && !isSupervisor) {
    throw new Error("You don't have permission to update objectives");
  }

  // Update ratings based on role
  objectives.forEach((newObj) => {
    const existingObj = appraisal.objectives.id(newObj._id);
    if (existingObj) {
      if (isStaff) {
        existingObj.employeeRating = newObj.employeeRating;
      }
      if (isSupervisor) {
        existingObj.supervisorRating = newObj.supervisorRating;
      }
    }
  });

  await appraisal.save();

  return normalizeId(appraisal.toObject());
};

// Sign appraisal
const signAppraisal = async (id, currentUser, signatureType, comments) => {
  const cleanedId = cleanObjectId(id);
  const appraisal = await Appraisal.findById(cleanedId);

  if (!appraisal) {
    throw new Error("Appraisal not found");
  }

  const isStaff = appraisal.staffId.toString() === currentUser._id.toString();
  const isSupervisor =
    appraisal.supervisorId.toString() === currentUser._id.toString();

  if (signatureType === "staff" && !isStaff) {
    throw new Error("Only the staff member can sign as staff");
  }

  if (signatureType === "supervisor" && !isSupervisor) {
    throw new Error("Only the supervisor can sign as supervisor");
  }

  if (signatureType === "staff") {
    appraisal.signatures.staffSignature = true;
    appraisal.signatures.staffSignatureDate = new Date();
    if (comments) appraisal.signatures.staffComments = comments;
  }

  if (signatureType === "supervisor") {
    appraisal.signatures.supervisorSignature = true;
    appraisal.signatures.supervisorSignatureDate = new Date();
    if (comments) appraisal.signatures.hrComments = comments;
  }

  // If both signed, mark as completed
  if (
    appraisal.signatures.staffSignature &&
    appraisal.signatures.supervisorSignature
  ) {
    appraisal.status = "completed";
    appraisal.completedAt = new Date();
  }

  await appraisal.save();

  return normalizeId(appraisal.toObject());
};

// Get appraisal statistics
const getAppraisalStats = async (currentUser) => {
  const matchStage = {};

  if (currentUser.role === "STAFF") {
    matchStage.staffId = currentUser._id;
  } else if (currentUser.role === "ADMIN" && currentUser.department) {
    matchStage.department = currentUser.department;
  }

  const stats = await Appraisal.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: "$status",
        count: { $sum: 1 },
        avgEmployeeScore: { $avg: "$scores.employeeTotal" },
        avgSupervisorScore: { $avg: "$scores.supervisorTotal" },
      },
    },
  ]);

  const overall = await Appraisal.aggregate([
    { $match: matchStage },
    {
      $group: {
        _id: null,
        total: { $sum: 1 },
        completed: {
          $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] },
        },
        pending: {
          $sum: {
            $cond: [
              { $in: ["$status", ["pending-employee", "pending-supervisor"]] },
              1,
              0,
            ],
          },
        },
        draft: {
          $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] },
        },
      },
    },
  ]);

  return {
    byStatus: stats,
    overall: overall[0] || { total: 0, completed: 0, pending: 0, draft: 0 },
  };
};

// Delete Appraisal (drafts only)
const deleteAppraisal = async (id) => {
  const cleanedId = cleanObjectId(id);

  const appraisal = await Appraisal.findById(cleanedId);
  if (!appraisal) {
    throw new Error("Appraisal not found");
  }

  if (appraisal.status !== "draft") {
    throw new Error("Only draft appraisals can be deleted");
  }

  await fileService.deleteFilesByDocument("Appraisals", cleanedId);
  return await Appraisal.findByIdAndDelete(cleanedId);
};

// Comment functions (similar to staffStrategy)
const addComment = async (id, currentUser, text) => {
  const appraisal = await Appraisal.findById(id);

  if (!appraisal) {
    throw new Error("Appraisal not found");
  }

  const canComment =
    appraisal.staffId.toString() === currentUser._id.toString() ||
    appraisal.supervisorId.toString() === currentUser._id.toString() ||
    ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);

  if (!canComment) {
    throw new Error("You don't have permission to comment on this appraisal");
  }

  const newComment = {
    user: currentUser._id,
    text: text.trim(),
    edited: false,
    deleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  appraisal.comments.unshift(newComment);
  await appraisal.save();

  const populatedAppraisal = await Appraisal.findById(id)
    .populate("comments.user", "email first_name last_name role")
    .lean();

  const populatedComments = populatedAppraisal.comments.filter(
    (comment) => !comment.deleted
  );

  return populatedComments[0];
};

const updateComment = async (id, commentId, userId, text) => {
  const appraisal = await Appraisal.findById(id);

  if (!appraisal) {
    throw new Error("Appraisal not found");
  }

  const comment = appraisal.comments.id(commentId);

  if (!comment) {
    throw new Error("Comment not found");
  }

  if (comment.user.toString() !== userId.toString()) {
    throw new Error("You can only edit your own comments");
  }

  comment.text = text.trim();
  comment.edited = true;
  comment.updatedAt = new Date();

  await appraisal.save();

  const populatedAppraisal = await Appraisal.findById(id)
    .populate("comments.user", "email first_name last_name role")
    .lean();

  return populatedAppraisal.comments.find(
    (c) => c._id.toString() === commentId.toString()
  );
};

const deleteComment = async (id, commentId, userId) => {
  const appraisal = await Appraisal.findById(id);

  if (!appraisal) {
    throw new Error("Appraisal not found");
  }

  const comment = appraisal.comments.id(commentId);

  if (!comment) {
    throw new Error("Comment not found");
  }

  const isOwner = comment.user.toString() === userId._id.toString();
  const isAdmin = ["SUPER-ADMIN", "ADMIN"].includes(userId.role);

  if (!isOwner && !isAdmin) {
    throw new Error("You don't have permission to delete this comment");
  }

  comment.deleted = true;
  comment.updatedAt = new Date();

  await appraisal.save();

  return { success: true, message: "Comment deleted successfully" };
};

module.exports = {
  getAppraisals,
  saveAppraisal,
  submitAppraisal,
  getAppraisalById,
  updateAppraisal,
  updateObjectives,
  signAppraisal,
  getAppraisalStats,
  deleteAppraisal,
  addComment,
  updateComment,
  deleteComment,
};
