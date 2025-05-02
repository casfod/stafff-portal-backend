const mongoose = require("mongoose");

/**
 * File Schema for storing file metadata
 * This schema stores information about uploaded files and their locations in Cloudinary
 */
const fileSchema = new mongoose.Schema(
  {
    // Original file name
    name: {
      type: String,
      required: true,
      trim: true,
    },

    // The URL where the file can be accessed
    url: {
      type: String,
      required: true,
      trim: true,
    },

    // Cloudinary resource ID for managing the file
    cloudinaryId: {
      type: String,
      required: true,
      trim: true,
    },

    // MIME type of the file
    mimeType: {
      type: String,
      required: true,
      trim: true,
    },

    // Size of the file in bytes
    size: {
      type: Number,
      required: true,
    },

    // File type (e.g., 'image', 'pdf', 'document', 'spreadsheet')
    fileType: {
      type: String,
      required: true,
      enum: ["image", "pdf", "spreadsheet", "document", "other"],
      trim: true,
    },

    // Optional description of the file
    description: {
      type: String,
      trim: true,
    },

    // Timestamps for when the file was created and last updated
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

// Index for faster queries
fileSchema.index({ fileType: 1 });
fileSchema.index({ createdAt: -1 });

const File = mongoose.model("File", fileSchema);

module.exports = File;
