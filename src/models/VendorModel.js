const mongoose = require("mongoose");

const vendorSchema = new mongoose.Schema(
  {
    businessName: {
      type: String,
      required: true,
      trim: true,
    },
    businessType: {
      type: String,
      required: true,
      trim: true,
    },

    businessRegNumber: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },

    businessState: {
      type: String,
      required: true,
      trim: true,
    },

    operatingLGA: {
      type: String,
      trim: true,
    },

    accountNumber: { type: String, required: true, trim: true },
    accountName: { type: String, required: true, trim: true },
    bankName: { type: String, required: true, trim: true },
    address: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      trim: true,
    },
    businessPhoneNumber: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^\d{11}$/.test(v); // Exactly 11 digits
        },
        message: "Business phone number must be exactly 11 digits",
      },
    },

    contactPhoneNumber: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^\d{11}$/.test(v); // Exactly 11 digits
        },
        message: "Contact phone number must be exactly 11 digits",
      },
    },
    categories: {
      type: [String],
      default: [],
      required: true,
      validate: {
        validator: function (categories) {
          return categories.every(
            (cat) => typeof cat === "string" && cat.trim().length > 0
          );
        },
        message: "Each category must be a non-empty string",
      },
    },

    contactPerson: {
      type: String,
      required: true,
      trim: true,
    },
    position: {
      type: String,
      required: true,
    },

    vendorCode: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
      trim: true,
    },

    tinNumber: {
      type: String,
      required: true,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
    updatedAt: {
      type: Date,
      default: Date.now,
    },
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

vendorSchema.set("toJSON", {
  virtuals: true,
  transform: (document, returnedObject) => {
    if (returnedObject._id) {
      returnedObject.id = returnedObject._id.toString();
      delete returnedObject._id;
    }
    delete returnedObject.__v;
  },
});

const Vendor = mongoose.model("Vendor", vendorSchema);

module.exports = Vendor;
