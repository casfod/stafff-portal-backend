const mongoose = require("mongoose");

const conceptNoteSchema = new mongoose.Schema(
  {
    cnNumber: { type: String, unique: true, trim: true },
    staff_name: { type: String, required: true, trim: true },
    staff_role: { type: String, required: true, trim: true },
    expense_Charged_To: { type: String, required: true, trim: true },
    account_Code: { type: String, required: true, trim: true },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      default: null,
    },

    activity_title: { type: String, required: true, trim: true },
    activity_location: { type: String, required: true, trim: true },
    activity_period: {
      from: { type: String, required: true, trim: true },
      to: { type: String, required: true, trim: true },
    },
    background_context: { type: String, required: true, trim: true },
    objectives_purpose: { type: String, required: true, trim: true },
    detailed_activity_description: { type: String, required: true, trim: true },
    strategic_plan: { type: String, required: true, trim: true },
    benefits_of_project: { type: String, required: true, trim: true },
    preparedBy: {
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
    activity_budget: { type: Number, required: true },
    means_of_verification: { type: String, required: true, trim: true },
  },
  {
    timestamps: true,
  }
);

conceptNoteSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

conceptNoteSchema.pre("save", async function (next) {
  // Only generate CN number when status changes to pending AND cnNumber doesn't exist
  if (
    this.isModified("status") &&
    this.status === "pending" &&
    !this.cnNumber
  ) {
    try {
      // Count only non-draft documents to get the correct serial
      const count = await mongoose.model("ConceptNote").countDocuments({
        status: { $ne: "draft" },
      });
      const serial = (count + 1).toString().padStart(3, "0");
      this.cnNumber = `CN-CASFOD${serial}`;
      next();
    } catch (error) {
      next(error);
    }
  } else if (this.status === "draft" && !this.cnNumber) {
    // Draft documents get a temporary code
    this.cnNumber = `CN-DRAFT-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    next();
  } else {
    next();
  }
});

const ConceptNote = mongoose.model("ConceptNote", conceptNoteSchema);

module.exports = ConceptNote;
