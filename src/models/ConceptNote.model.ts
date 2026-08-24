import mongoose, { Schema, Document } from 'mongoose';
import { commentSchema, IComment } from './shared/comment.schema';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber, generateDraftCode } from '../utils/generateDocNumber';

export type WorkflowStatus = 'draft' | 'pending' | 'reviewed' | 'approved' | 'rejected';

export interface IActivityPeriod {
  from: string;
  to: string;
}

export interface IConceptNote extends Document {
  cnNumber: string;
  expenseChargedTo: string;
  accountCode: string;
  project?: mongoose.Types.ObjectId;
  activityTitle: string;
  activityLocation: string;
  activityPeriod: IActivityPeriod;
  backgroundContext: string;
  objectivesPurpose: string;
  detailedActivityDescription: string;
  strategicPlan: string;
  benefitsOfProject: string;
  createdBy: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  status: WorkflowStatus;
  comments: IComment[];
  copiedTo: mongoose.Types.ObjectId[];
  activityBudget: number;
  meansOfVerification: string;
  createdAt: Date;
  updatedAt: Date;
}

const conceptNoteSchema = new Schema<IConceptNote>(
  {
    cnNumber:            { type: String, unique: true, sparse: true, trim: true },
    expenseChargedTo:    { type: String, required: true, trim: true },
    accountCode:         { type: String, required: true, trim: true },
    project:             { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    activityTitle:       { type: String, required: true, trim: true },
    activityLocation:    { type: String, required: true, trim: true },
    activityPeriod: {
      from: { type: String, required: true, trim: true },
      to:   { type: String, required: true, trim: true },
    },
    backgroundContext:           { type: String, required: true, trim: true },
    objectivesPurpose:           { type: String, required: true, trim: true },
    detailedActivityDescription: { type: String, required: true, trim: true },
    strategicPlan:               { type: String, required: true, trim: true },
    benefitsOfProject:           { type: String, required: true, trim: true },
    createdBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['draft', 'pending', 'reviewed', 'approved', 'rejected'],
      default: 'draft',
    },
    comments:  [commentSchema],
    copiedTo:  [{ type: Schema.Types.ObjectId, ref: 'User' }],
    activityBudget:      { type: Number, required: true },
    meansOfVerification: { type: String, required: true, trim: true },
  },
  { timestamps: true },
);

// ─── Doc number generation ────────────────────────────────────────────────────

conceptNoteSchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === 'pending' && !this.cnNumber) {
    try {
      this.cnNumber = await generateDocNumber({ modelName: 'ConceptNote', prefix: 'CN-CASFOD' });
    } catch (err) {
      return next(err as Error);
    }
  } else if (this.status === 'draft' && !this.cnNumber) {
    this.cnNumber = generateDraftCode('CN');
  }
  next();
});

conceptNoteSchema.set('toJSON', toJsonTransform());

export const ConceptNote = mongoose.model<IConceptNote>('ConceptNote', conceptNoteSchema);
