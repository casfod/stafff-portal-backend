const mongoose = require("mongoose");

const itemGroupSchema = new mongoose.Schema({
  expense: { type: String, required: true, trim: true },
  frequency: { type: Number, required: true, trim: true },
  quantity: { type: Number, required: true, trim: true },
  unit: { type: String, default: "" },
  unitCost: { type: Number, required: true, trim: true },
  total: { type: Number, required: true, trim: true },
});

const traveRequestSchema = new mongoose.Schema(
  {
    staffName: { type: String, required: true, trim: true },
    travelRequest: {
      from: { type: String, required: true, trim: true },
      to: { type: String, required: true, trim: true },
    },
    project: { type: String, required: true, trim: true },
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
          default: null,
        },
        text: { type: String, required: true, trim: true },
        _id: false,
      },
    ],
  },
  {
    timestamps: true,
  }
);

traveRequestSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

const TraveRequest = mongoose.model("TraveRequest", traveRequestSchema);

module.exports = TraveRequest;
