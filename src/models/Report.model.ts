// src/models/Report.model.ts
import mongoose, { Schema, Document } from 'mongoose';
import { commentSchema, IComment } from './shared/comment.schema';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber, generateDraftCode } from '../utils/generateDocNumber';
import { WorkflowStatus } from './ConceptNote.model';

export interface IActivityPeriod {
  from: string;
  to: string;
}

export interface IReport extends Document {
  reportNumber: string;
  activityType: 'Workshop' | 'Training' | 'Sector Meeting' | 'Other';
  otherActivitySpecification?: string;
  reportType: 'Weekly Report' | 'Monthly Report' | 'Quarterly Report' | 'Annual Report' | 'Activity report';
  reportTitle: string;
  reportingPeriod: IActivityPeriod;
  project?: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  comments: IComment[];
  copiedTo: mongoose.Types.ObjectId[];
  status: WorkflowStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const reportSchema = new Schema<IReport>(
  {
    reportNumber: { type: String, unique: true, sparse: true, trim: true },
    activityType: {
      type: String,
      enum: ['Workshop', 'Training', 'Sector Meeting', 'Other'],
      required: true,
      trim: true,
    },
    otherActivitySpecification: {
      type: String,
      trim: true,
      required: function() {
        return this.activityType === 'Other';
      },
    },
    reportType: {
      type: String,
      enum: ['Weekly Report', 'Monthly Report', 'Quarterly Report', 'Annual Report', 'Activity report'],
      required: true,
      trim: true,
    },
    reportTitle: { type: String, required: true, trim: true },
    reportingPeriod: {
      from: { type: String, required: true, trim: true },
      to: { type: String, required: true, trim: true },
    },
    project: { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    comments: [commentSchema],
    copiedTo: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['draft', 'pending', 'reviewed', 'approved', 'rejected'],
      default: 'draft',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true }
);

// ─── Doc number generation ────────────────────────────────────────────────────

reportSchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === 'pending' && !this.reportNumber) {
    try {
      this.reportNumber = await generateDocNumber({ 
        modelName: 'Report', 
        prefix: 'RPT-CASFOD',
        countFilter: { status: { $nin: ['draft'] } }
      });
    } catch (err) {
      return next(err as Error);
    }
  } else if (this.status === 'draft' && !this.reportNumber) {
    this.reportNumber = generateDraftCode('RPT');
  }
  next();
});

reportSchema.set('toJSON', toJsonTransform());

export const Report = mongoose.model<IReport>('Report', reportSchema);