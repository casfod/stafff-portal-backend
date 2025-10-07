"use strict";
const mongoose = require("mongoose");

const itemGroupSchema = new mongoose.Schema({
  description: { type: String, trim: true },
  itemName: { type: String, required: true, trim: true },
  frequency: { type: Number, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: "" },
  unitCost: { type: Number, required: true },
  total: { type: Number, required: true },
});

const purchaseOrderSchema = new mongoose.Schema(
  {
    RFQTitle: { type: String, default: "Purchase Order" },
    RFQCode: {
      type: String,
      default: "",
      sparse: true, // Only unique when value exists
    },
    POCode: { type: String, default: "", unique: true },
    itemGroups: [itemGroupSchema],
    copiedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }],
    selectedVendor: { type: mongoose.Schema.Types.ObjectId, ref: "Vendor" },
    deliveryPeriod: { type: String, default: "" },
    bidValidityPeriod: { type: String, default: "" },
    guaranteePeriod: { type: String, default: "" },
    deadlineDate: { type: String, default: "" },
    rfqDate: { type: String, default: "" },
    casfodAddressId: { type: String, default: "" },
    totalAmount: { type: Number, default: 0 },
    VAT: { type: Number, default: 0 },
    pdfUrl: { type: String, default: "" },
    cloudinaryId: { type: String, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
    isFromRFQ: { type: Boolean, default: true },
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
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
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

// Pre-save middleware for PO code generation
purchaseOrderSchema.pre("save", async function (next) {
  if (this.isNew && !this.POCode) {
    try {
      const count = await mongoose.model("PurchaseOrder").countDocuments();
      const serial = (count + 1).toString().padStart(3, "0");

      // Add "N" at the end if not created from RFQ
      // const suffix = this.isFromRFQ ? "" : "N";
      const suffix = "";
      this.POCode = `PO-CASFOD${serial}${suffix}`;

      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

purchaseOrderSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

const PurchaseOrder = mongoose.model("PurchaseOrder", purchaseOrderSchema);
module.exports = PurchaseOrder;
