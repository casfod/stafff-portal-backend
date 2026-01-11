const mongoose = require("mongoose");

const itemGroupSchema = new mongoose.Schema({
  expense: { type: String, required: true, trim: true },
  frequency: { type: Number, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: "" },
  unitCost: { type: Number, required: true },
  total: { type: Number, required: true },
});

const expenseClaimsSchema = new mongoose.Schema(
  {
    ecNumber: { type: String, unique: true, trim: true },
    staffName: { type: String, required: true, trim: true },
    expenseClaim: {
      from: { type: String, required: true, trim: true },
      to: { type: String, required: true, trim: true },
    },
    expenseChargedTo: { type: String, required: true, trim: true },
    accountCode: { type: String, required: true, trim: true },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },
    budget: { type: Number, required: true },

    amountInWords: { type: String, required: true },
    expenseReason: { type: String, required: true, trim: true },
    dayOfDeparture: { type: String, required: true, trim: true },
    dayOfReturn: { type: String, required: true, trim: true },
    expenses: {
      type: [itemGroupSchema],
      required: true,
      validate: {
        validator: function (value) {
          return Array.isArray(value) && value.length > 0;
        },
        message: "At least one expense item is required.",
      },
    },

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },

    status: {
      type: String,
      enum: ["draft", "pending", "reviewed", "approved", "rejected"],
      default: "draft",
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
  },
  {
    timestamps: true,
  }
);

expenseClaimsSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

expenseClaimsSchema.pre("save", async function (next) {
  // Only generate EC number when status changes to pending AND ecNumber doesn't exist
  if (
    this.isModified("status") &&
    this.status === "pending" &&
    !this.ecNumber
  ) {
    try {
      // Count only non-draft documents to get the correct serial
      const count = await mongoose.model("ExpenseClaims").countDocuments({
        status: { $ne: "draft" },
      });
      const serial = (count + 1).toString().padStart(3, "0");
      this.ecNumber = `EC-CASFOD${serial}`;
      next();
    } catch (error) {
      next(error);
    }
  } else if (this.status === "draft" && !this.ecNumber) {
    // Draft documents get a temporary code
    this.ecNumber = `EC-DRAFT-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    next();
  } else {
    next();
  }
});

const ExpenseClaims = mongoose.model("ExpenseClaims", expenseClaimsSchema);

module.exports = ExpenseClaims;
