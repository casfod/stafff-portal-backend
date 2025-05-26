const mongoose = require("mongoose");

const paymentRequestSchema = new mongoose.Schema(
  {
    requestBy: { type: String, required: true, trim: true },
    amountInFigure: { type: Number, required: true },
    amountInWords: { type: String, required: true },
    purposeOfExpense: { type: String, required: true },
    grantCode: { type: String, required: true, trim: true },
    dateOfExpense: { type: String, required: true, trim: true },
    specialInstruction: { type: String, required: true, trim: true },
    accountNumber: { type: String, required: true, trim: true },
    accountName: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },

    requestedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    requestedAt: {
      type: Date,
      default: null,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    approvedAt: {
      type: Date,
      default: null,
    },

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
    copiedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],
    status: {
      type: String,
      enum: ["draft", "pending", "reviewed", "approved", "rejected"],
      default: "draft",
    },
  },
  { timestamps: true }
);

paymentRequestSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

// Middleware to auto-set timestamps when reviewedBy/approvedBy changes
paymentRequestSchema.pre("save", function (next) {
  if (this.isModified("reviewedBy") && this.reviewedBy) {
    this.reviewedAt = new Date();
  }

  if (this.isModified("approvedBy") && this.approvedBy) {
    this.approvedAt = new Date();
  }

  if (this.isModified("requestedBy") && this.requestedBy) {
    this.requestedAt = new Date();
  }

  next();
});

const PaymentRequest = mongoose.model("PaymentRequest", paymentRequestSchema);

module.exports = PaymentRequest;
