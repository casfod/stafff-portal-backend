// models/LeaveBalanceModel.js
const mongoose = require("mongoose");

const leaveBalanceSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },

    // Annual leave (24 days)
    annualLeave: {
      maxDays: { type: Number, default: 24 },
      totalApplied: { type: Number, default: 0 }, // Not approved yet
      accrued: { type: Number, default: 0 }, // Approved leave days used
      balance: { type: Number, default: 24 }, // Available days
      year: { type: Number, default: () => new Date().getFullYear() },
    },

    // Compassionate leave (10 days max)
    compassionateLeave: {
      maxDays: { type: Number, default: 10 },
      totalApplied: { type: Number, default: 0 },
      accrued: { type: Number, default: 0 },
      balance: { type: Number, default: 10 },
      year: { type: Number, default: () => new Date().getFullYear() },
    },

    // Sick leave (12 days)
    sickLeave: {
      maxDays: { type: Number, default: 12 },
      totalApplied: { type: Number, default: 0 },
      accrued: { type: Number, default: 0 },
      balance: { type: Number, default: 12 },
      year: { type: Number, default: () => new Date().getFullYear() },
    },

    // Maternity leave (90 working days)
    maternityLeave: {
      maxDays: { type: Number, default: 90 },
      totalApplied: { type: Number, default: 0 },
      accrued: { type: Number, default: 0 },
      balance: { type: Number, default: 90 },
      year: { type: Number, default: () => new Date().getFullYear() },
    },

    // Paternity leave (14 calendar days)
    paternityLeave: {
      maxDays: { type: Number, default: 14 },
      totalApplied: { type: Number, default: 0 },
      accrued: { type: Number, default: 0 },
      balance: { type: Number, default: 14 },
      year: { type: Number, default: () => new Date().getFullYear() },
    },

    // Emergency leave (5 days)
    emergencyLeave: {
      maxDays: { type: Number, default: 5 },
      totalApplied: { type: Number, default: 0 },
      accrued: { type: Number, default: 0 },
      balance: { type: Number, default: 5 },
      year: { type: Number, default: () => new Date().getFullYear() },
    },

    // Study Leave (10 working days)
    studyLeave: {
      maxDays: { type: Number, default: 10 },
      totalApplied: { type: Number, default: 0 },
      accrued: { type: Number, default: 0 },
      balance: { type: Number, default: 10 },
      year: { type: Number, default: () => new Date().getFullYear() },
    },

    // Leave without pay (Up to 1 year)
    leaveWithoutPay: {
      maxDays: { type: Number, default: 365 },
      totalApplied: { type: Number, default: 0 },
      accrued: { type: Number, default: 0 },
      balance: { type: Number, default: 365 },
      year: { type: Number, default: () => new Date().getFullYear() },
    },

    // Last reset year
    lastResetYear: { type: Number, default: () => new Date().getFullYear() },
  },
  {
    timestamps: true,
  }
);

// Method to check if leave type is available for the year
leaveBalanceSchema.methods.isLeaveTypeAvailable = function (leaveType) {
  const leave = this[leaveType];
  if (!leave) return false;

  // Check if leave type is not exhausted - using accrued < maxDays
  // accrued represents approved leave used
  return leave.accrued < leave.maxDays;
};

// Method to get available balance for a leave type
leaveBalanceSchema.methods.getAvailableBalance = function (leaveType) {
  const leave = this[leaveType];
  if (!leave) return 0;
  // Return the balance field which is the available days
  return leave.balance;
};

// Method to reset balances for new year (call this at beginning of year)
// leaveBalanceSchema.methods.resetForNewYear = function () {
//   const currentYear = new Date().getFullYear();

//   if (this.lastResetYear < currentYear) {
//     // Reset all leave types for new year
//     const leaveTypes = [
//       "annualLeave",
//       "compassionateLeave",
//       "sickLeave",
//       "maternityLeave",
//       "paternityLeave",
//       "emergencyLeave",
//       "studyLeave",
//       "leaveWithoutPay",
//     ];

//     leaveTypes.forEach((type) => {
//       if (this[type]) {
//         this[type].totalApplied = 0;
//         this[type].accrued = 0;
//         this[type].balance = this[type].maxDays;
//         this[type].year = currentYear;
//       }
//     });

//     this.lastResetYear = currentYear;
//   }
// };

// Optional improvement to resetForNewYear method
leaveBalanceSchema.methods.resetForNewYear = function () {
  const currentYear = new Date().getFullYear();

  if (this.lastResetYear < currentYear) {
    // Reset all leave types for new year
    const leaveTypes = [
      "annualLeave",
      "compassionateLeave",
      "sickLeave",
      "maternityLeave",
      "paternityLeave",
      "emergencyLeave",
      "studyLeave",
      "leaveWithoutPay",
    ];

    leaveTypes.forEach((type) => {
      if (this[type]) {
        this[type].totalApplied = 0;
        this[type].accrued = 0;
        this[type].balance = this[type].maxDays;
        this[type].year = currentYear;
      }
    });

    this.lastResetYear = currentYear;
    return true; // Reset occurred
  }
  return false; // No reset needed
};

leaveBalanceSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

const LeaveBalance = mongoose.model("LeaveBalance", leaveBalanceSchema);

module.exports = LeaveBalance;
