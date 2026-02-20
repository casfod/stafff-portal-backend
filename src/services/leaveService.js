// services/leaveService.js
const Leave = require("../models/LeaveModel");
const LeaveBalance = require("../models/LeaveBalanceModel");
const User = require("../models/UserModel");
const buildQuery = require("../utils/buildQuery");
const buildSortQuery = require("../utils/buildSortQuery");
const paginate = require("../utils/paginate");
const fileService = require("./fileService");
const notify = require("../utils/notify");
const { normalizeId, normalizeFiles } = require("../utils/normalizeData");
const BaseCopyService = require("./BaseCopyService");
const searchConfig = require("../utils/searchConfig");
const statusUpdateService = require("./statusUpdateService");

// Leave type configuration (matching your LEAVE FORM.docx)
const LEAVE_TYPE_CONFIG = {
  "Annual leave": {
    maxDays: 24,
    description: "24 days",
    isCalendarDays: false,
    balanceKey: "annualLeave",
  },
  "Compassionate leave": {
    maxDays: 10,
    description: "10 days Max",
    isCalendarDays: false,
    balanceKey: "compassionateLeave",
  },
  "Sick leave": {
    maxDays: 12,
    description: "12 Days",
    isCalendarDays: false,
    balanceKey: "sickLeave",
  },
  "Maternity leave": {
    maxDays: 90,
    description: "90 Working days",
    isCalendarDays: false,
    balanceKey: "maternityLeave",
  },
  "Paternity leave": {
    maxDays: 14,
    description: "14 Calendar Days",
    isCalendarDays: true,
    balanceKey: "paternityLeave",
  },
  "Emergency leave": {
    maxDays: 5,
    description: "5 days",
    isCalendarDays: false,
    balanceKey: "emergencyLeave",
  },
  "Study Leave": {
    maxDays: 10,
    description: "10 working day",
    isCalendarDays: false,
    balanceKey: "studyLeave",
  },
  "Leave without pay": {
    maxDays: 365,
    description: "Up to 1 year",
    isCalendarDays: true,
    balanceKey: "leaveWithoutPay",
  },
};

// Add this helper function near the top of leaveService.js
const mapFormFieldsToBackend = (data) => {
  const mappedData = { ...data };

  // Handle reviewedById -> reviewedBy mapping
  if (data.reviewedById !== undefined) {
    mappedData.reviewedBy = data.reviewedById;
    delete mappedData.reviewedById;
  }

  // Handle approvedById -> approvedBy mapping
  if (data.approvedById !== undefined) {
    mappedData.approvedBy = data.approvedById;
    delete mappedData.approvedById;
  }

  return mappedData;
};

class copyService extends BaseCopyService {
  constructor() {
    super(Leave, "Leave");
  }
}

const LeaveCopyService = new copyService();

// Helper function to calculate days between dates
const calculateDaysBetween = (startDate, endDate, isCalendarDays = false) => {
  const start = new Date(startDate);
  const end = new Date(endDate);
  const diffTime = Math.abs(end - start);
  const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1; // +1 to include both start and end

  if (isCalendarDays) {
    return diffDays;
  }

  // For working days, exclude weekends (Saturday and Sunday)
  let workingDays = 0;
  const currentDate = new Date(start);

  while (currentDate <= end) {
    const dayOfWeek = currentDate.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // 0 = Sunday, 6 = Saturday
      workingDays++;
    }
    currentDate.setDate(currentDate.getDate() + 1);
  }

  return workingDays;
};

// Initialize or get user's leave balance
const getOrCreateLeaveBalance = async (userId) => {
  let leaveBalance = await LeaveBalance.findOne({ user: userId });

  if (!leaveBalance) {
    leaveBalance = new LeaveBalance({ user: userId });
    await leaveBalance.save();
  } else {
    // Reset if new year
    leaveBalance.resetForNewYear();
    await leaveBalance.save();
  }

  return leaveBalance;
};

// Get balance key from leave type
const getBalanceKeyFromLeaveType = (leaveType) => {
  const config = LEAVE_TYPE_CONFIG[leaveType];
  return config ? config.balanceKey : null;
};

// Validate leave application against balance
const validateLeaveApplication = async (
  userId,
  leaveType,
  totalDaysApplied
) => {
  const leaveBalance = await getOrCreateLeaveBalance(userId);

  // Check if leave type exists in config
  if (!LEAVE_TYPE_CONFIG[leaveType]) {
    throw new Error(`Invalid leave type: ${leaveType}`);
  }

  // Get the correct balance key for this leave type
  const balanceKey = getBalanceKeyFromLeaveType(leaveType);
  if (!balanceKey || !leaveBalance[balanceKey]) {
    throw new Error(`Invalid leave type configuration for: ${leaveType}`);
  }

  const leaveBalanceField = leaveBalance[balanceKey];

  // Check if leave type is available (not exhausted for the year)
  // Using accrued < maxDays (accrued represents approved leave used)
  if (leaveBalanceField.accrued >= leaveBalanceField.maxDays) {
    throw new Error(`You have exhausted your ${leaveType} for this year`);
  }

  // Get available balance (balance field is the available days)
  const availableBalance = leaveBalanceField.balance;

  // Check if requested days exceed available balance
  if (totalDaysApplied > availableBalance) {
    throw new Error(
      `Requested ${totalDaysApplied} days exceeds available balance of ${availableBalance} days for ${leaveType}`
    );
  }

  return { leaveBalance, availableBalance, balanceKey };
};

// Update leave balances based on status change
const updateLeaveBalances = async (leaveId, newStatus, oldStatus) => {
  const leave = await Leave.findById(leaveId);
  if (!leave) return;

  const leaveBalance = await LeaveBalance.findOne({ user: leave.user });
  if (!leaveBalance) return;

  const balanceKey = getBalanceKeyFromLeaveType(leave.leaveType);
  if (!balanceKey || !leaveBalance[balanceKey]) return;

  const balance = leaveBalance[balanceKey];

  // Handle status transitions
  if (oldStatus === "draft" && newStatus === "pending") {
    // When moving from draft to pending, add to totalApplied
    balance.totalApplied += leave.totalDaysApplied;
    balance.balance =
      balance.maxDays - (balance.totalApplied + balance.accrued);
  } else if (oldStatus === "pending" && newStatus === "approved") {
    // When approved, move from totalApplied to accrued
    balance.totalApplied -= leave.totalDaysApplied;
    balance.accrued += leave.totalDaysApplied;
    balance.balance =
      balance.maxDays - (balance.totalApplied + balance.accrued);
    leave.amountAccruedLeave = leave.totalDaysApplied;
  } else if (oldStatus === "pending" && newStatus === "rejected") {
    // When rejected, remove from totalApplied
    balance.totalApplied -= leave.totalDaysApplied;
    balance.balance =
      balance.maxDays - (balance.totalApplied + balance.accrued);
  } else if (oldStatus === "approved" && newStatus === "rejected") {
    // If approved gets rejected, move back from accrued to available
    balance.accrued -= leave.totalDaysApplied;
    balance.balance =
      balance.maxDays - (balance.totalApplied + balance.accrued);
    leave.amountAccruedLeave = 0;
  } else if (oldStatus === "approved" && newStatus === "pending") {
    // If approved gets sent back to pending, move from accrued back to totalApplied
    balance.accrued -= leave.totalDaysApplied;
    balance.totalApplied += leave.totalDaysApplied;
    balance.balance =
      balance.maxDays - (balance.totalApplied + balance.accrued);
    leave.amountAccruedLeave = 0;
  }

  await leaveBalance.save();
  await leave.save();
};

// Get leave statistics
const getLeaveStats = async (currentUser) => {
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
      baseMatch.user = currentUser._id;
      break;
  }

  const stats = await Leave.aggregate([
    { $match: baseMatch },
    {
      $facet: {
        totalRequests: [{ $count: "count" }],
        totalApprovedRequests: [
          { $match: { status: "approved" } },
          { $count: "count" },
        ],
        totalPendingRequests: [
          { $match: { status: "pending" } },
          { $count: "count" },
        ],
        totalReviewedRequests: [
          { $match: { status: "reviewed" } },
          { $count: "count" },
        ],
        totalRejectedRequests: [
          { $match: { status: "rejected" } },
          { $count: "count" },
        ],
        totalDaysApproved: [
          { $match: { status: "approved" } },
          { $group: { _id: null, total: { $sum: "$totalDaysApplied" } } },
        ],
      },
    },
  ]);

  return {
    totalRequests: stats[0].totalRequests[0]?.count || 0,
    totalApprovedRequests: stats[0].totalApprovedRequests[0]?.count || 0,
    totalPendingRequests: stats[0].totalPendingRequests[0]?.count || 0,
    totalReviewedRequests: stats[0].totalReviewedRequests[0]?.count || 0,
    totalRejectedRequests: stats[0].totalRejectedRequests[0]?.count || 0,
    totalDaysApproved: stats[0].totalDaysApproved[0]?.total || 0,
  };
};

// Get user's leave balance
const getUserLeaveBalance = async (userId) => {
  const leaveBalance = await getOrCreateLeaveBalance(userId);
  return leaveBalance;
};

// Get all leaves
const getAllLeaves = async (queryParams, currentUser) => {
  const { search, sort, page = 1, limit = Infinity } = queryParams;

  const searchFields = searchConfig.leave || [
    "staff_name",
    "leaveNumber",
    "leaveType",
    "status",
  ];

  const searchTerms = search ? search.trim().split(/\s+/) : [];
  const query = buildQuery(searchTerms, searchFields);

  switch (currentUser.role) {
    case "STAFF":
      query.$or = [{ user: currentUser._id }, { copiedTo: currentUser._id }];
      break;

    case "ADMIN":
      query.$or = [
        { user: currentUser._id },
        { reviewedBy: currentUser._id },
        { approvedBy: currentUser._id },
        { copiedTo: currentUser._id },
      ];
      break;

    case "REVIEWER":
      query.$or = [
        { user: currentUser._id },
        { reviewedBy: currentUser._id },
        { copiedTo: currentUser._id },
      ];
      break;

    case "SUPER-ADMIN":
      query.$or = [
        { status: { $ne: "draft" } },
        { user: currentUser._id, status: "draft" },
        { reviewedBy: currentUser._id },
        { copiedTo: currentUser._id },
      ];
      break;

    default:
      throw new Error("Invalid user role");
  }

  const sortQuery = buildSortQuery(sort);

  const populateOptions = [
    { path: "user", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  const {
    results: leaves,
    total,
    totalPages,
    currentPage,
  } = await paginate(Leave, query, { page, limit }, sortQuery, populateOptions);

  // Filter out deleted comments
  const processedLeaves = leaves.map((leave) => {
    if (leave.comments) {
      leave.comments = leave.comments.filter((comment) => !comment.deleted);
    }
    return leave;
  });

  // Fetch associated files for each leave
  const leavesWithFiles = await Promise.all(
    processedLeaves.map(async (leave) => {
      if (!leave || !leave._id) {
        console.warn("Invalid leave encountered:", leave);
        return null;
      }

      const files = await fileService.getFilesByDocument("Leaves", leave._id);
      return {
        ...leave.toJSON(),
        files,
      };
    })
  );

  const filteredLeaves = leavesWithFiles.filter(Boolean);

  return {
    leaves: filteredLeaves,
    totalLeaves: total,
    totalPages,
    currentPage,
  };
};

// Create leave application
const createLeaveApplication = async (currentUser, leaveData, files = []) => {
  // Map frontend field names to backend field names
  const mappedData = mapFormFieldsToBackend(leaveData);

  // Validate reviewedBy is provided
  if (!mappedData.reviewedBy) {
    throw new Error("ReviewedBy field is required for submission.");
  }

  // Validate leave type
  if (!LEAVE_TYPE_CONFIG[mappedData.leaveType]) {
    throw new Error("Invalid leave type");
  }

  // Calculate total days
  const config = LEAVE_TYPE_CONFIG[mappedData.leaveType];
  const totalDays = calculateDaysBetween(
    mappedData.startDate,
    mappedData.endDate,
    config.isCalendarDays
  );

  // Validate against user's leave balance
  const { availableBalance } = await validateLeaveApplication(
    currentUser._id,
    mappedData.leaveType,
    totalDays
  );

  // Get leave balance for snapshot
  const leaveBalance = await LeaveBalance.findOne({ user: currentUser._id });

  // Prepare leave data with all required fields
  const leave = new Leave({
    ...mappedData,
    user: currentUser._id,
    staff_name: `${currentUser.first_name} ${currentUser.last_name}`,
    staff_role: currentUser.role,
    totalDaysApplied: totalDays,
    leaveBalanceAtApplication: availableBalance,
    leaveTypeConfig: {
      maxDays: config.maxDays,
      description: config.description,
      isCalendarDays: config.isCalendarDays,
    },
    status: "pending",
  });

  await leave.save();

  // Update leave balances (add to totalApplied)
  await updateLeaveBalances(leave._id, "pending", "draft");

  // Handle file uploads if any
  if (files.length > 0) {
    await fileService.handleFileUploads({
      files,
      requestId: leave._id,
      modelTable: "Leaves",
    });
  }

  // Send notification to reviewers
  await notify.notifyReviewers({
    request: leave,
    currentUser: currentUser,
    requestType: "leave",
    title: "Leave Application",
    header: "You have been assigned a leave application to review",
  });

  return leave;
};

// Save leave as draft
const saveLeaveDraft = async (currentUser, leaveData) => {
  // Map frontend field names to backend field names
  const mappedData = mapFormFieldsToBackend(leaveData);

  // Prepare draft data - only include fields that are provided
  const draftData = {
    user: currentUser._id,
    staff_name: `${currentUser.first_name} ${currentUser.last_name}`,
    staff_role: currentUser.role,
    status: "draft",
  };

  // Only add fields if they exist in mappedData
  if (mappedData.leaveType) draftData.leaveType = mappedData.leaveType;
  if (mappedData.startDate) draftData.startDate = mappedData.startDate;
  if (mappedData.endDate) draftData.endDate = mappedData.endDate;
  if (mappedData.reasonForLeave)
    draftData.reasonForLeave = mappedData.reasonForLeave;
  if (mappedData.contactDuringLeave)
    draftData.contactDuringLeave = mappedData.contactDuringLeave;
  if (mappedData.reviewedBy) draftData.reviewedBy = mappedData.reviewedBy;
  if (mappedData.leaveCover) draftData.leaveCover = mappedData.leaveCover;

  // Calculate total days if all required fields are present
  let totalDays = 0;
  if (draftData.startDate && draftData.endDate && draftData.leaveType) {
    const config = LEAVE_TYPE_CONFIG[draftData.leaveType];
    if (config) {
      totalDays = calculateDaysBetween(
        draftData.startDate,
        draftData.endDate,
        config.isCalendarDays
      );
      draftData.totalDaysApplied = totalDays;

      // Add leave type config if leave type is selected
      draftData.leaveTypeConfig = {
        maxDays: config.maxDays,
        description: config.description,
        isCalendarDays: config.isCalendarDays,
      };
    }
  }

  // For drafts, we don't need leaveBalanceAtApplication yet
  // Set a default value of 0 to pass validation
  draftData.leaveBalanceAtApplication = 0;

  const leave = new Leave(draftData);
  await leave.save();
  return leave;
};

// Get leave by ID
const getLeaveById = async (id) => {
  const populateOptions = [
    { path: "user", select: "email first_name last_name role" },
    { path: "reviewedBy", select: "email first_name last_name role" },
    { path: "approvedBy", select: "email first_name last_name role" },
    { path: "comments.user", select: "email first_name last_name role" },
    { path: "copiedTo", select: "email first_name last_name role" },
  ];

  const leave = await Leave.findById(id).populate(populateOptions).lean();

  if (!leave) {
    throw new Error("Leave application not found");
  }

  // Filter out deleted comments
  if (leave.comments) {
    leave.comments = leave.comments.filter((comment) => !comment.deleted);
  }

  // Fetch associated files
  const files = await fileService.getFilesByDocument("Leaves", id);

  return normalizeId({
    ...leave,
    files: normalizeFiles(files),
  });
};

// Update leave application
const updateLeaveApplication = async (
  id,
  updateData,
  files = [],
  currentUser
) => {
  // Map frontend field names to backend field names
  const mappedData = mapFormFieldsToBackend(updateData);

  const leave = await Leave.findById(id);

  if (!leave) {
    throw new Error("Leave application not found");
  }

  // Don't allow updates if not in draft or pending
  if (!["draft", "pending"].includes(leave.status)) {
    throw new Error(`Cannot update leave in ${leave.status} status`);
  }

  // If leave type or dates are being updated, recalculate total days
  if (mappedData.leaveType || mappedData.startDate || mappedData.endDate) {
    const leaveType = mappedData.leaveType || leave.leaveType;
    const startDate = mappedData.startDate || leave.startDate;
    const endDate = mappedData.endDate || leave.endDate;

    if (leaveType && startDate && endDate) {
      const config = LEAVE_TYPE_CONFIG[leaveType];
      const newTotalDays = calculateDaysBetween(
        startDate,
        endDate,
        config.isCalendarDays
      );

      mappedData.totalDaysApplied = newTotalDays;

      // Validate new total against balance if not in draft
      if (leave.status === "pending") {
        await validateLeaveApplication(leave.user, leaveType, newTotalDays);
      }
    }
  }

  Object.assign(leave, mappedData);
  await leave.save();

  // Handle file uploads if any
  if (files.length > 0) {
    await fileService.handleFileUploads({
      files,
      requestId: leave._id,
      modelTable: "Leaves",
    });
  }

  // Send notification if status changes to reviewed
  if (leave.status === "reviewed") {
    notify.notifyApprovers({
      request: leave,
      currentUser: currentUser,
      requestType: "leave",
      title: "Leave Application",
      header: "A leave application has been reviewed and needs your approval",
    });
  }

  return leave;
};

// Update leave status (review/approve/reject)
const updateLeaveStatus = async (id, data, currentUser) => {
  const leave = await Leave.findById(id);

  if (!leave) {
    throw new Error("Leave application not found");
  }

  const oldStatus = leave.status;

  // Use the status update service (similar to concept note)
  const updatedLeave = await statusUpdateService.updateRequestStatusWithComment(
    {
      Model: Leave,
      id,
      data,
      currentUser,
      requestType: "leave",
      title: "Leave Application",
    }
  );

  // Update leave balances based on status change
  await updateLeaveBalances(id, updatedLeave.status, oldStatus);

  return updatedLeave;
};

// Delete leave (soft delete)
const deleteLeave = async (id) => {
  await fileService.deleteFilesByDocument("Leaves", id);

  const leave = await Leave.findByIdAndUpdate(
    id,
    { isDeleted: true },
    { new: true }
  );

  if (!leave) {
    throw new Error("Leave application not found");
  }

  return leave;
};

// Copy leave to other users
const copyLeave = async ({ currentUser, requestId, recipients }) => {
  return await LeaveCopyService.copyDocument({
    currentUser,
    requestId,
    requestType: "leave",
    requestTitle: "Leave Application",
    recipients,
  });
};

// Comment functions (similar to concept note)
const addComment = async (id, currentUser, text) => {
  const leave = await Leave.findById(id);
  const userId = currentUser._id;

  if (!leave) {
    throw new Error("Leave application not found");
  }

  const canComment =
    leave.user.toString() === userId.toString() ||
    leave.copiedTo.some(
      (copiedUserId) => copiedUserId.toString() === userId.toString()
    ) ||
    (leave.reviewedBy && leave.reviewedBy.toString() === userId.toString()) ||
    (leave.approvedBy && leave.approvedBy.toString() === userId.toString()) ||
    currentUser.role === "SUPER-ADMIN";

  if (!canComment) {
    throw new Error(
      "You don't have permission to comment on this leave application"
    );
  }

  const newComment = {
    user: userId,
    text: text.trim(),
    edited: false,
    deleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  leave.comments.unshift(newComment);
  await leave.save();

  const populatedLeave = await Leave.findById(id)
    .populate("comments.user", "email first_name last_name role")
    .lean();

  const populatedComments = populatedLeave.comments.filter(
    (comment) => !comment.deleted
  );

  const addedComment = populatedComments.find(
    (comment) =>
      comment.user._id.toString() === userId.toString() &&
      comment.text === text.trim() &&
      comment.createdAt.toString() === newComment.createdAt.toString()
  );

  return addedComment;
};

const updateComment = async (id, commentId, userId, text) => {
  const leave = await Leave.findById(id);

  if (!leave) {
    throw new Error("Leave application not found");
  }

  const comment = leave.comments.id(commentId);

  if (!comment) {
    throw new Error("Comment not found");
  }

  if (comment.user.toString() !== userId.toString()) {
    throw new Error("You can only edit your own comments");
  }

  comment.text = text.trim();
  comment.edited = true;
  comment.updatedAt = new Date();

  await leave.save();

  const populatedLeave = await Leave.findById(id)
    .populate("comments.user", "email first_name last_name role")
    .lean();

  const updatedComment = populatedLeave.comments.find(
    (c) => c._id.toString() === commentId.toString()
  );

  return updatedComment;
};

const deleteComment = async (id, commentId, userId) => {
  const leave = await Leave.findById(id);

  if (!leave) {
    throw new Error("Leave application not found");
  }

  const comment = leave.comments.id(commentId);

  if (!comment) {
    throw new Error("Comment not found");
  }

  const isOwner = comment.user.toString() === userId.toString();
  if (!isOwner) {
    throw new Error("You don't have permission to delete this comment");
  }

  comment.deleted = true;
  comment.updatedAt = new Date();

  await leave.save();

  return { success: true, message: "Comment deleted successfully" };
};

module.exports = {
  LeaveCopyService,
  getLeaveStats,
  getUserLeaveBalance,
  getAllLeaves,
  getLeaveById,
  createLeaveApplication,
  saveLeaveDraft,
  updateLeaveApplication,
  updateLeaveStatus,
  deleteLeave,
  copyLeave,
  addComment,
  updateComment,
  deleteComment,
  LEAVE_TYPE_CONFIG,
};
