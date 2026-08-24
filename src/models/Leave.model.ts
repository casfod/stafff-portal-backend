import mongoose, { Schema, Document } from 'mongoose';
import { commentSchema, IComment } from './shared/comment.schema';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber, generateDraftCode } from '../utils/generateDocNumber';
import { WorkflowStatus } from './ConceptNote.model';

export type LeaveType =
  | 'Annual leave'
  | 'Compassionate leave'
  | 'Sick leave'
  | 'Maternity leave'
  | 'Paternity leave'
  | 'Emergency leave'
  | 'Study Leave'
  | 'Leave without pay';

export interface ILeaveTypeConfig {
  maxDays: number;
  description?: string;
  isCalendarDays: boolean;
}

export interface ILeaveCover {
  nameOfCover?: string;
  signature?: string;
}

export interface ILeave extends Document {
  leaveNumber: string;
  user: mongoose.Types.ObjectId;
  staffName: string;
  staffRole: string;
  leaveType: LeaveType;
  leaveTypeConfig: ILeaveTypeConfig;
  startDate: Date;
  endDate: Date;
  totalDaysApplied: number;
  leaveBalanceAtApplication: number;
  amountAccruedLeave: number;
  createdBy?: mongoose.Types.ObjectId;
  approvedBy?: mongoose.Types.ObjectId;
  status: WorkflowStatus;
  comments: IComment[];
  copiedTo: mongoose.Types.ObjectId[];
  leaveCover?: ILeaveCover;
  reasonForLeave?: string;
  contactDuringLeave?: string;
  isDeleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const leaveSchema = new Schema<ILeave>(
  {
    leaveNumber: { type: String, unique: true, trim: true },
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    staffName: { type: String, required: true, trim: true },
    staffRole: { type: String, required: true, trim: true },
    leaveType: {
      type: String,
      enum: [
        'Annual leave',
        'Compassionate leave',
        'Sick leave',
        'Maternity leave',
        'Paternity leave',
        'Emergency leave',
        'Study Leave',
        'Leave without pay',
      ],
      required: true,
    },
    leaveTypeConfig: {
      maxDays:        { type: Number, required: true },
      description:    { type: String },
      isCalendarDays: { type: Boolean, default: false },
    },
    startDate:                 { type: Date, required: true },
    endDate:                   { type: Date, required: true },
    totalDaysApplied:          { type: Number, required: true },
    leaveBalanceAtApplication: { type: Number, required: true },
    amountAccruedLeave:        { type: Number, default: 0 },
    createdBy:                { type: Schema.Types.ObjectId, ref: 'User', default: null },
    approvedBy:                { type: Schema.Types.ObjectId, ref: 'User', default: null },
    status: {
      type: String,
      enum: ['draft', 'pending', 'reviewed', 'approved', 'rejected'],
      default: 'draft',
    },
    comments: [commentSchema],
    copiedTo: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    leaveCover: {
      nameOfCover: { type: String, trim: true },
      signature:   { type: String, trim: true },
    },
    reasonForLeave:     { type: String, trim: true },
    contactDuringLeave: { type: String, trim: true },
    isDeleted:          { type: Boolean, default: false },
  },
  { timestamps: true },
);

// ─── Doc number generation ────────────────────────────────────────────────────

leaveSchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === 'pending' && !this.leaveNumber) {
    try {
      this.leaveNumber = await generateDocNumber({
        modelName: 'Leave',
        prefix: 'LV-CASFOD-',
      });
    } catch (err) {
      return next(err as Error);
    }
  } else if (this.status === 'draft' && !this.leaveNumber) {
    this.leaveNumber = generateDraftCode('LV');
  }
  next();
});

leaveSchema.set('toJSON', toJsonTransform());

export const Leave = mongoose.model<ILeave>('Leave', leaveSchema);
