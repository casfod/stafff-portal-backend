import mongoose, { Schema, Document } from 'mongoose';
import { commentSchema, IComment } from './shared/comment.schema';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber, generateDraftCode } from '../utils/generateDocNumber';

export type StrategyStatus = 'draft' | 'pending' | 'approved' | 'rejected';

export interface IObjective {
  objective: string;
  timeline: string;
  expectedOutcome: string;
  kpi: string;
  possibleChallenges?: string;
  supportRequired?: string;
}

export interface IAccountabilityArea {
  areaName: string;
  objectives: IObjective[];
}

export interface IStaffStrategy extends Document {
  strategyCode: string;
  // staffName/jobTitle are NOT stored — derive from the populated `staffId`
  // (firstName/lastName, employmentInfo.jobDetails.title).
  staffId?: mongoose.Types.ObjectId;
  department: string;
  // `approvedBy` is the single reference to the reviewing supervisor
  // (populated with safe fields). The previous `supervisor` (string) /
  // `supervisorId` (ObjectId) pair was never actually written on create —
  // only `approvedBy` was — so it was dead, misleading duplication.
  date: Date;
  period: string;
  accountabilityAreas: IAccountabilityArea[];
  comments: IComment[];
  createdBy: mongoose.Types.ObjectId;
  status: StrategyStatus;
  approvedBy?: mongoose.Types.ObjectId;
  copiedTo: mongoose.Types.ObjectId[];
  pdfUrl: string;
  cloudinaryId: string;
  createdAt: Date;
  updatedAt: Date;
}

const objectiveSchema = new Schema<IObjective>(
  {
    objective:          { type: String, required: true, trim: true },
    timeline:           { type: String, default: 'Routine', trim: true },
    expectedOutcome:    { type: String, required: true, trim: true },
    kpi:                { type: String, required: true, trim: true },
    possibleChallenges: { type: String, trim: true },
    supportRequired:    { type: String, trim: true },
  },
  { _id: false },
);

const accountabilityAreaSchema = new Schema<IAccountabilityArea>(
  {
    areaName:   { type: String, required: true, trim: true },
    objectives: [objectiveSchema],
  },
  { _id: false },
);

const staffStrategySchema = new Schema<IStaffStrategy>(
  {
    strategyCode:        { type: String, default: '', unique: true, sparse: true },
    staffId:             { type: Schema.Types.ObjectId, ref: 'User' },
    department:          { type: String, required: true, trim: true },
    date:                { type: Date, default: Date.now },
    period:              { type: String, required: true, trim: true },
    accountabilityAreas: [accountabilityAreaSchema],
    comments:            [commentSchema],
    createdBy:           { type: Schema.Types.ObjectId, ref: 'User', required: true },
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected'],
      default: 'draft',
    },
    approvedBy:   { type: Schema.Types.ObjectId, ref: 'User', default: null },
    copiedTo:     [{ type: Schema.Types.ObjectId, ref: 'User' }],
    pdfUrl:       { type: String, default: '' },
    cloudinaryId: { type: String, default: '' },
  },
  { timestamps: true },
);

// ─── Doc number generation ────────────────────────────────────────────────────

staffStrategySchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === 'pending' && !this.strategyCode) {
    try {
      this.strategyCode = await generateDocNumber({
        modelName: 'StaffStrategy',
        prefix: 'SS-CASFOD-',
      });
    } catch (err) {
      return next(err as Error);
    }
  } else if (this.status === 'draft' && !this.strategyCode) {
    this.strategyCode = generateDraftCode('SS');
  }
  next();
});

staffStrategySchema.set('toJSON', toJsonTransform());

export const StaffStrategy = mongoose.model<IStaffStrategy>(
  'StaffStrategy',
  staffStrategySchema,
);