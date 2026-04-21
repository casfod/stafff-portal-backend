// models/SignatureModel.js
const mongoose = require("mongoose");

/**
 * Signature Schema for storing user digital signatures
 * This schema stores signature images and metadata
 */
const signatureSchema = new mongoose.Schema(
  {
    // Reference to the user
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true, // One signature per user
    },

    // Signature image URL (Cloudinary)
    signatureUrl: {
      type: String,
      required: true,
      trim: true,
    },

    // Cloudinary public ID for management
    cloudinaryId: {
      type: String,
      required: true,
      trim: true,
    },

    // Signature metadata
    originalName: {
      type: String,
      trim: true,
    },

    // Signature type (drawn, uploaded)
    signatureType: {
      type: String,
      enum: ["drawn", "uploaded", "typed"],
      default: "uploaded",
    },

    // Whether this is the active signature
    isActive: {
      type: Boolean,
      default: true,
    },

    // Signature settings
    settings: {
      width: { type: Number, default: 200 },
      height: { type: Number, default: 80 },
      scale: { type: Number, default: 1 },
    },

    // Timestamps
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

// Indexes for faster queries
signatureSchema.index({ user: 1 });
signatureSchema.index({ isActive: 1 });

const Signature = mongoose.model("Signature", signatureSchema);

module.exports = Signature;
