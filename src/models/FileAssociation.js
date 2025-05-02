const mongoose = require("mongoose");

/**
 * FileAssociation Schema
 * This schema creates a many-to-many relationship between files and any other model
 * It allows files to be associated with any model in a flexible way
 */
const fileAssociationSchema = new mongoose.Schema(
  {
    // The file being associated
    file: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "File",
      required: true,
    },

    // The model to which this file is attached
    // This follows the pattern "ModelName:documentId"
    model: {
      type: String,
      required: true,
      trim: true,
    },

    // The specific document ID this file is attached to
    documentId: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
    },

    // Optional field name if the file is attached to a specific field
    fieldName: {
      type: String,
      trim: true,
    },

    // Creation timestamp
    createdAt: {
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

// Create indexes for faster querying
fileAssociationSchema.index({ file: 1 });
fileAssociationSchema.index({ model: 1, documentId: 1 });
fileAssociationSchema.index({ documentId: 1 });

const FileAssociation = mongoose.model(
  "FileAssociation",
  fileAssociationSchema
);

module.exports = FileAssociation;
