"use strict";
const mongoose = require("mongoose");

const itemGroupSchema = new mongoose.Schema({
  description: { type: String, required: true, trim: true },
  frequency: { type: Number, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: "" },
  unitCost: { type: Number, default: "" },
  total: { type: Number, default: "" },
});

const RFQSchema = new mongoose.Schema(
  {
    RFQTitle: { type: String, default: "Request for Quotation" },
    RFQCode: { type: String, default: "", unique: true },
    itemGroups: [itemGroupSchema],
    copiedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "Vendor" }],
    deliveryPeriod: { type: String, default: "" },
    bidValidityPeriod: { type: String, default: "" },
    guaranteePeriod: { type: String, default: "" },
    pdfUrl: { type: String, default: "" },
    cloudinaryId: { type: String, default: "" },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    status: {
      type: String,
      enum: ["preview", "draft", "sent", "cancelled"],
      default: "preview",
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

// Enhanced pre-save middleware
RFQSchema.pre("save", async function (next) {
  if (this.isNew && !this.RFQCode) {
    try {
      // Generate RFQ code only when status is "preview" or "sent"
      if (
        (this.status === "preview" || this.status === "sent") &&
        !this.RFQCode.startsWith("RFQ-CASFOD")
      ) {
        const count = await mongoose
          .model("RFQ")
          .countDocuments({ status: { $in: ["preview", "sent"] } });
        const serial = (count + 1).toString().padStart(3, "0");
        this.RFQCode = `RFQ-CASFOD${serial}`;
      } else if (this.status === "draft" && !this.RFQCode) {
        // Draft documents get a temporary code
        this.RFQCode = `RFQ-DRAFT-${Date.now()}`;
      }
      next();
    } catch (error) {
      next(error);
    }
  } else {
    next();
  }
});

RFQSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

const RFQ = mongoose.model("RFQ", RFQSchema);
module.exports = RFQ;
