// models/Project.js
const mongoose = require("mongoose");

const projectSchema = new mongoose.Schema(
  {
    project_title: { type: String, required: true, maxlength: 200 },
    donor: { type: String, required: true, maxlength: 50 },
    project_partners: [{ type: String }],
    project_code: { type: String, required: true, maxlength: 50 },
    implementation_period: {
      from: { type: String, required: true },
      to: { type: String, required: true },
    },
    project_budget: { type: Number, required: true },

    account_code: [
      {
        name: { type: String, required: true },
        // code: { type: String, required: true },
      },
    ],
    // account_code: [
    //   {
    //     name: { type: String, required: true },
    //     code: { type: String, required: true },
    //   },
    // ],
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
    project_locations: [{ type: String }],
    target_beneficiaries: [{ type: String }],
    // target_beneficiaries: {
    //   women: { type: Number, required: true },
    //   girls: { type: Number, required: true },
    //   boys: { type: Number, required: true },
    //   men: { type: Number, required: true },
    // },
    project_objectives: { type: String, required: true, maxlength: 400 },
    project_summary: { type: String, required: true, maxlength: 4000 },
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
