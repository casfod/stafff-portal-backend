import mongoose, { Schema, Document } from 'mongoose';
import { commentSchema, IComment } from './shared/comment.schema';
import { itemGroupSchema, IItemGroup } from './shared/itemGroup.schema';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber, generateDraftCode } from '../utils/generateDocNumber';
import { WorkflowStatus } from './ConceptNote.model';

export interface IActivityPeriod {
  from: string;
  to: string;
}

export interface IAdvanceRequest extends Document {
  arNumber: string;
  department: string;
  suggestedSupplier: string;
  address: string;
  finalDeliveryPoint: string;
  city: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  expenseChargedTo: string;
  accountCode: string;
  project?: mongoose.Types.ObjectId;
  periodOfActivity: IActivityPeriod;
  activityDescription: string;
  approvedBy?: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  itemGroups: IItemGroup[];
  comments: IComment[];
  copiedTo: mongoose.Types.ObjectId[];
  status: WorkflowStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const advanceRequestSchema = new Schema<IAdvanceRequest>(
  {
    arNumber:            { type: String, unique: true, sparse: true, trim: true },
    department:          { type: String, required: true, trim: true },
    suggestedSupplier:   { type: String, required: true, trim: true },
    address:             { type: String, required: true, trim: true },
    finalDeliveryPoint:  { type: String, required: true, trim: true },
    city:                { type: String, required: true, trim: true },
    accountNumber:       { type: String, required: true, trim: true },
    accountName:         { type: String, required: true, trim: true },
    bankName:            { type: String, required: true, trim: true },
    expenseChargedTo:    { type: String, required: true, trim: true },
    accountCode:         { type: String, required: true, trim: true },
    project:             { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    periodOfActivity: {
      from: { type: String, required: true, trim: true },
      to:   { type: String, required: true, trim: true },
    },
    activityDescription: { type: String, default: '' },
    approvedBy:          { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedBy:          { type: Schema.Types.ObjectId, ref: 'User', default: null },
    itemGroups:          [itemGroupSchema],
    comments:            [commentSchema],
    copiedTo:            [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['draft', 'pending', 'reviewed', 'approved', 'rejected'],
      default: 'draft',
    },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

// ─── Doc number generation ────────────────────────────────────────────────────

advanceRequestSchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === 'pending' && !this.arNumber) {
    try {
      this.arNumber = await generateDocNumber({ modelName: 'AdvanceRequest', prefix: 'AR-CASFOD' });
    } catch (err) {
      return next(err as Error);
    }
  } else if (this.status === 'draft' && !this.arNumber) {
    this.arNumber = generateDraftCode('AR');
  }
  next();
});

advanceRequestSchema.set('toJSON', toJsonTransform());

export const AdvanceRequest = mongoose.model<IAdvanceRequest>(
  'AdvanceRequest',
  advanceRequestSchema,
);
