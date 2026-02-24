// models/LeaveModel.js
const mongoose = require("mongoose");

const leaveSchema = new mongoose.Schema(
  {
    leaveNumber: { type: String, unique: true, trim: true },

    // User information
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    staff_name: { type: String, required: true, trim: true },
    staff_role: { type: String, required: true, trim: true },

    // Leave type with max days configuration
    leaveType: {
      type: String,
      enum: [
        "Annual leave",
        "Compassionate leave",
        "Sick leave",
        "Maternity leave",
        "Paternity leave",
        "Emergency leave",
        "Study Leave",
        "Leave without pay",
      ],
      required: true,
    },

    // Leave type configuration (from your LEAVE FORM.docx)
    leaveTypeConfig: {
      maxDays: { type: Number, required: true },
      description: { type: String },
      isCalendarDays: { type: Boolean, default: false }, // Some leaves use calendar days vs working days
    },

    // Leave period
    startDate: { type: Date, required: true },
    endDate: { type: Date, required: true },
    totalDaysApplied: { type: Number, required: true }, // Calculated days

    // Leave balance tracking (snapshot at time of application)
    leaveBalanceAtApplication: { type: Number, required: true },
    amountAccruedLeave: { type: Number, default: 0 }, // Will store approved leave days

    // Workflow fields (matching your concept note pattern)
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: ["draft", "pending", "reviewed", "approved", "rejected"],
      default: "draft",
    },

    // Comments (similar to concept note)
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          required: true,
        },
        text: { type: String, required: true, trim: true },
        edited: { type: Boolean, default: false },
        deleted: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
        updatedAt: { type: Date, default: Date.now },
      },
    ],

    // For sharing/copying
    copiedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Leave cover information (from your form)
    leaveCover: {
      nameOfCover: { type: String, trim: true },
      signature: { type: String, trim: true },
    },

    // Additional fields from your form
    reasonForLeave: { type: String, trim: true },
    contactDuringLeave: { type: String, trim: true },

    // Soft delete
    isDeleted: { type: Boolean, default: false },
  },
  {
    timestamps: true,
  }
);

// Generate leave number
leaveSchema.pre("save", async function (next) {
  if (
    this.isModified("status") &&
    this.status === "pending" &&
    !this.leaveNumber
  ) {
    try {
      const count = await mongoose.model("Leave").countDocuments({
        status: { $ne: "draft" },
      });
      // const year = new Date().getFullYear();
      const serial = (count + 1).toString().padStart(3, "0");
      this.leaveNumber = `LV-CASFOD-${serial}`;
      next();
    } catch (error) {
      next(error);
    }
  } else if (this.status === "draft" && !this.leaveNumber) {
    this.leaveNumber = `LV-DRAFT-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    next();
  } else {
    next();
  }
});

leaveSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

const Leave = mongoose.model("Leave", leaveSchema);

module.exports = Leave;
