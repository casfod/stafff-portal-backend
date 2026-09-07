// src/services/leave.helpers.ts
import mongoose from "mongoose";
import { Leave, LeaveBalance } from "../models";
import type { ILeave } from "../models";
import type { LeaveType } from "../models/Leave.model";
import type { CurrentUser } from "./shared/types";

export interface LeaveTypeConfig {
  maxDays: number;
  description: string;
  isCalendarDays: boolean;
  balanceKey: string;
}

export const LEAVE_TYPE_CONFIG: Record<LeaveType, LeaveTypeConfig> = {
  "Annual leave": {
    maxDays: 24,
    description: "24 days",
    isCalendarDays: false,
    balanceKey: "annualLeave",
  },
  "Compassionate leave": {
    maxDays: 10,
    description: "10 days Max",
    isCalendarDays: false,
    balanceKey: "compassionateLeave",
  },
  "Sick leave": {
    maxDays: 12,
    description: "12 Days",
    isCalendarDays: false,
    balanceKey: "sickLeave",
  },
  "Maternity leave": {
    maxDays: 90,
    description: "90 Working days",
    isCalendarDays: false,
    balanceKey: "maternityLeave",
  },
  "Paternity leave": {
    maxDays: 14,
    description: "14 Calendar Days",
    isCalendarDays: true,
    balanceKey: "paternityLeave",
  },
  "Emergency leave": {
    maxDays: 5,
    description: "5 days",
    isCalendarDays: false,
    balanceKey: "emergencyLeave",
  },
  "Study Leave": {
    maxDays: 10,
    description: "10 working days",
    isCalendarDays: false,
    balanceKey: "studyLeave",
  },
  "Leave without pay": {
    maxDays: 365,
    description: "Up to 1 year",
    isCalendarDays: true,
    balanceKey: "leaveWithoutPay",
  },
};

/**
 * Transform a document and its populated nested values to replace _id with id.
 */
export function transformDocument<T = any>(doc: T): T {
  if (doc === null || doc === undefined) return null as T;
  if (Array.isArray(doc)) return doc.map((item) => transformDocument(item)) as T;
  if (typeof doc !== "object") return doc;

  if (typeof (doc as any).toJSON === "function") {
    return transformDocument((doc as any).toJSON());
  }

  const result: Record<string, any> = {};
  for (const [key, value] of Object.entries(doc as Record<string, any>)) {
    if (key === "__v") continue;
    if (key === "_id") {
      result.id = value?.toString ? value.toString() : value;
      continue;
    }
    result[key] = transformDocument(value);
  }

  return result as T;
}

/**
 * Transform an array of documents
 */
export function transformDocuments<T = any>(docs: T[]): T[] {
  if (!Array.isArray(docs)) return [];
  return docs.map(doc => transformDocument(doc));
}

export function calculateDaysBetween(
  startDate: Date | string,
  endDate: Date | string,
  isCalendarDays = false
): number {
  const start = new Date(startDate);
  const end = new Date(endDate);
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error("Invalid date format");
  }

  if (isCalendarDays) {
    return (
      Math.ceil(Math.abs(end.getTime() - start.getTime()) / 86_400_000) + 1
    );
  }

  let workingDays = 0;
  const cur = new Date(start);
  while (cur <= end) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) workingDays++;
    cur.setDate(cur.getDate() + 1);
  }
  return workingDays;
}

export async function getOrCreateLeaveBalance(userId: mongoose.Types.ObjectId) {
  let bal = await LeaveBalance.findOne({ user: userId });
  if (!bal) {
    bal = new LeaveBalance({ user: userId });
    await bal.save();
  } else if (bal.resetForNewYear()) {
    await bal.save();
  }
  return bal;
}

export async function validateLeaveApplication(
  userId: mongoose.Types.ObjectId,
  leaveType: LeaveType,
  totalDays: number
) {
  const config = LEAVE_TYPE_CONFIG[leaveType];
  if (!config) throw new Error(`Invalid leave type: ${leaveType}`);

  const bal = await getOrCreateLeaveBalance(userId);
  const field = (bal as any)[config.balanceKey];
  if (!field) throw new Error(`Invalid leave type config for: ${leaveType}`);

  if (field.accrued >= field.maxDays) {
    throw new Error(
      `You have exhausted your ${leaveType} for this year (${field.accrued}/${field.maxDays} days)`
    );
  }
  if (totalDays > field.balance) {
    throw new Error(
      `Requested ${totalDays} days exceeds available balance of ${field.balance} for ${leaveType}`
    );
  }

  return {
    leaveBalance: bal,
    availableBalance: field.balance,
    balanceKey: config.balanceKey,
  };
}

export async function updateLeaveBalances(
  leaveId: string,
  newStatus: string,
  oldStatus: string | null
) {
  const leave = await Leave.findById(leaveId);
  if (!leave) return;

  const config = LEAVE_TYPE_CONFIG[leave.leaveType];
  if (!config) return;

  const bal = await LeaveBalance.findOne({ user: leave.user });
  if (!bal) return;

  const field = (bal as any)[config.balanceKey];
  const days = leave.totalDaysApplied;

  if (!oldStatus && newStatus === "pending") {
    field.totalApplied += days;
  } else if (oldStatus === "draft" && newStatus === "pending") {
    field.totalApplied += days;
  } else if (oldStatus === "pending" && newStatus === "approved") {
    field.totalApplied -= days;
    field.accrued += days;
    (leave as any).amountAccruedLeave = days;
  } else if (oldStatus === "pending" && newStatus === "rejected") {
    field.totalApplied -= days;
  } else if (oldStatus === "reviewed" && newStatus === "approved") {
    field.totalApplied -= days;
    field.accrued += days;
    (leave as any).amountAccruedLeave = days;
  } else if (oldStatus === "reviewed" && newStatus === "rejected") {
    field.totalApplied -= days;
  } else if (oldStatus === "approved" && newStatus === "rejected") {
    field.accrued -= days;
    (leave as any).amountAccruedLeave = 0;
  } else if (
    ["pending", "reviewed"].includes(oldStatus ?? "") &&
    newStatus === "deleted"
  ) {
    field.totalApplied -= days;
  } else if (oldStatus === "approved" && newStatus === "deleted") {
    field.accrued -= days;
    (leave as any).amountAccruedLeave = 0;
  }

  field.balance = field.maxDays - (field.totalApplied + field.accrued);
  if (field.balance < 0) {
    throw new Error(`Balance would become negative for ${leave.leaveType}`);
  }

  await bal.save();
  await leave.save();
}

export function buildLeaveListQuery(
  params: { search?: string },
  currentUser: CurrentUser
) {
  const { search } = params;
  const query: Record<string, unknown> = {};

  if (search) {
    const re = new RegExp(search.trim().split(/\s+/).join("|"), "i");
    query.$or = [
      { leaveNumber: re },
      { staffName: re },
      { leaveType: re },
      { status: re },
    ];
  }

  const uid = currentUser._id;
  switch (currentUser.role) {
    case "STAFF":
      query.$or = [{ user: uid }, { approvedBy: uid }, { copiedTo: uid }];
      break;
    case "ADMIN":
      query.$or = [
        { user: uid },
        { approvedBy: uid },
        { copiedTo: uid },
      ];
      break;
    case "REVIEWER":
      query.$or = [{ user: uid }, { approvedBy: uid }, { copiedTo: uid }];
      break;
    case "SUPER-ADMIN":
      query.$or = [
        { status: { $ne: "draft" } },
        { user: uid, status: "draft" },
        { approvedBy: uid },
        { copiedTo: uid },
      ];
      break;
    default:
      throw new Error("Invalid user role");
  }

  return query;
}

export function buildLeaveDraftData(
  currentUser: CurrentUser,
  data: Partial<ILeave>
) {
  const draftData: Record<string, any> = {
    user: currentUser._id,
    staffName: `${currentUser.firstName} ${currentUser.lastName}`,
    staffRole: currentUser.role,
    status: "draft",
    leaveBalanceAtApplication: 0,
  };

  for (const field of [
    "leaveType",
    "startDate",
    "endDate",
    "reasonForLeave",
    "contactDuringLeave",
    "reviewedBy",
    "leaveCover",
  ] as const) {
    if ((data as any)[field] !== undefined) {
      draftData[field] = (data as any)[field];
    }
  }

  if (draftData.startDate && draftData.endDate && draftData.leaveType) {
    const cfg = LEAVE_TYPE_CONFIG[draftData.leaveType as LeaveType];
    if (cfg) {
      draftData.totalDaysApplied = calculateDaysBetween(
        draftData.startDate,
        draftData.endDate,
        cfg.isCalendarDays
      );
      draftData.leaveTypeConfig = {
        maxDays: cfg.maxDays,
        description: cfg.description,
        isCalendarDays: cfg.isCalendarDays,
      };
    }
  }

  return draftData;
}