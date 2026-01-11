const mongoose = require("mongoose");

const paymentRequestSchema = new mongoose.Schema(
  {
    pmrNumber: { type: String, unique: true, trim: true },
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
  },
  { timestamps: true }
);

paymentRequestSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

// PMR Number generation middleware
paymentRequestSchema.pre("save", async function (next) {
  // Only generate PMR number when status changes to pending AND pmrNumber doesn't exist
  if (
    this.isModified("status") &&
    this.status === "pending" &&
    !this.pmrNumber
  ) {
    try {
      // Count only non-draft documents to get the correct serial
      const count = await mongoose.model("PaymentRequest").countDocuments({
        status: { $ne: "draft" },
      });
      const serial = (count + 1).toString().padStart(3, "0");
      this.pmrNumber = `PMR-CASFOD${serial}`;
      next();
    } catch (error) {
      next(error);
    }
  } else if (this.status === "draft" && !this.pmrNumber) {
    // Draft documents get a temporary code
    this.pmrNumber = `PMR-DRAFT-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    next();
  } else {
    next();
  }
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
