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

export type ReviewDecision = 'pending' | 'approved' | 'rejected';

export interface IPurchaseRequest extends Document {
  pcrNumber: string;
  department: string;
  suggestedSupplier: string;
  address: string;
  finalDeliveryPoint: string;
  city: string;
  periodOfActivity: IActivityPeriod;
  activityDescription: string;
  expenseChargedTo: string;
  accountCode: string;
  project?: mongoose.Types.ObjectId;
  financeReviewBy?: mongoose.Types.ObjectId;
  financeReviewStatus: ReviewDecision;
  procurementReviewBy?: mongoose.Types.ObjectId;
  procurementReviewStatus: ReviewDecision;
  // reviewedBy?: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  itemGroups: IItemGroup[];
  comments: IComment[];
  copiedTo: mongoose.Types.ObjectId[];
  status: WorkflowStatus;
  createdBy: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const purchaseRequestSchema = new Schema<IPurchaseRequest>(
  {
    pcrNumber:         { type: String, unique: true, trim: true },
    department:        { type: String, required: true, trim: true },
    suggestedSupplier: { type: String, required: true, trim: true },
    address:           { type: String, required: true, trim: true },
    finalDeliveryPoint:{ type: String, required: true, trim: true },
    city:              { type: String, required: true, trim: true },
    periodOfActivity: {
      from: { type: String, required: true, trim: true },
      to:   { type: String, required: true, trim: true },
    },
    activityDescription:  { type: String, default: '' },
    expenseChargedTo:     { type: String, required: true, trim: true },
    accountCode:          { type: String, required: true, trim: true },
    project:              { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    financeReviewBy:      { type: Schema.Types.ObjectId, ref: 'User', default: null },
    financeReviewStatus:  { type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    procurementReviewBy:  { type: Schema.Types.ObjectId, ref: 'User', default: null },
    procurementReviewStatus:{ type: String, enum: ['pending', 'approved', 'rejected'], default: 'pending' },
    // reviewedBy:           { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy:           { type: Schema.Types.ObjectId, ref: 'User', default: null },
    itemGroups:           [itemGroupSchema],
    comments:             [commentSchema],
    copiedTo:             [{ type: Schema.Types.ObjectId, ref: 'User' }],
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

purchaseRequestSchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === 'pending' && !this.pcrNumber) {
    try {
      this.pcrNumber = await generateDocNumber({ modelName: 'PurchaseRequest', prefix: 'PCR-CASFOD' });
    } catch (err) {
      return next(err as Error);
    }
  } else if (this.status === 'draft' && !this.pcrNumber) {
    this.pcrNumber = generateDraftCode('PCR');
  }
  next();
});

purchaseRequestSchema.set('toJSON', toJsonTransform());

export const PurchaseRequest = mongoose.model<IPurchaseRequest>(
  'PurchaseRequest',
  purchaseRequestSchema,
);
