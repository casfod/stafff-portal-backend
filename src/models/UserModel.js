"use strict";
const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    first_name: {
      type: String,
      required: [true, "Please provide the name"],
      trim: true,
      maxlength: [24, "A first name must have less or equal to 24 characters"],
      minlength: [2, "A first name must have more or equal to 2 characters"],
      validate: {
        validator: function (val) {
          return validator.isAlpha(val, ["en-US"], { ignore: " " });
        },
        message: "First name must only contain characters",
      },
    },
    last_name: {
      type: String,
      required: [true, "Please provide the last name"],
      trim: true,
      maxlength: [24, "A first name must have less or equal to 24 characters"],
      minlength: [2, "A first name must have more or equal to 2 characters"],
      validate: {
        validator: function (val) {
          return validator.isAlpha(val, ["en-US"], { ignore: " " });
        },
        message: "Last name must only contain characters",
      },
    },
    email: {
      type: String,
      required: [true, "Please provide your email"],
      unique: true,
      lowercase: true,
      validate: [validator.isEmail, "Please provide a valid email"],
    },

    role: {
      type: String,
      enum: ["SUPER-ADMIN", "ADMIN", "REVIEWER", "STAFF"],
      default: "STAFF",
    },

    procurementRole: {
      canCreate: {
        type: Boolean,
        default: false,
      },
      canView: {
        type: Boolean,
        default: false,
      },
      canUpdate: {
        type: Boolean,
        default: false,
      },
      canDelete: {
        type: Boolean,
        default: false,
      },
    },
    financeRole: {
      canCreate: {
        type: Boolean,
        default: false,
      },
      canView: {
        type: Boolean,
        default: false,
      },
      canUpdate: {
        type: Boolean,
        default: false,
      },
      canDelete: {
        type: Boolean,
        default: false,
      },
    },

    position: {
      type: String,
      enum: [
        "",
        "Executive Director",
        "Head of Program and Grant",
        "Supply Chain Coordinator",
        "Partnership and Reporting Coordinator",
        "Project Coordinator",
        "Education Officer",
        "Protection Officer",
        "MEAL Senior Officer",
        "MHPSS Officer",
        "Protection Coordinator",
        "Education Coordinator",
        "Nutrition Coordinator",
        "Livelihood Lead",
        "Gender and Disability Inclusion Lead",
        "Finance Officer",
        "State Head of Operation",
        "Procurement Officer",
        "Logistic and Fleet Management Officer",
        "Human Resource Coordinator",
        "Education Assistant",
        "Nutrition Manager",
        "Nutrition Assistant",
        "CMAM Provider",
        "CMAM Screener",
        "MICYN Screener",
        "CFM Officer",
        "AAP/CFM Facilitator",
        "Data Clerk",
        "GBV Case Worker",
        "GVB Case Worker",
        "MHPSS Councillor",
        "Communication Officer",
        "Safety and Security Adviser",
        "Communication Intern",
        "IT Associate",
        "Store Keeper",
        "Supply Chain Intern",
        "Finance and Admin Associate",
        "Driver",
        "Cleaner",
        "Media Officer",
        "Protection Assistant",
        "Education Associate",
        "Media Associate",
        "Protection Intern",
        "Education Volunteer",
        "Program Intern",
        "Logistic Assistant",
        "WASH Associate",
        "Media Intern",
        "MHPSS Intern",
        "Health Intern",
        "Finance Assistant",
      ],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },

    password: {
      type: String,
      required: [true, "Please provide a password"],
      minlength: 8,
    },
    passwordConfirm: {
      type: String,
      required: [true, "Please confirm your password"],
      validate: {
        validator: function (el) {
          return el === this.password;
        },
        message: "Passwords are not the same!",
      },
    },
    passwordChangedAt: Date,
    passwordResetToken: String,
    passwordResetExpires: Date,

    // Employment Information Fields
    employmentInfo: {
      isProfileComplete: {
        type: Boolean,
        default: false,
      },
      // Renamed for clarity: false means the user is locked from updating
      isEmploymentInfoLocked: {
        type: Boolean,
        default: false, // Default: not locked (can update)
      },
      personalDetails: {
        fullName: String,
        stateOfOrigin: String,
        lga: String,
        religion: String,
        address: String,
        homePhone: String,
        cellPhone: { type: String, unique: true },
        emailAddress: String,
        ninNumber: { type: String, unique: true },
        birthDate: Date,
        maritalStatus: {
          type: String,
          enum: ["Single", "Married", "Divorced", "Widowed"],
        },
        spouseName: String,
        spouseAddress: String,
        spousePhone: String,
        numberOfChildren: Number,
      },
      jobDetails: {
        title: String,
        idNo: String,
        workLocation: String,
        workEmail: String,
        workPhone: String,
        workCellPhone: String,
        startDate: Date,
        endDate: Date,
        supervisor: String,
        supervisorId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
      },
      emergencyContact: {
        fullName: String,
        address: String,
        primaryPhone: String,
        cellPhone: { type: String, unique: true },
        relationship: String,
      },
      bankDetails: {
        bankName: String,
        accountName: String,
        bankSortCode: { type: String, unique: true },
        accountNumber: { type: String, unique: true },
      },
    },
  },

  {
    timestamps: true,
    collection: "users",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// Virtual to check if employment info is complete
userSchema.virtual("employmentInfo.isComplete").get(function () {
  const info = this.employmentInfo;
  if (!info) return false;

  const requiredFields = [
    info.personalDetails?.fullName,
    info.personalDetails?.stateOfOrigin,
    info.personalDetails?.lga,
    info.personalDetails?.address,
    info.personalDetails?.cellPhone,
    info.personalDetails?.ninNumber,
    info.jobDetails?.title,
    info.jobDetails?.startDate,
    info.emergencyContact?.fullName,
    info.emergencyContact?.primaryPhone,
    info.bankDetails?.bankName,
    info.bankDetails?.accountName,
    info.bankDetails?.accountNumber,
  ];

  return requiredFields.every(
    (field) => field && field.toString().trim() !== ""
  );
});

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) return next();

  this.password = await bcrypt.hash(this.password, 12);
  this.passwordConfirm = undefined;
  next();
});

userSchema.pre("save", function (next) {
  if (!this.isModified("password") || this.isNew) return next();

  this.passwordChangedAt = Date.now() - 1000;
  next();
});

userSchema.methods.correctPassword = async function (
  candidatePassword,
  userPassword
) {
  return await bcrypt.compare(candidatePassword, userPassword);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(
      this.passwordChangedAt.getTime() / 1000,
      10
    );
    return JWTTimestamp < changedTimestamp;
  }

  return false;
};

userSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
