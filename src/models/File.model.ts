// src/models/File.model.ts
import mongoose, { Schema, Document } from 'mongoose';
import { toJsonTransform } from './shared/toJson';

export interface IFile extends Document {
  url: string;
  publicId: string;
  format: string;
  resourceType: string;
  size: number;
  originalName: string;
  folder: string;
  userId?: mongoose.Types.ObjectId;
  associatedTo?: {
    model: string;
    id: mongoose.Types.ObjectId;
  };
  metadata?: {
    width?: number;
    height?: number;
    duration?: number;
  };
  // Legacy fields
  name?: string;
  cloudinaryId?: string;
  mimeType?: string;
  fileType?: 'image' | 'pdf' | 'spreadsheet' | 'document' | 'other';
  description?: string;
  isDeleted?: boolean;
  deletedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const fileSchema = new Schema<IFile>(
  {
    url: { type: String, required: true },
    publicId: { type: String, required: true, unique: true },
    format: { type: String, required: true },
    resourceType: { type: String, required: true },
    size: { type: Number, required: true },
    originalName: { type: String, required: true },
    folder: { type: String, required: true },

    userId: { type: Schema.Types.ObjectId, ref: 'User' },
    associatedTo: {
      model: { type: String },
      id: { type: Schema.Types.ObjectId },
    },

    metadata: {
      width: { type: Number },
      height: { type: Number },
      duration: { type: Number },
    },

    name: { type: String, trim: true },
    cloudinaryId: { type: String, trim: true },
    mimeType: { type: String, trim: true },
    fileType: {
      type: String,
      enum: ['image', 'pdf', 'spreadsheet', 'document', 'other'],
    },
    description: { type: String, trim: true },
    isDeleted: { type: Boolean, default: false },
    deletedAt: { type: Date },
  },
  { timestamps: true },
);

// Indexes
fileSchema.index({ userId: 1 });
fileSchema.index({ 'associatedTo.model': 1, 'associatedTo.id': 1 });
fileSchema.index({ folder: 1 });
fileSchema.index({ fileType: 1 });
fileSchema.index({ createdAt: -1 });
fileSchema.index({ isDeleted: 1 });
// fileSchema.index({ publicId: 1 });

// Hooks
fileSchema.pre('save', function (next) {
  if (this.isModified('publicId') && this.publicId) {
    this.cloudinaryId = this.publicId;
  }
  if (this.isModified('originalName') && this.originalName && !this.name) {
    this.name = this.originalName;
  }
  next();
});

fileSchema.set('toJSON', toJsonTransform());

export const File = mongoose.model<IFile>('File', fileSchema);