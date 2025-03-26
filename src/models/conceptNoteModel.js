const mongoose = require("mongoose");

const conceptNoteSchema = new mongoose.Schema(
  {
    staff_name: { type: String, required: true, trim: true },
    staff_role: { type: String, required: true, trim: true },
    project_code: { type: String, required: true, trim: true },
    activity_title: { type: String, required: true, trim: true },
    activity_location: { type: String, required: true, trim: true },
    activity_period: {
      from: { type: String, required: true, trim: true },
      to: { type: String, required: true, trim: true },
    },
    background_context: { type: String, required: true, trim: true },
    objectives_purpose: { type: String, required: true, trim: true },
    // objectives_purpose: [{ type: String, required: true , trim: true, }],
    detailed_activity_description: { type: String, required: true, trim: true },
    // detailed_activity_description: [
    //   {
    //     title: { type: String, required: true },
    //     description: { type: String, required: true },
    //   },
    // ],
    strategic_plan: { type: String, required: true, trim: true },
    // benefits_of_project: [{ type: String, required: true , trim: true, }],
    benefits_of_project: { type: String, required: true, trim: true },
    staff_role: { type: String, required: true, trim: true },
    preparedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
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
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

const ConceptNote = mongoose.model("ConceptNote", conceptNoteSchema);

module.exports = ConceptNote;
