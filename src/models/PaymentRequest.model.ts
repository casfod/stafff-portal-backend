import mongoose, { Schema, Document } from 'mongoose';
import { commentSchema, IComment } from './shared/comment.schema';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber, generateDraftCode } from '../utils/generateDocNumber';
import { WorkflowStatus } from './ConceptNote.model';

export interface IPaymentRequest extends Document {
  pmrNumber: string;
  amountInFigure: number;
  amountInWords: string;
  purposeOfExpense: string;
  grantCode: string;
  dateOfExpense: string;
  specialInstruction: string;
  accountNumber: string;
  accountName: string;
  bankName: string;
  createdBy?: mongoose.Types.ObjectId;
  requestedAt?: Date;
  reviewedBy?: mongoose.Types.ObjectId;
  reviewedAt?: Date;
  approvedBy?: mongoose.Types.ObjectId;
  approvedAt?: Date;
  comments: IComment[];
  copiedTo: mongoose.Types.ObjectId[];
  status: WorkflowStatus;
  createdAt: Date;
  updatedAt: Date;
}

const paymentRequestSchema = new Schema<IPaymentRequest>(
  {
    pmrNumber:         { type: String, unique: true, sparse: true, trim: true },
    amountInFigure:    { type: Number, required: true },
    amountInWords:     { type: String, required: true },
    purposeOfExpense:  { type: String, required: true },
    grantCode:         { type: String, required: true, trim: true },
    dateOfExpense:     { type: String, required: true, trim: true },
    specialInstruction:{ type: String, required: true, trim: true },
    accountNumber:     { type: String, required: true, trim: true },
    accountName:       { type: String, required: true, trim: true },
    bankName:          { type: String, required: true, trim: true },
    createdBy:         { type: Schema.Types.ObjectId, ref: 'User', default: null },
    requestedAt:       { type: Date, default: null },
    reviewedBy:        { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewedAt:        { type: Date, default: null },
    approvedBy:        { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedAt:        { type: Date, default: null },
    comments:          [commentSchema],
    copiedTo:          [{ type: Schema.Types.ObjectId, ref: 'User' }],
    status: {
      type: String,
      enum: ['draft', 'pending', 'reviewed', 'approved', 'rejected'],
      default: 'draft',
    },
  },
  { timestamps: true },
);

// ─── Doc number generation ────────────────────────────────────────────────────

paymentRequestSchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === 'pending' && !this.pmrNumber) {
    try {
      this.pmrNumber = await generateDocNumber({ modelName: 'PaymentRequest', prefix: 'PMR-CASFOD' });
    } catch (err) {
      return next(err as Error);
    }
  } else if (this.status === 'draft' && !this.pmrNumber) {
    this.pmrNumber = generateDraftCode('PMR');
  }
  next();
});

/** Auto-stamp timestamps when reviewer/approver is assigned */
paymentRequestSchema.pre('save', function (next) {
  if (this.isModified('reviewedBy') && this.reviewedBy) this.reviewedAt = new Date();
  if (this.isModified('approvedBy') && this.approvedBy) this.approvedAt = new Date();
  if (this.isModified('createdBy') && this.createdBy) this.requestedAt = new Date();
  next();
});

paymentRequestSchema.set('toJSON', toJsonTransform());

export const PaymentRequest = mongoose.model<IPaymentRequest>(
  'PaymentRequest',
  paymentRequestSchema,
);
