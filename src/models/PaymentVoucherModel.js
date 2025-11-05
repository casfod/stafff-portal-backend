// models/PaymentVoucherModel.js
"use strict";
const mongoose = require("mongoose");

const paymentVoucherSchema = new mongoose.Schema(
  {
    // departmentalCode: { type: String, required: true, trim: true },
    pvNumber: { type: String, unique: true, trim: true }, // Remove required: true
    payingStation: { type: String, required: true, trim: true },
    payTo: { type: String, required: true, trim: true },
    being: { type: String, required: true, trim: true },
    amountInWords: { type: String, required: true, trim: true },
    grantCode: { type: String, required: true, trim: true },
    grossAmount: { type: Number, required: true, min: 0 },
    vat: { type: Number, default: 0, min: 0 },
    wht: { type: Number, default: 0, min: 0 },
    devLevy: { type: Number, default: 0, min: 0 },
    otherDeductions: { type: Number, default: 0, min: 0 },
    netAmount: { type: Number, required: true, min: 0 }, // Keep min: 0 but add validation
    chartOfAccountCategories: { type: String, required: true, trim: true },
    organisationalChartOfAccount: { type: String, required: true, trim: true },
    project: { type: String, required: true, trim: true },
    chartOfAccountCode: { type: String, required: true, trim: true },
    // projBudgetLine: { type: String, required: true, trim: true },
    note: { type: String, default: "" },
    // mandateReference: { type: String, required: true, trim: true },
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

// Improved Auto-generate PV Number
// paymentVoucherSchema.pre("save", async function (next) {
//   if (this.isNew && !this.pvNumber) {
//     try {
//       const count = await this.constructor.countDocuments();
//       this.pvNumber = `PV-${String(count + 1).padStart(6, "0")}`;
//     } catch (error) {
//       return next(error);
//     }
//   }
//   next();
// });
paymentVoucherSchema.pre("save", async function (next) {
  if (this.isNew && !this.pvNumber) {
    try {
      // For draft status - temporary number
      if (this.status === "draft") {
        this.pvNumber = `PV-DRAFT-${Date.now()}`;
      }
      // For other statuses - generate sequential number
      else {
        const count = await mongoose.model("PaymentVoucher").countDocuments({
          status: { $ne: "draft" },
          pvNumber: { $not: /PV-DRAFT/ },
        });
        const serial = (count + 1).toString().padStart(3, "0");
        this.pvNumber = `PV-CASFOD${serial}`;

        // Alternative: If you want CASFOD prefix
        // this.pvNumber = `PV-CASFOD-${serial}`;
      }
      next();
    } catch (error) {
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
