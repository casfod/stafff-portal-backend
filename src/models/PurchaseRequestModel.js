"use strict";
const mongoose = require("mongoose");

const itemGroupSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  frequency: { type: Number, required: true, trim: true },
  quantity: { type: Number, required: true, trim: true },
  unit: { type: String, default: "" },
  unitCost: { type: Number, required: true, trim: true },
  total: { type: Number, required: true, trim: true },
});

const purchaseRequestSchema = new mongoose.Schema(
  {
    department: { type: String, required: true, trim: true },
    suggestedSupplier: { type: String, required: true, trim: true },
    requestedBy: { type: String, required: true, trim: true },
    address: { type: String, required: true, trim: true },
    finalDeliveryPoint: { type: String, required: true, trim: true },
    city: { type: String, required: true, trim: true },
    periodOfActivity: { type: String, required: true, trim: true },
    activityDescription: { type: String, default: "" },
    expenseChargedTo: { type: String, required: true, trim: true },
    accountCode: { type: String, required: true, trim: true },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      // required: function () {
      //   // Required only when status is "pending"
      //   return this.status === "pending";
      // },
      default: null,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      // required: function () {
      //   // Required only when status is "pending"
      //   return this.status === "reviewed";
      // },
      default: null,
    },
    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      // required: function () {
      //   // Required only when status is "pending"
      //   return this.status === "pending";
      // },
      default: null,
    },
    itemGroups: [itemGroupSchema],
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        text: { type: String, required: true, trim: true }, // Rename `type` to `text` for clarity
        _id: false,
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
  },
  { timestamps: true }
);

purchaseRequestSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

const PurchaseRequest = mongoose.model(
  "PurchaseRequest",
  purchaseRequestSchema
);
module.exports = PurchaseRequest;
