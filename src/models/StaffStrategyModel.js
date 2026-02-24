"use strict";
const mongoose = require("mongoose");

const objectiveSchema = new mongoose.Schema({
  objective: { type: String, required: true, trim: true },
  timeline: { type: String, default: "Routine", trim: true },
  expectedOutcome: { type: String, required: true, trim: true },
  kpi: { type: String, required: true, trim: true },
  possibleChallenges: { type: String, trim: true },
  supportRequired: { type: String, trim: true },
});

const accountabilityAreaSchema = new mongoose.Schema({
  areaName: { type: String, required: true, trim: true },
  objectives: [objectiveSchema],
});

const staffStrategySchema = new mongoose.Schema(
  {
    strategyCode: { type: String, default: "", unique: true, sparse: true },
    staffName: { type: String, required: true, trim: true },
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    jobTitle: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    supervisor: { type: String, required: true, trim: true },
    supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    date: { type: Date, default: Date.now },
    period: { type: String, required: true, trim: true },

    accountabilityAreas: [accountabilityAreaSchema],

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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // Simple status enum - exactly like Purchase Order
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
      default: "draft",
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    pdfUrl: { type: String, default: "" },
    cloudinaryId: { type: String, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Pre-save middleware for strategy code generation
staffStrategySchema.pre("save", async function (next) {
  // Generate strategy code only when moving from draft to pending
  if (
    this.isModified("status") &&
    this.status === "pending" &&
    !this.strategyCode
  ) {
    try {
      const count = await mongoose.model("StaffStrategy").countDocuments({
        status: { $ne: "draft" },
      });
      const serial = (count + 1).toString().padStart(3, "0");
      this.strategyCode = `SS-CASFOD-${serial}`;
      next();
    } catch (error) {
      next(error);
    }
  } else if (this.status === "draft" && !this.strategyCode) {
    // Draft documents get a temporary code
    this.strategyCode = `SS-DRAFT-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    next();
  } else {
    next();
  }
});

staffStrategySchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

const StaffStrategy = mongoose.model("StaffStrategy", staffStrategySchema);
module.exports = StaffStrategy;
