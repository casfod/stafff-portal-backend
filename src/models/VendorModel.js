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
      trim: true,
      lowercase: true,
    },
    businessPhoneNumber: {
      type: String,
      required: true,
      trim: true,
      validate: {
        validator: function (v) {
          return /^\d{11}$/.test(v);
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
          return /^\d{11}$/.test(v);
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
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    position: {
      type: String,
      required: true,
    },

    vendorCode: {
      type: String,
      unique: true,
      sparse: true,
      uppercase: true,
      trim: true,
    },

    originalVendorCode: {
      type: String,
      trim: true,
      uppercase: true,
    },

    tinNumber: {
      type: String,
      required: true,
    },

    status: {
      type: String,
      enum: ["draft", "pending", "approved", "rejected"],
      default: "pending",
    },

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },

    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: "User",
          default: null,
        },
        text: { type: String, required: true, trim: true },
        createdAt: {
          type: Date,
          default: Date.now,
        },
        _id: false,
      },
    ],

    copiedTo: [{ type: mongoose.Schema.Types.ObjectId, ref: "User" }],

    // Flag to indicate if this is a migrated vendor
    isMigrated: {
      type: Boolean,
      default: false,
    },

    // Track original ID for deduplication
    originalVendorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Vendor",
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

// Compound index for uniqueness across statuses
vendorSchema.index(
  { businessName: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "approved" } }
);
vendorSchema.index(
  { businessRegNumber: 1, status: 1 },
  { unique: true, partialFilterExpression: { status: "approved" } }
);
vendorSchema.index(
  { email: 1, status: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: "approved",
      email: { $exists: true, $ne: null },
    },
  }
);

// Pre-save middleware to handle vendor code generation
vendorSchema.pre("save", async function (next) {
  try {
    if (
      this.status === "approved" &&
      (!this.vendorCode || this.vendorCode.startsWith("DRAFT-"))
    ) {
      const generatedCode = await generateVendorCode(this.businessName);
      this.vendorCode = generatedCode;

      if (!this.comments) this.comments = [];
      this.comments.unshift({
        user: null,
        text: `[SYSTEM] Generated permanent vendor code: ${generatedCode}`,
        createdAt: new Date(),
      });
    }

    next();
  } catch (error) {
    next(error);
  }
});

// Post-save middleware to set temporary vendor code for new drafts/pending
vendorSchema.post("save", async function (doc, next) {
  try {
    if (
      (doc.status === "draft" || doc.status === "pending") &&
      !doc.vendorCode
    ) {
      const tempCode = `DRAFT-${doc._id}`;
      await doc.constructor.findByIdAndUpdate(doc._id, {
        vendorCode: tempCode,
      });
    }
    next();
  } catch (error) {
    next(error);
  }
});

async function generateVendorCode(businessName) {
  const baseCode = businessName
    .replace(/[^a-zA-Z0-9]/g, "")
    .substring(0, 5)
    .toUpperCase();

  const timestamp = Date.now().toString().slice(-6);
  const random = Math.floor(Math.random() * 1000)
    .toString()
    .padStart(3, "0");

  let vendorCode = `${baseCode}${timestamp}${random}`;

  const Vendor = mongoose.model("Vendor");
  let existingVendor = await Vendor.findOne({ vendorCode });
  let counter = 1;

  while (existingVendor) {
    vendorCode = `${baseCode}${timestamp}${random}${counter}`;
    existingVendor = await Vendor.findOne({ vendorCode });
    counter++;
  }

  return vendorCode;
}

vendorSchema.statics.generateVendorCode = async function (businessName) {
  return await generateVendorCode(businessName);
};

// Helper method to check if a vendor can be submitted
vendorSchema.methods.canBeSubmitted = async function () {
  if (this.status !== "draft") return true;

  // Check for approved vendors with same business name
  const existingApproved = await this.constructor.findOne({
    businessName: this.businessName,
    status: "approved",
    _id: { $ne: this._id },
  });

  if (existingApproved) {
    return {
      canSubmit: false,
      reason: `An approved vendor with business name "${this.businessName}" already exists`,
    };
  }

  // Check for approved vendors with same registration number
  const existingRegNumber = await this.constructor.findOne({
    businessRegNumber: this.businessRegNumber,
    status: "approved",
    _id: { $ne: this._id },
  });

  if (existingRegNumber) {
    return {
      canSubmit: false,
      reason: `An approved vendor with registration number "${this.businessRegNumber}" already exists`,
    };
  }

  // Check for approved vendors with same email
  if (this.email) {
    const existingEmail = await this.constructor.findOne({
      email: this.email,
      status: "approved",
      _id: { $ne: this._id },
    });

    if (existingEmail) {
      return {
        canSubmit: false,
        reason: `An approved vendor with email "${this.email}" already exists`,
      };
    }
  }

  return { canSubmit: true };
};

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
