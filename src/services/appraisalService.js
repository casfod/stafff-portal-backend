// services/appraisalService.js
const Appraisal = require("../models/AppraisalModel");
const fileService = require("./fileService");
const handleFileUploads = require("../utils/FileUploads");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const notify = require("../utils/notify");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const searchConfig = require("../utils/searchConfig");
const BaseCopyService = require("./BaseCopyService");

class copyService extends BaseCopyService {
  constructor() {
    super(Appraisal, "Appraisal");
  }
}

const AppraisalCopyService = new copyService();

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
    { path: "staffStrategy", select: "strategyCode department period" },
    { path: "approvedBy", select: "email first_name last_name role" },
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
    achievements,
    safeguarding,
    staffStrategy,
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

  const appraisalData = {
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
    achievements,
    safeguarding: safeguarding || {
      actionsTaken: "",
      trainingCompleted: "No",
      areasNotUnderstood: [],
      supervisorStatus: "pending",
    },
    performanceAreas: [
      { area: "Job Knowledge", rating: "Pending", supervisorStatus: "pending" },
      { area: "Judgement", rating: "Pending", supervisorStatus: "pending" },
      { area: "Reliability", rating: "Pending", supervisorStatus: "pending" },
      {
        area: "Quality & Quantity of Work",
        rating: "Pending",
        supervisorStatus: "pending",
      },
      {
        area: "Interpersonal and Communication Skills",
        rating: "Pending",
        supervisorStatus: "pending",
      },
      { area: "Teamwork", rating: "Pending", supervisorStatus: "pending" },
    ],
    overallRating: "Pending",
    createdBy: currentUser._id,
    status: "draft",
    supervisorStatus: "pending",
    // Set approvedBy to supervisorId for the approval flow
    approvedBy: cleanObjectId(supervisorId),
  };

  if (staffStrategy) {
    appraisalData.staffStrategy = cleanObjectId(staffStrategy);
  }

  const appraisal = new Appraisal(appraisalData);

  await appraisal.save();

  await appraisal.populate([
    { path: "staffId", select: "email first_name last_name role position" },
    {
      path: "supervisorId",
      select: "email first_name last_name role position",
    },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "staffStrategy", select: "strategyCode department period" },
    { path: "approvedBy", select: "email first_name last_name role" },
  ]);

  return normalizeId(appraisal.toObject());
};

// Submit Appraisal (move from draft to pending) - FIXED with approvedBy check
const submitAppraisal = async (id, currentUser) => {
  const cleanedId = cleanObjectId(id);

  const appraisal = await Appraisal.findById(cleanedId);
  if (!appraisal) {
    throw new Error("Appraisal not found");
  }

  // Check permissions - only staff can submit
  const isStaff = appraisal.staffId.toString() === currentUser._id.toString();
  const isAdmin = ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);

  if (!isStaff && !isAdmin) {
    throw new Error("You don't have permission to submit this appraisal");
  }

  // Only allow submission from draft
  if (appraisal.status !== "draft") {
    throw new Error("Only draft appraisals can be submitted");
  }

  // Check if supervisor is assigned
  if (!appraisal.supervisorId) {
    throw new Error("Supervisor is required before submission");
  }

  // Check if approvedBy is assigned (should be set during save, but double-check)
  if (!appraisal.approvedBy) {
    // If not set, default to supervisorId
    appraisal.approvedBy = appraisal.supervisorId;
  }

  // Update status to pending
  appraisal.status = "pending";
  appraisal.submittedByEmployee = true;

  await appraisal.save();

  // FIXED: Properly notify supervisor when submitted (like StaffStrategy)
  if (appraisal.approvedBy) {
    try {
      await notify.notifyApprovers({
        request: appraisal,
        currentUser,
        requestType: "appraisal",
        title: "Staff Appraisal",
        header: "You have been assigned an appraisal for review",
      });
      console.log(`Notification sent to approver: ${appraisal.approvedBy}`);
    } catch (error) {
      console.error("Failed to send notification to approver:", error);
      // Don't throw - notification failure shouldn't block submission
    }
  }

  await appraisal.populate([
    { path: "staffId", select: "email first_name last_name role position" },
    {
      path: "supervisorId",
      select: "email first_name last_name role position",
    },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "staffStrategy", select: "strategyCode department period" },
    { path: "approvedBy", select: "email first_name last_name role" },
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

// Create and Submit in one step - FIXED with approvedBy set
const createAndSubmitAppraisal = async (data, currentUser) => {
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
    achievements,
    safeguarding,
    staffStrategy,
  } = data;

  // Validate required fields
  if (!staffId || !supervisorId) {
    throw new Error("Staff and Supervisor are required");
  }

  // Check if approvedBy is assigned (should be the supervisor)
  if (!supervisorId) {
    throw new Error("Supervisor (approvedBy) is required");
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

  const appraisalData = {
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
    achievements,
    safeguarding: safeguarding || {
      actionsTaken: "",
      trainingCompleted: "No",
      areasNotUnderstood: [],
      supervisorStatus: "pending",
    },
    performanceAreas: [
      { area: "Job Knowledge", rating: "Pending", supervisorStatus: "pending" },
      { area: "Judgement", rating: "Pending", supervisorStatus: "pending" },
      { area: "Reliability", rating: "Pending", supervisorStatus: "pending" },
      {
        area: "Quality & Quantity of Work",
        rating: "Pending",
        supervisorStatus: "pending",
      },
      {
        area: "Interpersonal and Communication Skills",
        rating: "Pending",
        supervisorStatus: "pending",
      },
      { area: "Teamwork", rating: "Pending", supervisorStatus: "pending" },
    ],
    overallRating: "Pending",
    createdBy: currentUser._id,
    status: "pending", // Directly set to pending
    submittedByEmployee: true,
    supervisorStatus: "pending",
    approvedBy: cleanObjectId(supervisorId), // Set approvedBy to supervisorId
  };

  if (staffStrategy) {
    appraisalData.staffStrategy = cleanObjectId(staffStrategy);
  }

  const appraisal = new Appraisal(appraisalData);

  await appraisal.save();

  // Notify approver
  if (appraisal.approvedBy) {
    try {
      await notify.notifyApprovers({
        request: appraisal,
        currentUser,
        requestType: "appraisal",
        title: "Staff Appraisal",
        header: "You have been assigned an appraisal for review",
      });
      console.log(`Notification sent to approver: ${appraisal.approvedBy}`);
    } catch (error) {
      console.error("Failed to send notification to approver:", error);
    }
  }

  await appraisal.populate([
    { path: "staffId", select: "email first_name last_name role position" },
    {
      path: "supervisorId",
      select: "email first_name last_name role position",
    },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "staffStrategy", select: "strategyCode department period" },
    { path: "approvedBy", select: "email first_name last_name role" },
  ]);

  const filesData = await fileService.getFilesByDocument(
    "Appraisals",
    appraisal._id
  );

  return normalizeId({
    ...appraisal.toObject(),
    files: normalizeFiles(filesData),
  });
};

// Update Status (Approve/Reject) - with notification to staff - FIXED
const updateAppraisalStatus = async (id, data, currentUser) => {
  const cleanedId = cleanObjectId(id);
  const { status, comment } = data;

  const appraisal = await Appraisal.findById(cleanedId);
  if (!appraisal) {
    throw new Error("Appraisal not found");
  }

  // Check permissions - only supervisor or admin can approve/reject
  const isSupervisor =
    appraisal.supervisorId.toString() === currentUser._id.toString();
  const isAdmin = ["SUPER-ADMIN", "ADMIN"].includes(currentUser.role);

  if (!isSupervisor && !isAdmin) {
    throw new Error(
      "You don't have permission to update this appraisal status"
    );
  }

  // Only allow status update from pending
  if (appraisal.status !== "pending") {
    throw new Error("Only pending appraisals can be approved or rejected");
  }

  // Validate status
  if (!["approved", "rejected"].includes(status)) {
    throw new Error("Status must be either 'approved' or 'rejected'");
  }

  // Update status
  appraisal.status = status;
  appraisal.submittedBySupervisor = true;
  appraisal.completedAt = new Date();

  // Set approvedBy when approved
  if (status === "approved") {
    appraisal.approvedBy = currentUser._id;
  }

  // Add comment if provided
  if (comment) {
    if (!appraisal.comments) {
      appraisal.comments = [];
    }
    appraisal.comments.push({
      user: currentUser._id,
      text: comment,
      edited: false,
      deleted: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  await appraisal.save();

  // FIXED: Properly notify staff when approved/rejected (like StaffStrategy)
  if (appraisal.staffId) {
    try {
      await notify.notifyCreator({
        request: appraisal,
        currentUser,
        requestType: "appraisal",
        title: "Appraisal Status Update",
        header: `Your appraisal has been ${status}`,
      });
      console.log(`Notification sent to staff: ${appraisal.staffId}`);
    } catch (error) {
      console.error("Failed to send notification to staff:", error);
      // Don't throw - notification failure shouldn't block status update
    }
  }

  await appraisal.populate([
    { path: "staffId", select: "email first_name last_name role position" },
    {
      path: "supervisorId",
      select: "email first_name last_name role position",
    },
    { path: "createdBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "staffStrategy", select: "strategyCode department period" },
    { path: "approvedBy", select: "email first_name last_name role" },
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
    {
      path: "staffStrategy",
      select: "strategyCode department period accountabilityAreas",
    },
    { path: "approvedBy", select: "email first_name last_name role" },
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

  // Prevent updates to approved/rejected appraisals
  if (["approved", "rejected"].includes(existingAppraisal.status) && !isAdmin) {
    throw new Error("Cannot update an approved or rejected appraisal");
  }

  // Staff can only update their sections
  if (isStaff && !isAdmin) {
    // Staff can only update their own ratings and safeguarding
    if (data.performanceAreas) delete data.performanceAreas;
    if (data.supervisorComments) delete data.supervisorComments;
    if (data.overallRating) delete data.overallRating;
  }

  // Supervisor can only update their sections
  if (isSupervisor && !isAdmin) {
    // Supervisor can update supervisor ratings and assessment
    // They cannot change staff ratings
    if (data.objectives) {
      data.objectives = data.objectives.map((obj) => ({
        ...obj,
        employeeRating: undefined, // Don't change staff ratings
        employeePoints: undefined,
      }));
    }
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
  if (data.staffStrategy)
    data.staffStrategy = cleanObjectId(data.staffStrategy);
  if (data.approvedBy) data.approvedBy = cleanObjectId(data.approvedBy);

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
    { path: "staffStrategy", select: "strategyCode department period" },
    { path: "approvedBy", select: "email first_name last_name role" },
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
    appraisal.status = "approved";
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
        approved: {
          $sum: { $cond: [{ $eq: ["$status", "approved"] }, 1, 0] },
        },
        pending: {
          $sum: { $cond: [{ $eq: ["$status", "pending"] }, 1, 0] },
        },
        draft: {
          $sum: { $cond: [{ $eq: ["$status", "draft"] }, 1, 0] },
        },
        rejected: {
          $sum: { $cond: [{ $eq: ["$status", "rejected"] }, 1, 0] },
        },
      },
    },
  ]);

  return {
    byStatus: stats,
    overall: overall[0] || {
      total: 0,
      approved: 0,
      pending: 0,
      draft: 0,
      rejected: 0,
    },
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

// Comment functions
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
  AppraisalCopyService,
  getAppraisals,
  saveAppraisal,
  submitAppraisal,
  createAndSubmitAppraisal, // New function for one-step create and submit
  updateAppraisalStatus,
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
