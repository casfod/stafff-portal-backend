// GooodsRecievedModel.js - Updated version
"use strict";
const mongoose = require("mongoose");
// const mongoosePaginate = require("mongoose-paginate-v2");

const goodsReceivedItemsSchema = new mongoose.Schema({
  itemid: {
    type: String,
    required: true,
    trim: true,
  },
  numberOrdered: { type: Number, required: true },
  numberReceived: { type: Number, required: true },
  difference: { type: Number, default: 0 },
  isFullyReceived: { type: Boolean, default: false },
});

const goodsReceivedSchema = new mongoose.Schema(
  {
    GRDCode: { type: String, default: "", unique: true },
    purchaseOrder: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "PurchaseOrder",
      required: true,
    },
    GRNitems: [goodsReceivedItemsSchema],
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    isCompleted: { type: Boolean, default: false },
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

// Pre-save middleware for GRN code generation and item status
goodsReceivedSchema.pre("save", async function (next) {
  if (this.isNew && !this.GRDCode) {
    try {
      const count = await mongoose.model("GoodsReceived").countDocuments();
      const serial = (count + 1).toString().padStart(3, "0");
      this.GRDCode = `GRN-CASFOD${serial}`;
    } catch (error) {
      return next(error);
    }
  }

  // Update item status and overall completion
  if (this.GRNitems && this.GRNitems.length > 0) {
    let allItemsFullyReceived = true;

    this.GRNitems.forEach((item) => {
      item.difference = item.numberOrdered - item.numberReceived;
      item.isFullyReceived = item.difference === 0;

      if (!item.isFullyReceived) {
        allItemsFullyReceived = false;
      }
    });

    this.isCompleted = allItemsFullyReceived;
  }

  next();
});

// Add pagination plugin
// goodsReceivedSchema.plugin(mongoosePaginate);

const GoodsReceived = mongoose.model("GoodsReceived", goodsReceivedSchema);
module.exports = GoodsReceived;
