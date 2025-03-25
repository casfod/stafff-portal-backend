const mongoose = require("mongoose");

const conceptNoteSchema = new mongoose.Schema(
  {
    staff_name: { type: String, required: true },
    staff_role: { type: String, required: true },
    project_code: { type: String, required: true },
    activity_title: { type: String, required: true },
    activity_location: { type: String, required: true },
    activity_period: {
      from: { type: String, required: true },
      to: { type: String, required: true },
    },
    background_context: { type: String, required: true },
    objectives_purpose: { type: String, required: true },
    // objectives_purpose: [{ type: String, required: true }],
    detailed_activity_description: { type: String, required: true },
    // detailed_activity_description: [
    //   {
    //     title: { type: String, required: true },
    //     description: { type: String, required: true },
    //   },
    // ],
    strategic_plan: { type: String, required: true },
    // benefits_of_project: [{ type: String, required: true }],
    benefits_of_project: { type: String, required: true },
    staff_role: { type: String, required: true },
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
