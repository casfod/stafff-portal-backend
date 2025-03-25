const mongoose = require("mongoose");

const conceptNoteSchema = new mongoose.Schema(
  {
    staff_Name: { type: String, required: true },
    staff_role: { type: String, required: true },
    project_code: { type: String, required: true },
    activity_title: { type: String, required: true },
    activity_location: { type: String, required: true },
    activity_period: { type: String, required: true },
    background_context: { type: String, required: true },
    objectives_purpose: [{ type: String, required: true }],
    detailed_activity_description: [
      {
        title: { type: String, required: true },
        description: { type: String, required: true },
      },
    ],
    strategic_plan: { type: String, required: true },
    benefits_of_project: [{ type: String, required: true }],
    staff_role: { type: String, required: true },
    prepared_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    approved_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },
  },
  {
    timestamps: true,
  }
);

const ConceptNote = mongoose.model("ConceptNote", conceptNoteSchema);

module.exports = ConceptNote;
