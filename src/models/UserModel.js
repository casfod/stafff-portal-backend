"use strict";
const mongoose = require("mongoose");
const validator = require("validator");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    first_name: {
      type: String,
      required: [true, "Please provide the  name"],
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
  },
  {
    timestamps: true,
    collection: "users",
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

// userSchema.virtual("verifications", {
//   ref: "Verification",
//   localField: "_id",
//   foreignField: "station_id",
// });

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

  return false; // False means NOT changed
};

userSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    returnedObject.id = returnedObject._id.toString();
    delete returnedObject._id;
    delete returnedObject.__v;
  },
});

const User = mongoose.model("User", userSchema);

module.exports = User;
