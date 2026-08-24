import mongoose, { Schema, Document } from 'mongoose';
import { toJsonTransform } from './shared/toJson';

export interface ILeaveTypeBalance {
  maxDays: number;
  totalApplied: number;
  accrued: number;
  balance: number;
  year: number;
}

export interface ILeaveBalance extends Document {
  user: mongoose.Types.ObjectId;
  annualLeave: ILeaveTypeBalance;
  compassionateLeave: ILeaveTypeBalance;
  sickLeave: ILeaveTypeBalance;
  maternityLeave: ILeaveTypeBalance;
  paternityLeave: ILeaveTypeBalance;
  emergencyLeave: ILeaveTypeBalance;
  studyLeave: ILeaveTypeBalance;
  leaveWithoutPay: ILeaveTypeBalance;
  lastResetYear: number;
  createdAt: Date;
  updatedAt: Date;
  // Methods
  isLeaveTypeAvailable(leaveType: string): boolean;
  getAvailableBalance(leaveType: string): number;
  resetForNewYear(): boolean;
}

// ─── Leave type config map (DRY) ─────────────────────────────────────────────

const LEAVE_TYPES: Record<string, number> = {
  annualLeave:       24,
  compassionateLeave:10,
  sickLeave:         12,
  maternityLeave:    90,
  paternityLeave:    14,
  emergencyLeave:    5,
  studyLeave:        10,
  leaveWithoutPay:   365,
};

function leaveTypeSchema(maxDays: number) {
  const currentYear = () => new Date().getFullYear();
  return {
    maxDays:      { type: Number, default: maxDays },
    totalApplied: { type: Number, default: 0 },
    accrued:      { type: Number, default: 0 },
    balance:      { type: Number, default: maxDays },
    year:         { type: Number, default: currentYear },
  };
}

// ─── Schema ───────────────────────────────────────────────────────────────────

const leaveBalanceSchema = new Schema<ILeaveBalance>(
  {
    user: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      unique: true,
    },
    annualLeave:        leaveTypeSchema(LEAVE_TYPES.annualLeave),
    compassionateLeave: leaveTypeSchema(LEAVE_TYPES.compassionateLeave),
    sickLeave:          leaveTypeSchema(LEAVE_TYPES.sickLeave),
    maternityLeave:     leaveTypeSchema(LEAVE_TYPES.maternityLeave),
    paternityLeave:     leaveTypeSchema(LEAVE_TYPES.paternityLeave),
    emergencyLeave:     leaveTypeSchema(LEAVE_TYPES.emergencyLeave),
    studyLeave:         leaveTypeSchema(LEAVE_TYPES.studyLeave),
    leaveWithoutPay:    leaveTypeSchema(LEAVE_TYPES.leaveWithoutPay),
    lastResetYear:      { type: Number, default: () => new Date().getFullYear() },
  },
  { timestamps: true },
);

// ─── Methods ──────────────────────────────────────────────────────────────────

leaveBalanceSchema.methods.isLeaveTypeAvailable = function (
  leaveType: string,
): boolean {
  const leave = (this as any)[leaveType] as ILeaveTypeBalance | undefined;
  if (!leave) return false;
  return leave.accrued < leave.maxDays;
};

leaveBalanceSchema.methods.getAvailableBalance = function (
  leaveType: string,
): number {
  const leave = (this as any)[leaveType] as ILeaveTypeBalance | undefined;
  return leave?.balance ?? 0;
};

leaveBalanceSchema.methods.resetForNewYear = function (): boolean {
  const currentYear = new Date().getFullYear();
  if (this.lastResetYear >= currentYear) return false;

  for (const type of Object.keys(LEAVE_TYPES)) {
    const leave = (this as any)[type] as ILeaveTypeBalance;
    if (leave) {
      leave.totalApplied = 0;
      leave.accrued      = 0;
      leave.balance      = leave.maxDays;
      leave.year         = currentYear;
    }
  }

  this.lastResetYear = currentYear;
  return true;
};

// ─── toJSON ───────────────────────────────────────────────────────────────────

leaveBalanceSchema.set('toJSON', toJsonTransform());

export const LeaveBalance = mongoose.model<ILeaveBalance>(
  'LeaveBalance',
  leaveBalanceSchema,
);
