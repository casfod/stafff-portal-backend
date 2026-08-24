import mongoose, { Schema, Document } from 'mongoose';
import { commentSchema, IComment } from './shared/comment.schema';
import { toJsonTransform } from './shared/toJson';
import { generateDocNumber, generateDraftCode } from '../utils/generateDocNumber';

export type AppraisalStatus = 'draft' | 'pending' | 'approved' | 'rejected';
export type ObjectiveRating = '' | 'Achieved' | 'Partly Achieved' | 'Not Achieved';
export type PerformanceRating = 'Pending' | 'Needs Improvement' | 'Meets Expectations' | 'Exceeds Expectations';
export type OverallRating = 'Pending' | 'Meets Requirements' | 'Partly Meets Requirements' | 'Does Not Meet Requirements';
export type CompletionStatus = 'pending' | 'completed';

// ─── Sub-interfaces ───────────────────────────────────────────────────────────

export interface IObjectiveRating {
  objective: string;
  employeeRating: {
    rating: ObjectiveRating;
    achievements: string;
  };
  supervisorRating: ObjectiveRating;
  employeePoints: number;
  supervisorPoints: number;
  supervisorRatingStatus: CompletionStatus;
}

export interface IPerformanceArea {
  area:
    | 'Job Knowledge'
    | 'Judgement'
    | 'Reliability'
    | 'Quality & Quantity of Work'
    | 'Interpersonal and Communication Skills'
    | 'Teamwork';
  rating: PerformanceRating;
  supervisorStatus: CompletionStatus;
}

export interface ISafeguarding {
  actionsTaken: string;
  trainingCompleted: 'Yes' | 'Partly' | 'No';
  areasNotUnderstood: string[];
  supervisorStatus: CompletionStatus;
}

export interface ISignatures {
  staffSignature: boolean;
  staffSignatureDate?: Date;
  staffComments?: string;
  supervisorSignature: boolean;
  supervisorSignatureDate?: Date;
  hrComments?: string;
}

export interface IAppraisalScores {
  employeeTotal: number;
  supervisorTotal: number;
  performanceAreasCount: {
    needsImprovement: number;
    meetsExpectations: number;
    exceedsExpectations: number;
  };
}

export interface IAppraisal extends Document {
  appraisalCode: string;
  staffId: mongoose.Types.ObjectId;
  // staffName/position are NOT stored — derive from the populated `staffId`
  // (firstName/lastName, employmentInfo.jobDetails.title). Storing a
  // snapshot here duplicates data the User document already owns and goes
  // stale the moment the person's name or title changes.
  department: string;
  lengthOfTimeInPosition?: string;
  appraisalPeriod: string;
  dateOfAppraisal: Date;
  supervisorId: mongoose.Types.ObjectId;
  // supervisorName is NOT stored — derive from the populated `supervisorId`.
  lengthOfTimeSupervised?: string;
  supervisorStatus: CompletionStatus;
  objectives: IObjectiveRating[];
  safeguarding: ISafeguarding;
  performanceAreas: IPerformanceArea[];
  supervisorComments?: string;
  overallRating: OverallRating;
  futureGoals?: string;
  signatures: ISignatures;
  scores: IAppraisalScores;
  comments: IComment[];
  createdBy: mongoose.Types.ObjectId;
  staffStrategy?: mongoose.Types.ObjectId;
  status: AppraisalStatus;
  approvedBy?: mongoose.Types.ObjectId;
  copiedTo: mongoose.Types.ObjectId[];
  submittedByEmployee: boolean;
  submittedBySupervisor: boolean;
  completedAt?: Date;
  pdfUrl: string;
  cloudinaryId: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Sub-schemas ──────────────────────────────────────────────────────────────

const objectiveRatingSchema = new Schema<IObjectiveRating>(
  {
    objective: { type: String, required: true, trim: true },
    employeeRating: {
      rating:       { type: String, enum: ['', 'Achieved', 'Partly Achieved', 'Not Achieved'], default: '' },
      achievements: { type: String, trim: true, default: '' },
    },
    supervisorRating:       { type: String, enum: ['', 'Achieved', 'Partly Achieved', 'Not Achieved'], default: '' },
    employeePoints:         { type: Number, default: 0 },
    supervisorPoints:       { type: Number, default: 0 },
    supervisorRatingStatus: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  },
  { _id: false },
);

const performanceAreaSchema = new Schema<IPerformanceArea>(
  {
    area: {
      type: String,
      enum: [
        'Job Knowledge',
        'Judgement',
        'Reliability',
        'Quality & Quantity of Work',
        'Interpersonal and Communication Skills',
        'Teamwork',
      ],
      required: true,
    },
    rating:           { type: String, enum: ['Pending', 'Needs Improvement', 'Meets Expectations', 'Exceeds Expectations'], required: true },
    supervisorStatus: { type: String, enum: ['pending', 'completed'], default: 'pending' },
  },
  { _id: false },
);

// ─── Main schema ──────────────────────────────────────────────────────────────

const appraisalSchema = new Schema<IAppraisal>(
  {
    appraisalCode:           { type: String, default: '', unique: true, sparse: true },
    staffId:                 { type: Schema.Types.ObjectId, ref: 'User', required: true },
    department:              { type: String, required: true, trim: true },
    lengthOfTimeInPosition:  { type: String, trim: true },
    appraisalPeriod:         { type: String, required: true, trim: true },
    dateOfAppraisal:         { type: Date, default: Date.now },
    supervisorId:            { type: Schema.Types.ObjectId, ref: 'User', required: true },
    lengthOfTimeSupervised:  { type: String, trim: true },
    supervisorStatus:        { type: String, enum: ['pending', 'completed'], default: 'pending' },
    objectives:              [objectiveRatingSchema],
    safeguarding: {
      actionsTaken:       { type: String, trim: true, default: '' },
      trainingCompleted:  { type: String, enum: ['Yes', 'Partly', 'No'], default: 'No' },
      areasNotUnderstood: [{ type: String, trim: true }],
      supervisorStatus:   { type: String, enum: ['pending', 'completed'], default: 'pending' },
    },
    performanceAreas:    [performanceAreaSchema],
    supervisorComments:  { type: String, trim: true },
    overallRating: {
      type: String,
      enum: ['Pending', 'Meets Requirements', 'Partly Meets Requirements', 'Does Not Meet Requirements'],
      required: true,
    },
    futureGoals: { type: String, trim: true },
    signatures: {
      staffSignature:         { type: Boolean, default: false },
      staffSignatureDate:     { type: Date },
      staffComments:          { type: String, trim: true },
      supervisorSignature:    { type: Boolean, default: false },
      supervisorSignatureDate:{ type: Date },
      hrComments:             { type: String, trim: true },
    },
    scores: {
      employeeTotal:   { type: Number, default: 0 },
      supervisorTotal: { type: Number, default: 0 },
      performanceAreasCount: {
        needsImprovement:   { type: Number, default: 0 },
        meetsExpectations:  { type: Number, default: 0 },
        exceedsExpectations:{ type: Number, default: 0 },
      },
    },
    comments:     [commentSchema],
    createdBy:    { type: Schema.Types.ObjectId, ref: 'User', required: true },
    staffStrategy:{ type: Schema.Types.ObjectId, ref: 'StaffStrategy' },
    status: {
      type: String,
      enum: ['draft', 'pending', 'approved', 'rejected'],
      default: 'draft',
    },
    approvedBy:            { type: Schema.Types.ObjectId, ref: 'User', default: null },
    copiedTo:              [{ type: Schema.Types.ObjectId, ref: 'User' }],
    submittedByEmployee:   { type: Boolean, default: false },
    submittedBySupervisor: { type: Boolean, default: false },
    completedAt:           { type: Date },
    pdfUrl:                { type: String, default: '' },
    cloudinaryId:          { type: String, default: '' },
  },
  { timestamps: true },
);

// ─── Doc number generation ────────────────────────────────────────────────────

appraisalSchema.pre('save', async function (next) {
  if (this.isModified('status') && this.status === 'pending') {
    const isDraftCode = !this.appraisalCode || this.appraisalCode.startsWith('APP-DRAFT-');
    if (isDraftCode) {
      try {
        this.appraisalCode = await generateDocNumber({
          modelName: 'Appraisal',
          prefix: 'APP-CASFOD-',
          countFilter: {
            status: { $nin: ['draft'] },
            appraisalCode: { $regex: '^APP-CASFOD-' },
          },
        });
      } catch (err) {
        return next(err as Error);
      }
    }
  } else if (this.status === 'draft' && !this.appraisalCode) {
    this.appraisalCode = generateDraftCode('APP');
  }
  next();
});

// ─── Score computation ────────────────────────────────────────────────────────

const RATING_POINTS: Record<string, number> = {
  Achieved: 3,
  'Partly Achieved': 2,
  'Not Achieved': 0,
};

appraisalSchema.pre('save', function (next) {
  let employeeTotal = 0;
  let supervisorTotal = 0;
  let allSupervisorDone = true;

  // Objectives
  for (const obj of this.objectives ?? []) {
    obj.employeePoints   = RATING_POINTS[obj.employeeRating?.rating ?? ''] ?? 0;
    obj.supervisorPoints = RATING_POINTS[obj.supervisorRating ?? ''] ?? 0;
    employeeTotal   += obj.employeePoints;
    supervisorTotal += obj.supervisorPoints;

    obj.supervisorRatingStatus = obj.supervisorRating
      ? 'completed'
      : 'pending';
    if (!obj.supervisorRating) allSupervisorDone = false;
  }

  // Performance areas
  const counts = { needsImprovement: 0, meetsExpectations: 0, exceedsExpectations: 0 };
  for (const area of this.performanceAreas ?? []) {
    if (area.rating === 'Needs Improvement')   counts.needsImprovement++;
    if (area.rating === 'Meets Expectations')  counts.meetsExpectations++;
    if (area.rating === 'Exceeds Expectations')counts.exceedsExpectations++;

    area.supervisorStatus = area.rating && area.rating !== 'Pending' ? 'completed' : 'pending';
    if (area.rating === 'Pending') allSupervisorDone = false;
  }

  // Safeguarding
  if (this.safeguarding) {
    this.safeguarding.supervisorStatus =
      this.safeguarding.trainingCompleted !== 'No' ? 'completed' : 'pending';
    if (this.safeguarding.trainingCompleted === 'No') allSupervisorDone = false;
  }

  this.supervisorStatus = allSupervisorDone ? 'completed' : 'pending';
  this.scores = { employeeTotal, supervisorTotal, performanceAreasCount: counts };

  next();
});

appraisalSchema.set('toJSON', toJsonTransform());

export const Appraisal = mongoose.model<IAppraisal>('Appraisal', appraisalSchema);