// models/AppraisalModel.js
"use strict";
const mongoose = require("mongoose");

const objectiveRatingSchema = new mongoose.Schema({
  objective: { type: String, required: true, trim: true },
  employeeRating: {
    type: String,
    enum: ["", "Achieved", "Partly Achieved", "Not Achieved"],
    default: "",
  },
  supervisorRating: {
    type: String,
    enum: ["", "Achieved", "Partly Achieved", "Not Achieved"],
    default: "",
  },
  employeePoints: { type: Number, default: 0 },
  supervisorPoints: { type: Number, default: 0 },
});

const performanceAreaSchema = new mongoose.Schema({
  area: {
    type: String,
    enum: [
      "Job Knowledge",
      "Judgement",
      "Reliability",
      "Quality & Quantity of Work",
      "Interpersonal and Communication Skills",
      "Teamwork",
    ],
    required: true,
  },
  rating: {
    type: String,
    enum: ["Needs Improvement", "Meets Expectations", "Exceeds Expectations"],
    required: true,
  },
});

const appraisalSchema = new mongoose.Schema(
  {
    appraisalCode: { type: String, default: "", unique: true, sparse: true },

    // Staff Information
    staffId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    staffName: { type: String, trim: true },
    position: { type: String, trim: true },
    department: { type: String, required: true, trim: true },
    lengthOfTimeInPosition: { type: String, trim: true },
    appraisalPeriod: { type: String, required: true, trim: true },
    dateOfAppraisal: { type: Date, default: Date.now },

    // Supervisor Information
    supervisorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    supervisorName: { type: String, trim: true },
    lengthOfTimeSupervised: { type: String, trim: true },

    // Section 2: Performance Objectives (max 5 + safeguarding)
    objectives: [objectiveRatingSchema],

    // Safeguarding Section
    safeguarding: {
      actionsTaken: { type: String, trim: true, default: "" },
      trainingCompleted: {
        type: String,
        enum: ["Yes", "Partly", "No"],
        default: "No",
      },
      areasNotUnderstood: [{ type: String, trim: true }],
    },

    // Section 3: Supervisor's Assessment
    performanceAreas: [performanceAreaSchema],
    supervisorComments: { type: String, trim: true },
    overallRating: {
      type: String,
      enum: [
        "Meets Requirements",
        "Partly Meets Requirements",
        "Does Not Meet Requirements",
      ],
      required: true,
    },

    // Section 4: Employee's Future Goals
    futureGoals: { type: String, trim: true },

    // Section 5: Signatures and Comments
    signatures: {
      staffSignature: { type: Boolean, default: false },
      staffSignatureDate: Date,
      staffComments: { type: String, trim: true },
      supervisorSignature: { type: Boolean, default: false },
      supervisorSignatureDate: Date,
      hrComments: { type: String, trim: true },
    },

    // Calculated scores
    scores: {
      employeeTotal: { type: Number, default: 0 },
      supervisorTotal: { type: Number, default: 0 },
      performanceAreasCount: {
        needsImprovement: { type: Number, default: 0 },
        meetsExpectations: { type: Number, default: 0 },
        exceedsExpectations: { type: Number, default: 0 },
      },
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

    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    staffStrategy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "StaffStrategy",
      required: true,
    },

    status: {
      type: String,
      enum: [
        "draft",
        "pending-employee",
        "pending-supervisor",
        "completed",
        "rejected",
      ],
      default: "draft",
    },

    submittedByEmployee: { type: Boolean, default: false },
    submittedBySupervisor: { type: Boolean, default: false },
    completedAt: Date,

    pdfUrl: { type: String, default: "" },
    cloudinaryId: { type: String, default: "" },
  },
  {
    timestamps: true,
    toJSON: {
      virtuals: true,
      transform: (doc, ret) => {
        ret.id = ret._id;
        delete ret._id;
        delete ret.__v;
        return ret;
      },
    },
  }
);

// Pre-save middleware for appraisal code generation
appraisalSchema.pre("save", async function (next) {
  if (
    this.isModified("status") &&
    (this.status === "pending-employee" ||
      this.status === "pending-supervisor") &&
    !this.appraisalCode
  ) {
    try {
      const count = await mongoose.model("Appraisal").countDocuments({
        status: { $nin: ["draft"] },
      });
      const serial = (count + 1).toString().padStart(3, "0");
      this.appraisalCode = `APP-CASFOD-${serial}`;
      next();
    } catch (error) {
      next(error);
    }
  } else if (this.status === "draft" && !this.appraisalCode) {
    this.appraisalCode = `APP-DRAFT-${Date.now()}-${Math.random()
      .toString(36)
      .substr(2, 9)}`;
    next();
  } else {
    next();
  }
});

// Pre-save middleware to calculate scores
appraisalSchema.pre("save", function (next) {
  // Calculate points based on ratings
  const ratingPoints = {
    Achieved: 3,
    "Partly Achieved": 2,
    "Not Achieved": 0,
  };

  let employeeTotal = 0;
  let supervisorTotal = 0;

  this.objectives.forEach((obj) => {
    obj.employeePoints = ratingPoints[obj.employeeRating] || 0;
    obj.supervisorPoints = ratingPoints[obj.supervisorRating] || 0;
    employeeTotal += obj.employeePoints;
    supervisorTotal += obj.supervisorPoints;
  });

  // Count performance areas ratings
  const counts = {
    needsImprovement: 0,
    meetsExpectations: 0,
    exceedsExpectations: 0,
  };

  this.performanceAreas.forEach((area) => {
    if (area.rating === "Needs Improvement") counts.needsImprovement++;
    if (area.rating === "Meets Expectations") counts.meetsExpectations++;
    if (area.rating === "Exceeds Expectations") counts.exceedsExpectations++;
  });

  this.scores = {
    employeeTotal,
    supervisorTotal,
    performanceAreasCount: counts,
  };

  next();
});

appraisalSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

const Appraisal = mongoose.model("Appraisal", appraisalSchema);
module.exports = Appraisal;
