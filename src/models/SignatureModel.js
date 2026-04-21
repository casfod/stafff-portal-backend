// models/SignatureModel.js
const mongoose = require("mongoose");

/**
 * Signature Schema for storing user signatures
 * Each user can have one active signature
 * Signature image is stored as a File reference
 */
const signatureSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // One signature per user
    },
    // Reference to the File model containing the signature image
    file: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      required: true,
    },
    // Signature metadata
    isActive: {
      type: Boolean,
      default: true,
    },
    uploadedAt: {
      type: Date,
      default: Date.now,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    // Optional: signature settings
    settings: {
      defaultPosition: {
        x: { type: Number, default: 50 }, // percentage
        y: { type: Number, default: 85 }, // percentage
        width: { type: Number, default: 150 }, // pixels
      },
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

// Indexes for faster queries
// signatureSchema.index({ user: 1 });
signatureSchema.index({ isActive: 1 });
signatureSchema.index({ user: 1, isActive: 1 });

// Virtual to get the signature image URL
signatureSchema.virtual("imageUrl").get(function () {
  if (this.file && this.file.url) {
    return this.file.url;
  }
  return null;
});

const Signature = mongoose.model("Signature", signatureSchema);

module.exports = Signature;
