import mongoose, { Schema, Document } from 'mongoose';
import { toJsonTransform } from './shared/toJson';

export interface IAccountCode {
  name: string;
}

export interface ISector {
  name: 'Education' | 'Protection' | 'WASH' | 'Nutrition/Health' | 'Livelihood';
  percentage: number;
}

export interface IImplementationPeriod {
  from: string;
  to: string;
}

export interface IMilestone {
  title: string;
  description: string;
  status: 'pending' | 'active' | 'completed';
};

// Project.model.ts - Updated interface
export interface IProject extends Document {
  projectTitle: string;
  donor: string;
  projectPartners: string[];
  projectCode: string;
  implementationPeriod: IImplementationPeriod;
  projectBudget: number;
  accountCodes: IAccountCode[];
  sectors: ISector[];
  projectLocations: string[];
  targetBeneficiaries: string[];
  projectObjectives: string;
  milestones: IMilestone[]; // ✅ Make it required (will default to [])
  projectSummary: string;
  status: 'ongoing' | 'completed' | 'cancelled';
  createdAt: Date;
  updatedAt: Date;
}

const projectSchema = new Schema<IProject>(
  {
    projectTitle: {
      type: String,
      required: true,
      maxlength: 200,
      trim: true,
    },
    donor: {
      type: String,
      required: true,
      maxlength: 50,
      trim: true,
    },
    projectPartners: [{ type: String }],
    projectCode: {
      type: String,
      required: true,
      maxlength: 50,
      trim: true,
    },
    implementationPeriod: {
      from: { type: String, required: true, trim: true },
      to:   { type: String, required: true, trim: true },
    },
    projectBudget: { type: Number, required: true },
    accountCodes: [
      {
        name: { type: String, required: true, trim: true },
      },
    ],
    sectors: [
      {
        name: {
          type: String,
          enum: ['Education', 'Protection', 'WASH', 'Nutrition/Health', 'Livelihood'],
          required: true,
        },
        percentage: { type: Number, min: 0, max: 100, required: true },
      },
    ],
    projectLocations:    [{ type: String, trim: true }],
    targetBeneficiaries: [{ type: String, trim: true }],
    projectObjectives: {
      type: String,
      required: true,
      trim: true,
    },
   // Project.model.ts - Better approach
    milestones: {
      type: [{
        title: {
          type: String,
          required: true,
          maxlength: 200,
          trim: true,
        },
        description: {
          type: String,
          required: true,
          maxlength: 1000,
          trim: true,
        },
        status: {
          type: String,
          enum: ['pending', 'active', 'completed'],
          default: "pending"
        },
      }],
      default: [], // ✅ Default to empty array
    },
    projectSummary: {
      type: String,
      required: true,
      maxlength: 4000,
      trim: true,
    },
    status: {
      type: String,
      enum: ['ongoing', 'completed', 'cancelled'],
      default: 'ongoing',
    },
  },
  { timestamps: true },
);

projectSchema.set('toJSON', toJsonTransform());

export const Project = mongoose.model<IProject>('Project', projectSchema);
