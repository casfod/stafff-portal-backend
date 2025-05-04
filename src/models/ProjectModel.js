// models/Project.js
const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    project_title: { type: String, required: true, maxlength: 200, trim: true },
    donor: { type: String, required: true, maxlength: 50, trim: true },
    project_partners: [{ type: String }],
    project_code: { type: String, required: true, maxlength: 50, trim: true },
    implementation_period: {
      from: { type: String, required: true, trim: true },
      to: { type: String, required: true, trim: true },
    },
    project_budget: { type: Number, required: true },

    account_code: [
      {
        name: { type: String, required: true, trim: true },
      },
    ],
    sectors: [
      {
        name: {
          type: String,
          enum: [
            "Education",
            "Protection",
            "WASH",
            "Nutrition/Health",
            "Livelihood",
          ],
          required: true,
        },
        percentage: { type: Number, min: 0, max: 100, required: true },
      },
    ],
    project_locations: [{ type: String, trim: true }],
    target_beneficiaries: [{ type: String, trim: true }],

    project_objectives: {
      type: String,
      required: true,
      maxlength: 400,
      trim: true,
    },
    project_summary: {
      type: String,
      required: true,
      maxlength: 4000,
      trim: true,
    },
    status: {
      type: String,
      enum: ["ongoing", "completed", "cancelled"],
      default: "ongoing",
    },
  },
  { timestamps: true }
);

projectSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

const Project = mongoose.model("Project", projectSchema);

module.exports = Project;
