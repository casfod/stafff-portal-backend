"use strict";
const mongoose = require("mongoose");

const reportSchema = new mongoose.Schema(
  {
    reportNumber: { type: String, unique: true, trim: true },
    activityType: {
      type: String,
      enum: ["Workshop", "Training", "Sector Meeting", "Other"],
      required: true,
      trim: true,
    },
    otherActivitySpecification: {
      // NEW FIELD
      type: String,
      trim: true,
      required: function () {
        return this.activityType === "Other";
      },
    },

    reportType: {
      type: String,
      enum: [
        "Weekly Report",
        "Monthly Report",
        "Quarterly Report",
        "Annual Report",
        "Activity report",
      ],
      required: true,
      trim: true,
    },
    reportTitle: { type: String, required: true, trim: true },
    reportingPeriod: {
      from: { type: String, required: true, trim: true },
      to: { type: String, required: true, trim: true },
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
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
    copiedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: {
      type: String,
      enum: ["draft", "pending", "reviewed", "approved", "rejected"],
      default: "draft",
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

reportSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

reportSchema.pre("save", async function (next) {
  // Only generate report number when status changes to pending AND reportNumber doesn't exist
  if (
    this.isModified("status") &&
    this.status === "pending" &&
    !this.reportNumber
  ) {
    try {
      const count = await mongoose.model("Report").countDocuments({
        status: { $ne: "draft" },
      });
      const serial = (count + 1).toString().padStart(3, "0");
      this.reportNumber = `RPT-CASFOD${serial}`;
      next();
    } catch (error) {
      next(error);
    }
  } else if (this.status === "draft" && !this.reportNumber) {
    this.reportNumber = `RPT-DRAFT-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    next();
  } else {
    next();
  }
});

const Report = mongoose.model("Report", reportSchema);
module.exports = Report;
