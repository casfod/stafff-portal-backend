// models/PaymentVoucherModel.js
"use strict";
const mongoose = require("mongoose");

const paymentVoucherSchema = new mongoose.Schema(
  {
    pvNumber: { type: String, unique: true, trim: true },
    payingStation: { type: String, required: true, trim: true },
    payTo: { type: String, required: true, trim: true },
    being: { type: String, required: true, trim: true },
    pvDate: { type: String, required: true, trim: true },
    amountInWords: { type: String, required: true, trim: true },
    accountCode: { type: String, required: true, trim: true },
    projectCode: { type: String, required: true, trim: true },
    project: { type: String, required: true, trim: true },
    grossAmount: { type: Number, required: true, min: 0 },
    vat: { type: Number, default: 0, min: 0 },
    wht: { type: Number, default: 0, min: 0 },
    devLevy: { type: Number, default: 0, min: 0 },
    otherDeductions: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, required: true, min: 0 },
    chartOfAccountCategories: { type: String, required: true, trim: true },
    organisationalChartOfAccount: { type: String, required: true, trim: true },
    chartOfAccountCode: { type: String, required: true, trim: true },
    note: { type: String, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
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
          default: null,
        },
        text: { type: String, required: true, trim: true },
        _id: false,
      },
    ],
    status: {
      type: String,
      enum: ["draft", "pending", "reviewed", "approved", "rejected", "paid"],
      default: "draft",
    },
    copiedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
  },
  { timestamps: true }
);

paymentVoucherSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

// Generate PV Number only for non-draft status using pvDate and projectCode
paymentVoucherSchema.pre("save", async function (next) {
  if (this.isNew && !this.pvNumber) {
    try {
      // For draft status - temporary number
      if (this.status === "draft") {
        this.pvNumber = `PV-DRAFT-${Date.now()}`;
      } else {
        // For other statuses - generate formatted number using pvDate and projectCode
        const pvDate = new Date(this.pvDate);
        const month = String(pvDate.getMonth() + 1).padStart(2, "0");
        const year = pvDate.getFullYear();

        // Format projectCode: replace spaces with hyphens
        const formattedProjectCode = this.projectCode.replace(/\s+/g, "-");

        // Count documents with the same projectCode, same month/year, and non-draft status
        const startOfMonth = new Date(
          pvDate.getFullYear(),
          pvDate.getMonth(),
          1
        );
        const endOfMonth = new Date(
          pvDate.getFullYear(),
          pvDate.getMonth() + 1,
          0,
          23,
          59,
          59,
          999
        );

        const count = await mongoose.model("PaymentVoucher").countDocuments({
          projectCode: this.projectCode,
          pvDate: {
            $gte: startOfMonth.toISOString().split("T")[0],
            $lte: endOfMonth.toISOString().split("T")[0],
          },
          status: { $ne: "draft" },
          pvNumber: { $not: /PV-DRAFT/ },
        });

        const serial = (count + 1).toString().padStart(3, "0");
        this.pvNumber = `CASFOD/${formattedProjectCode}/${month}/${year}/${serial}`;
      }
      next();
    } catch (error) {
      console.error("Error generating PV number:", error);
      next(error);
    }
  } else {
    next();
  }
});

// Add validation for netAmount to prevent negative values
paymentVoucherSchema.pre("save", function (next) {
  if (this.netAmount < 0) {
    const error = new Error("Net amount cannot be negative");
    return next(error);
  }
  next();
});

const PaymentVoucher = mongoose.model("PaymentVoucher", paymentVoucherSchema);
module.exports = PaymentVoucher;
