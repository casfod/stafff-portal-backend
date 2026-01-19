const mongoose = require("mongoose");

const itemGroupSchema = new mongoose.Schema({
  expense: { type: String, required: true, trim: true },
  description: { type: String, trim: true },
  frequency: { type: Number, required: true },
  quantity: { type: Number, required: true },
  unit: { type: String, default: "" },
  unitCost: { type: Number, required: true },
  total: { type: Number, required: true },
});

const travelRequestSchema = new mongoose.Schema(
  {
    trNumber: { type: String, unique: true, trim: true },
    staffName: { type: String, required: true, trim: true },
    travelRequest: {
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
    travelReason: { type: String, required: true, trim: true },
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

travelRequestSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

travelRequestSchema.pre("save", async function (next) {
  // Only generate TR number when status changes to pending AND trNumber doesn't exist
  if (
    this.isModified("status") &&
    this.status === "pending" &&
    !this.trNumber
  ) {
    try {
      // Count only non-draft documents to get the correct serial
      const count = await mongoose.model("TravelRequests").countDocuments({
        status: { $ne: "draft" },
      });
      const serial = (count + 1).toString().padStart(3, "0");
      this.trNumber = `TR-CASFOD${serial}`;
      next();
    } catch (error) {
      next(error);
    }
  } else if (this.status === "draft" && !this.trNumber) {
    // Draft documents get a temporary code
    this.trNumber = `TR-DRAFT-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    next();
  } else {
    next();
  }
});

const TravelRequest = mongoose.model("TravelRequests", travelRequestSchema);

module.exports = TravelRequest;
