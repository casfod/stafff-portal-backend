"use strict";
const mongoose = require("mongoose");

const itemGroupSchema = new mongoose.Schema({
  description: { type: String, required: true },
  frequency: { type: Number, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: "" },
  unitCost: { type: Number, required: true },
  total: { type: Number, required: true },
});

const purchaseRequestSchema = new mongoose.Schema(
  {
    department: { type: String, required: true },
    suggestedSupplier: { type: String, required: true },
    requestedBy: { type: String, required: true },
    address: { type: String, required: true },
    finalDeliveryPoint: { type: String, required: true },
    city: { type: String, required: true },
    periodOfActivity: { type: String, required: true },
    activityDescription: { type: String, default: "" },
    expenseChargedTo: { type: String, required: true },
    accountCode: { type: String, required: true },
    reviewedBy: {
      type: String,
      required: function () {
        // Required only when status is "pending" (i.e., "Save and Send" is used)
        return this.status === "pending";
      },
      default: "",
    },
    itemGroups: [itemGroupSchema], // Array of item groups
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"], // All possible statuses
      default: "draft", // Default status
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
  },
  { timestamps: true }
);

const PurchaseRequest = mongoose.model(
  "PurchaseRequest",
  purchaseRequestSchema
);
module.exports = PurchaseRequest;
