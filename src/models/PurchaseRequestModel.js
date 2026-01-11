"use strict";
const mongoose = require("mongoose");

const itemGroupSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  frequency: { type: Number, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: "" },
  unitCost: { type: Number, required: true },
  total: { type: Number, required: true },
});

const purchaseRequestSchema = new mongoose.Schema(
  {
    pcrNumber: { type: String, unique: true, trim: true },
    department: { type: String, required: true, trim: true },
    suggestedSupplier: { type: String, required: true, trim: true },
    requestedBy: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    finalDeliveryPoint: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    periodOfActivity: {
      from: { type: String, required: true, trim: true },
      to: { type: String, required: true, trim: true },
    },
    activityDescription: { type: String, default: "" },
    expenseChargedTo: { type: String, required: true, trim: true },
    accountCode: { type: String, required: true, trim: true },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    itemGroups: [itemGroupSchema],
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
    copiedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

purchaseRequestSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

purchaseRequestSchema.pre("save", async function (next) {
  // Only generate PCR number when status changes to pending AND pcrNumber doesn't exist
  if (
    this.isModified("status") &&
    this.status === "pending" &&
    !this.pcrNumber
  ) {
    try {
      // Count only non-draft documents to get the correct serial
      const count = await mongoose.model("PurchaseRequest").countDocuments({
        status: { $ne: "draft" },
      });
      const serial = (count + 1).toString().padStart(3, "0");
      this.pcrNumber = `PCR-CASFOD${serial}`;
      next();
    } catch (error) {
      next(error);
    }
  } else if (this.status === "draft" && !this.pcrNumber) {
    // Draft documents get a temporary code
    this.pcrNumber = `PCR-DRAFT-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    next();
  } else {
    next();
  }
});

const PurchaseRequest = mongoose.model(
  "PurchaseRequest",
  purchaseRequestSchema
);
module.exports = PurchaseRequest;
