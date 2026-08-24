import mongoose, { Schema, Document } from 'mongoose';
import { commentSchema, IComment } from './shared/comment.schema';
import { expenseItemSchema, IExpenseItem } from './shared/itemGroup.schema';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber, generateDraftCode } from '../utils/generateDocNumber';
import { WorkflowStatus } from './ConceptNote.model';

export interface IClaimPeriod {
  from: string;
  to: string;
}

export interface IExpenseClaim extends Document {
  ecNumber: string;
  expenseClaim: IClaimPeriod;
  expenseChargedTo: string;
  accountCode: string;
  project?: mongoose.Types.ObjectId;
  budget: number;
  amountInWords: string;
  expenseReason: string;
  dayOfDeparture: string;
  dayOfReturn: string;
  expenses: IExpenseItem[];
  createdBy: mongoose.Types.ObjectId;
  reviewedBy?: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  status: WorkflowStatus;
  comments: IComment[];
  copiedTo: mongoose.Types.ObjectId[];
  createdAt: Date;
  updatedAt: Date;
}

const expenseClaimsSchema = new Schema<IExpenseClaim>(
  {
    ecNumber:         { type: String, unique: true, sparse: true, trim: true },
    expenseClaim: {
      from: { type: String, required: true, trim: true },
      to:   { type: String, required: true, trim: true },
    },
    expenseChargedTo: { type: String, required: true, trim: true },
    accountCode:      { type: String, required: true, trim: true },
    project:          { type: Schema.Types.ObjectId, ref: 'Project', default: null },
    budget:           { type: Number, required: true },
    amountInWords:    { type: String, required: true },
    expenseReason:    { type: String, required: true, trim: true },
    dayOfDeparture:   { type: String, required: true, trim: true },
    dayOfReturn:      { type: String, required: true, trim: true },
    expenses: {
      type: [expenseItemSchema],
      required: true,
      validate: {
        validator: (v: IExpenseItem[]) => Array.isArray(v) && v.length > 0,
        message: 'At least one expense item is required',
      },
    },
    createdBy:  { type: Schema.Types.ObjectId, ref: 'User', required: true },
    reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    approvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    status: {
      type: String,
      enum: ['draft', 'pending', 'reviewed', 'approved', 'rejected'],
      default: 'draft',
    },
    comments: [commentSchema],
    copiedTo: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

// ─── Doc number generation ────────────────────────────────────────────────────

expenseClaimsSchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === 'pending' && !this.ecNumber) {
    try {
      this.ecNumber = await generateDocNumber({ modelName: 'ExpenseClaims', prefix: 'EC-CASFOD' });
    } catch (err) {
      return next(err as Error);
    }
  } else if (this.status === 'draft' && !this.ecNumber) {
    this.ecNumber = generateDraftCode('EC');
  }
  next();
});

expenseClaimsSchema.set('toJSON', toJsonTransform());

export const ExpenseClaims = mongoose.model<IExpenseClaim>(
  'ExpenseClaims',
  expenseClaimsSchema,
);
