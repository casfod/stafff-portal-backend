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

// Logger utility
const logger = {
  info: (message, data = {}) => {
    console.log(`[INFO] ${message}`, Object.keys(data).length ? data : "");
  },
  error: (message, error = {}) => {
    console.error(`[ERROR] ${message}`, error.message || error);
  },
  debug: (message, data = {}) => {
    if (process.env.NODE_ENV === "development") {
      console.log(`[DEBUG] ${message}`, Object.keys(data).length ? data : "");
    }
  },
};

// Map form fields from frontend to backend
const mapFormFieldsToBackend = (data) => {
  const mappedData = { ...data };

  if (data.reviewedById !== undefined) {
    mappedData.reviewedBy = data.reviewedById;
    delete mappedData.reviewedById;
  }

  if (data.approvedById !== undefined) {
    mappedData.approvedBy = data.approvedById;
    delete mappedData.approvedById;
  }

  return mappedData;
};

// Copy service class
class CopyService extends BaseCopyService {
  constructor() {
    super(Leave, "Leave");
  }
}

const LeaveCopyService = new CopyService();

// Calculate days between dates
const calculateDaysBetween = (startDate, endDate, isCalendarDays = false) => {
  try {
    const start = new Date(startDate);
    const end = new Date(endDate);

    if (isNaN(start) || isNaN(end)) {
      throw new Error("Invalid date format");
    }

    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;

    if (isCalendarDays) {
      return diffDays;
    }

    // Calculate working days (Monday-Friday)
    let workingDays = 0;
    const currentDate = new Date(start);

    while (currentDate <= end) {
      const dayOfWeek = currentDate.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDays++;
      }
      currentDate.setDate(currentDate.getDate() + 1);
    }

    return workingDays;
  } catch (error) {
    logger.error("Error calculating days between dates", error);
    throw new Error(`Failed to calculate days: ${error.message}`);
  }
};

// Get or create leave balance
const getOrCreateLeaveBalance = async (userId) => {
  try {
    let leaveBalance = await LeaveBalance.findOne({ user: userId });

    if (!leaveBalance) {
      logger.info(`Creating new leave balance for user: ${userId}`);
      leaveBalance = new LeaveBalance({ user: userId });
      await leaveBalance.save();
    } else {
      // Check and reset for new year if needed
      const needsReset = leaveBalance.resetForNewYear();
      if (needsReset) {
        logger.info(`Resetting leave balance for user: ${userId} for new year`);
        await leaveBalance.save();
      }
    }

    return leaveBalance;
  } catch (error) {
    logger.error("Error getting/creating leave balance", error);
    throw new Error(`Failed to get leave balance: ${error.message}`);
  }
};

// Get balance key from leave type
const getBalanceKeyFromLeaveType = (leaveType) => {
  const config = LEAVE_TYPE_CONFIG[leaveType];
  if (!config) {
    logger.error(`Invalid leave type: ${leaveType}`);
    return null;
  }
  return config.balanceKey;
};

// Validate leave application against balance
const validateLeaveApplication = async (
  userId,
  leaveType,
  totalDaysApplied
) => {
  try {
    const leaveBalance = await getOrCreateLeaveBalance(userId);

    if (!LEAVE_TYPE_CONFIG[leaveType]) {
      throw new Error(`Invalid leave type: ${leaveType}`);
    }

    const balanceKey = getBalanceKeyFromLeaveType(leaveType);
    if (!balanceKey || !leaveBalance[balanceKey]) {
      throw new Error(`Invalid leave type configuration for: ${leaveType}`);
    }

    const leaveBalanceField = leaveBalance[balanceKey];

    // Check if leave type is exhausted
    if (leaveBalanceField.accrued >= leaveBalanceField.maxDays) {
      throw new Error(
        `You have exhausted your ${leaveType} for this year (Used: ${leaveBalanceField.accrued}/${leaveBalanceField.maxDays} days)`
      );
    }

    // Get available balance
    const availableBalance = leaveBalanceField.balance;

    // Check if requested days exceed available balance
    if (totalDaysApplied > availableBalance) {
      throw new Error(
        `Requested ${totalDaysApplied} days exceeds available balance of ${availableBalance} days for ${leaveType}`
      );
    }

    logger.debug("Leave validation successful", {
      userId,
      leaveType,
      totalDaysApplied,
      availableBalance,
      accrued: leaveBalanceField.accrued,
      maxDays: leaveBalanceField.maxDays,
    });

    return { leaveBalance, availableBalance, balanceKey };
  } catch (error) {
    logger.error("Leave validation failed", error);
    throw error;
  }
};

// Update leave balances based on status change
const updateLeaveBalances = async (leaveId, newStatus, oldStatus) => {
  try {
    const leave = await Leave.findById(leaveId);
    if (!leave) {
      logger.error(`Leave not found for balance update: ${leaveId}`);
      return;
    }

    const leaveBalance = await LeaveBalance.findOne({ user: leave.user });
    if (!leaveBalance) {
      logger.error(`Leave balance not found for user: ${leave.user}`);
      return;
    }

    const balanceKey = getBalanceKeyFromLeaveType(leave.leaveType);
    if (!balanceKey || !leaveBalance[balanceKey]) {
      logger.error(`Invalid balance key for leave type: ${leave.leaveType}`);
      return;
    }

    const balance = leaveBalance[balanceKey];
    const daysApplied = leave.totalDaysApplied;

    logger.info(
      `Balance update: ${
        oldStatus || "NEW"
      } -> ${newStatus} for leave ${leaveId}`,
      {
        leaveType: leave.leaveType,
        daysApplied,
        currentBalance: { ...(balance.toObject?.() || balance) },
      }
    );

    // Handle status transitions
    if (!oldStatus && newStatus === "pending") {
      // New leave created as pending
      logger.info(`New pending leave - reserving ${daysApplied} days`);
      balance.totalApplied += daysApplied;
    } else {
      // Existing leave status change
      switch (oldStatus) {
        case "draft":
          if (newStatus === "pending") {
            logger.info(`Draft submitted - reserving ${daysApplied} days`);
            balance.totalApplied += daysApplied;
          }
          // Draft to any other status should not happen, but if it does, no change
          break;

        case "pending":
          if (newStatus === "approved") {
            logger.info(
              `Pending approved - moving ${daysApplied} from reserved to used`
            );
            balance.totalApplied -= daysApplied;
            balance.accrued += daysApplied;
            leave.amountAccruedLeave = daysApplied;
          } else if (newStatus === "rejected") {
            logger.info(
              `Pending rejected - releasing ${daysApplied} reserved days`
            );
            balance.totalApplied -= daysApplied;
          } else if (newStatus === "reviewed") {
            logger.info(
              `Pending reviewed - keeping ${daysApplied} days reserved`
            );
            // No change
          } else if (newStatus === "draft") {
            logger.info(
              `Pending moved back to draft - releasing ${daysApplied} reserved days`
            );
            balance.totalApplied -= daysApplied;
          }
          break;

        case "reviewed":
          if (newStatus === "approved") {
            logger.info(
              `Reviewed approved - moving ${daysApplied} from reserved to used`
            );
            balance.totalApplied -= daysApplied;
            balance.accrued += daysApplied;
            leave.amountAccruedLeave = daysApplied;
          } else if (newStatus === "rejected") {
            logger.info(
              `Reviewed rejected - releasing ${daysApplied} reserved days`
            );
            balance.totalApplied -= daysApplied;
          } else if (newStatus === "pending") {
            logger.info(
              `Reviewed moved back to pending - keeping ${daysApplied} days reserved`
            );
            // No change
          } else if (newStatus === "draft") {
            logger.info(
              `Reviewed moved to draft - releasing ${daysApplied} reserved days`
            );
            balance.totalApplied -= daysApplied;
          }
          break;

        case "approved":
          if (newStatus === "rejected") {
            logger.info(
              `Approved rejected - removing ${daysApplied} from used days`
            );
            balance.accrued -= daysApplied;
            leave.amountAccruedLeave = 0;
          } else if (newStatus === "pending" || newStatus === "reviewed") {
            logger.info(
              `Approved moved back - moving ${daysApplied} from used to reserved`
            );
            balance.accrued -= daysApplied;
            balance.totalApplied += daysApplied;
            leave.amountAccruedLeave = 0;
          } else if (newStatus === "draft") {
            logger.info(
              `Approved moved to draft - removing ${daysApplied} from used days`
            );
            balance.accrued -= daysApplied;
            leave.amountAccruedLeave = 0;
          }
          break;

        case "rejected":
          if (newStatus === "pending" || newStatus === "reviewed") {
            logger.info(`Rejected reactivated - reserving ${daysApplied} days`);
            balance.totalApplied += daysApplied;
          } else if (newStatus === "approved") {
            logger.warn(
              `Direct rejected to approved transition - adding ${daysApplied} to used days`
            );
            balance.accrued += daysApplied;
            leave.amountAccruedLeave = daysApplied;
          }
          break;
      }
    }

    // Recalculate balance
    const previousBalance = balance.balance;
    balance.balance =
      balance.maxDays - (balance.totalApplied + balance.accrued);

    // Validate balance never goes negative
    if (balance.balance < 0) {
      logger.error(`Negative balance detected for ${balanceKey}`, {
        maxDays: balance.maxDays,
        totalApplied: balance.totalApplied,
        accrued: balance.accrued,
        balance: balance.balance,
        leaveId,
      });

      // Option: Set to 0 to prevent negative balances
      // balance.balance = 0;

      // Option: Throw error to prevent invalid state
      throw new Error(`Balance would become negative for ${leave.leaveType}`);
    }

    logger.debug(`Balance updated for ${balanceKey}`, {
      previousBalance,
      newBalance: balance.balance,
      totalApplied: balance.totalApplied,
      accrued: balance.accrued,
    });

    await leaveBalance.save();
    await leave.save();

    return { leave, leaveBalance };
  } catch (error) {
    logger.error("Error updating leave balances", error);
    throw error;
  }
};

// Get leave statistics
const getLeaveStats = async (currentUser) => {
  try {
    if (!currentUser?._id) {
      throw new Error("Invalid user information");
    }

    const baseMatch = {
      status: { $ne: "draft" },
    };

    switch (currentUser.role) {
      case "SUPER-ADMIN":
        // SUPER-ADMIN sees all non-draft leaves
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
  } catch (error) {
    logger.error("Error getting leave stats", error);
    throw error;
  }
};

// Get user's leave balance
const getUserLeaveBalance = async (userId) => {
  try {
    const leaveBalance = await getOrCreateLeaveBalance(userId);
    return leaveBalance;
  } catch (error) {
    logger.error("Error getting user leave balance", error);
    throw error;
  }
};

// Get all leaves with filtering and pagination
const getAllLeaves = async (queryParams, currentUser) => {
  try {
    const { search, sort, page = 1, limit = Infinity } = queryParams;

    const searchFields = searchConfig.leave || [
      "staff_name",
      "leaveNumber",
      "leaveType",
      "status",
    ];

    const searchTerms = search ? search.trim().split(/\s+/) : [];
    const query = buildQuery(searchTerms, searchFields);

    // Apply role-based access control
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
    } = await paginate(
      Leave,
      query,
      { page, limit },
      sortQuery,
      populateOptions
    );

    // Filter out deleted comments
    const processedLeaves = leaves.map((leave) => {
      if (leave.comments) {
        leave.comments = leave.comments.filter((comment) => !comment.deleted);
      }
      return leave;
    });

    // Fetch associated files
    const leavesWithFiles = await Promise.all(
      processedLeaves.map(async (leave) => {
        if (!leave || !leave._id) {
          logger.warn("Invalid leave encountered:", leave);
          return null;
        }

        const files = await fileService.getFilesByDocument("Leaves", leave._id);
        return {
          ...leave.toJSON(),
          files: normalizeFiles(files),
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
  } catch (error) {
    logger.error("Error getting all leaves", error);
    throw error;
  }
};

// Create leave application (submitted, not draft)
const createLeaveApplication = async (currentUser, leaveData, files = []) => {
  try {
    // Map frontend field names
    const mappedData = mapFormFieldsToBackend(leaveData);

    // Validate required fields
    if (!mappedData.reviewedBy) {
      throw new Error("ReviewedBy field is required for submission.");
    }

    if (!mappedData.leaveType || !LEAVE_TYPE_CONFIG[mappedData.leaveType]) {
      throw new Error("Invalid leave type");
    }

    // Calculate total days
    const config = LEAVE_TYPE_CONFIG[mappedData.leaveType];
    const totalDays = calculateDaysBetween(
      mappedData.startDate,
      mappedData.endDate,
      config.isCalendarDays
    );

    // Validate against leave balance
    const { availableBalance } = await validateLeaveApplication(
      currentUser._id,
      mappedData.leaveType,
      totalDays
    );

    // Get leave balance for snapshot
    const leaveBalance = await LeaveBalance.findOne({ user: currentUser._id });

    // Create leave
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

    // Update leave balances (reserve days)
    await updateLeaveBalances(leave._id, "pending", null);

    // Handle file uploads
    if (files.length > 0) {
      await fileService.handleFileUploads({
        files,
        requestId: leave._id,
        modelTable: "Leaves",
      });
    }

    // Send notifications
    await notify.notifyReviewers({
      request: leave,
      currentUser: currentUser,
      requestType: "leave",
      title: "Leave Application",
      header: "You have been assigned a leave application to review",
    });

    logger.info(`Leave application created: ${leave.leaveNumber}`);
    return leave;
  } catch (error) {
    logger.error("Error creating leave application", error);
    throw error;
  }
};

// Save leave as draft (no balance impact)
const saveLeaveDraft = async (currentUser, leaveData) => {
  try {
    const mappedData = mapFormFieldsToBackend(leaveData);

    // Prepare draft data
    const draftData = {
      user: currentUser._id,
      staff_name: `${currentUser.first_name} ${currentUser.last_name}`,
      staff_role: currentUser.role,
      status: "draft",
      leaveBalanceAtApplication: 0, // Default for drafts
    };

    // Only add fields that are provided
    const optionalFields = [
      "leaveType",
      "startDate",
      "endDate",
      "reasonForLeave",
      "contactDuringLeave",
      "reviewedBy",
      "leaveCover",
    ];

    optionalFields.forEach((field) => {
      if (mappedData[field] !== undefined) {
        draftData[field] = mappedData[field];
      }
    });

    // Calculate total days for display if possible
    if (draftData.startDate && draftData.endDate && draftData.leaveType) {
      const config = LEAVE_TYPE_CONFIG[draftData.leaveType];
      if (config) {
        draftData.totalDaysApplied = calculateDaysBetween(
          draftData.startDate,
          draftData.endDate,
          config.isCalendarDays
        );

        draftData.leaveTypeConfig = {
          maxDays: config.maxDays,
          description: config.description,
          isCalendarDays: config.isCalendarDays,
        };
      }
    }

    const leave = new Leave(draftData);
    await leave.save();

    logger.info(`Leave draft saved: ${leave.leaveNumber || leave._id}`);
    return leave;
  } catch (error) {
    logger.error("Error saving leave draft", error);
    throw error;
  }
};

// Submit a draft (convert to pending)
const submitDraft = async (draftId, currentUser) => {
  try {
    const draft = await Leave.findById(draftId);

    if (!draft) {
      throw new Error("Draft not found");
    }

    if (draft.status !== "draft") {
      throw new Error("This is not a draft");
    }

    if (draft.user.toString() !== currentUser._id.toString()) {
      throw new Error("You can only submit your own drafts");
    }

    // Check required fields
    const requiredFields = [
      "leaveType",
      "startDate",
      "endDate",
      "reasonForLeave",
      "reviewedBy",
    ];
    const missingFields = requiredFields.filter((field) => !draft[field]);

    if (missingFields.length > 0) {
      throw new Error(
        `Cannot submit draft. Missing: ${missingFields.join(", ")}`
      );
    }

    // Validate against leave balance
    if (draft.leaveType && draft.totalDaysApplied) {
      await validateLeaveApplication(
        draft.user,
        draft.leaveType,
        draft.totalDaysApplied
      );
    }

    // Update status
    draft.status = "pending";
    await draft.save();

    // Reserve days
    await updateLeaveBalances(draftId, "pending", "draft");

    // Send notifications
    await notify.notifyReviewers({
      request: draft,
      currentUser: currentUser,
      requestType: "leave",
      title: "Leave Application",
      header: "You have been assigned a leave application to review",
    });

    logger.info(`Draft submitted: ${draft.leaveNumber}`);
    return draft;
  } catch (error) {
    logger.error("Error submitting draft", error);
    throw error;
  }
};

// Get leave by ID
const getLeaveById = async (id) => {
  try {
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
  } catch (error) {
    logger.error("Error getting leave by ID", error);
    throw error;
  }
};

// Update leave application
const updateLeaveApplication = async (
  id,
  updateData,
  files = [],
  currentUser
) => {
  try {
    const mappedData = mapFormFieldsToBackend(updateData);
    const leave = await Leave.findById(id);

    if (!leave) {
      throw new Error("Leave application not found");
    }

    // Check if update is allowed
    if (!["draft", "pending", "reviewed"].includes(leave.status)) {
      throw new Error(`Cannot update leave in ${leave.status} status`);
    }

    // Check permissions
    const canUpdate =
      leave.user.toString() === currentUser._id.toString() ||
      currentUser.role === "SUPER-ADMIN" ||
      (leave.status === "pending" &&
        leave.reviewedBy?.toString() === currentUser._id.toString()) ||
      (leave.status === "reviewed" &&
        leave.approvedBy?.toString() === currentUser._id.toString());

    if (!canUpdate) {
      throw new Error("You don't have permission to update this leave");
    }

    // Recalculate days if dates or type changed
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

        // Validate against balance if not draft
        if (leave.status !== "draft") {
          const oldDays = leave.totalDaysApplied;
          const dayDifference = newTotalDays - oldDays;

          if (dayDifference > 0) {
            // Requesting more days - validate
            await validateLeaveApplication(
              leave.user,
              leaveType,
              dayDifference
            );
          }
          // Note: If requesting fewer days, no validation needed
        }
      }
    }

    // Store old status for notification
    const oldStatus = leave.status;

    // Update leave
    Object.assign(leave, mappedData);
    await leave.save();

    // Handle file uploads
    if (files.length > 0) {
      await fileService.handleFileUploads({
        files,
        requestId: leave._id,
        modelTable: "Leaves",
      });
    }

    // Send notification if status changed to reviewed
    if (oldStatus !== "reviewed" && leave.status === "reviewed") {
      await notify.notifyApprovers({
        request: leave,
        currentUser: currentUser,
        requestType: "leave",
        title: "Leave Application",
        header: "A leave application has been reviewed and needs your approval",
      });
    }

    logger.info(`Leave application updated: ${leave.leaveNumber}`);
    return leave;
  } catch (error) {
    logger.error("Error updating leave application", error);
    throw error;
  }
};

// Update leave status (review/approve/reject)
const updateLeaveStatus = async (id, data, currentUser) => {
  try {
    const leave = await Leave.findById(id);

    if (!leave) {
      throw new Error("Leave application not found");
    }

    const oldStatus = leave.status;

    // Use status update service
    const updatedLeave =
      await statusUpdateService.updateRequestStatusWithComment({
        Model: Leave,
        id,
        data,
        currentUser,
        requestType: "leave",
        title: "Leave Application",
      });

    // Update balances
    await updateLeaveBalances(id, updatedLeave.status, oldStatus);

    logger.info(
      `Leave status updated: ${oldStatus} -> ${updatedLeave.status} for ${updatedLeave.leaveNumber}`
    );
    return updatedLeave;
  } catch (error) {
    logger.error("Error updating leave status", error);
    throw error;
  }
};

// Delete leave (soft delete)
const deleteLeave = async (id) => {
  try {
    const leave = await Leave.findById(id);

    if (!leave) {
      throw new Error("Leave application not found");
    }

    // If leave is pending or reviewed, release reserved days
    if (leave.status === "pending" || leave.status === "reviewed") {
      await updateLeaveBalances(id, "deleted", leave.status);
    }

    // If leave is approved, we need to handle that too
    if (leave.status === "approved") {
      await updateLeaveBalances(id, "deleted", leave.status);
    }

    // Soft delete files
    await fileService.deleteFilesByDocument("Leaves", id);

    // Soft delete the leave
    leave.isDeleted = true;
    leave.status = "deleted";
    await leave.save();

    logger.info(`Leave application deleted: ${leave.leaveNumber}`);
    return leave;
  } catch (error) {
    logger.error("Error deleting leave", error);
    throw error;
  }
};

// Copy leave to other users
const copyLeave = async ({ currentUser, requestId, recipients }) => {
  try {
    const result = await LeaveCopyService.copyDocument({
      currentUser,
      requestId,
      requestType: "leave",
      requestTitle: "Leave Application",
      recipients,
    });

    logger.info(`Leave copied: ${requestId} to ${recipients.length} users`);
    return result;
  } catch (error) {
    logger.error("Error copying leave", error);
    throw error;
  }
};

// Add comment
const addComment = async (id, currentUser, text) => {
  try {
    const leave = await Leave.findById(id);
    const userId = currentUser._id;

    if (!leave) {
      throw new Error("Leave application not found");
    }

    // Check permissions
    const canComment =
      leave.user.toString() === userId.toString() ||
      leave.copiedTo?.some(
        (copiedId) => copiedId.toString() === userId.toString()
      ) ||
      (leave.reviewedBy && leave.reviewedBy.toString() === userId.toString()) ||
      (leave.approvedBy && leave.approvedBy.toString() === userId.toString()) ||
      currentUser.role === "SUPER-ADMIN";

    if (!canComment) {
      throw new Error("You don't have permission to comment on this leave");
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

    // Populate and return the new comment
    const populatedLeave = await Leave.findById(id)
      .populate("comments.user", "email first_name last_name role")
      .lean();

    const populatedComments = populatedLeave.comments.filter((c) => !c.deleted);
    const addedComment = populatedComments.find(
      (c) =>
        c.user._id.toString() === userId.toString() &&
        c.text === text.trim() &&
        new Date(c.createdAt).getTime() === newComment.createdAt.getTime()
    );

    logger.info(`Comment added to leave ${id}`);
    return addedComment;
  } catch (error) {
    logger.error("Error adding comment", error);
    throw error;
  }
};

// Update comment
const updateComment = async (id, commentId, userId, text) => {
  try {
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

    // Return updated comment with populated user
    const populatedLeave = await Leave.findById(id)
      .populate("comments.user", "email first_name last_name role")
      .lean();

    const updatedComment = populatedLeave.comments.find(
      (c) => c._id.toString() === commentId.toString()
    );

    logger.info(`Comment updated on leave ${id}`);
    return updatedComment;
  } catch (error) {
    logger.error("Error updating comment", error);
    throw error;
  }
};

// Delete comment (soft delete)
const deleteComment = async (id, commentId, userId) => {
  try {
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

    logger.info(`Comment deleted from leave ${id}`);
    return { success: true, message: "Comment deleted successfully" };
  } catch (error) {
    logger.error("Error deleting comment", error);
    throw error;
  }
};

// Get leave balance history/transactions
const getLeaveBalanceHistory = async (userId, leaveType = null) => {
  try {
    const matchStage = { user: userId };
    if (leaveType) {
      matchStage.leaveType = leaveType;
    }

    const history = await Leave.aggregate([
      { $match: matchStage },
      { $sort: { createdAt: -1 } },
      {
        $project: {
          leaveNumber: 1,
          leaveType: 1,
          totalDaysApplied: 1,
          status: 1,
          createdAt: 1,
          amountAccruedLeave: 1,
          leaveBalanceAtApplication: 1,
        },
      },
    ]);

    return history;
  } catch (error) {
    logger.error("Error getting leave balance history", error);
    throw error;
  }
};

// Bulk validate multiple leave applications
const bulkValidateLeaveApplications = async (userId, applications) => {
  try {
    const leaveBalance = await getOrCreateLeaveBalance(userId);
    const validationResults = [];

    for (const app of applications) {
      try {
        const config = LEAVE_TYPE_CONFIG[app.leaveType];
        if (!config) {
          validationResults.push({
            ...app,
            valid: false,
            error: `Invalid leave type: ${app.leaveType}`,
          });
          continue;
        }

        const balanceKey = config.balanceKey;
        const balance = leaveBalance[balanceKey];

        const totalDays = calculateDaysBetween(
          app.startDate,
          app.endDate,
          config.isCalendarDays
        );

        const isValid = balance.balance >= totalDays;

        validationResults.push({
          ...app,
          totalDays,
          valid: isValid,
          availableBalance: balance.balance,
          error: isValid
            ? null
            : `Insufficient balance. Required: ${totalDays}, Available: ${balance.balance}`,
        });
      } catch (error) {
        validationResults.push({
          ...app,
          valid: false,
          error: error.message,
        });
      }
    }

    return validationResults;
  } catch (error) {
    logger.error("Error bulk validating leave applications", error);
    throw error;
  }
};

module.exports = {
  LeaveCopyService,
  getLeaveStats,
  getUserLeaveBalance,
  getAllLeaves,
  getLeaveById,
  createLeaveApplication,
  saveLeaveDraft,
  submitDraft,
  updateLeaveApplication,
  updateLeaveStatus,
  deleteLeave,
  copyLeave,
  addComment,
  updateComment,
  deleteComment,
  getLeaveBalanceHistory,
  bulkValidateLeaveApplications,
  validateLeaveApplication,
  LEAVE_TYPE_CONFIG,
  calculateDaysBetween,
};
