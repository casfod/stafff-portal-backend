import mongoose from 'mongoose';
import { z } from 'zod';
import { User, SystemSettings } from '../models';
import { AppError } from '../utils/AppError';
import { updateEmploymentInfoSchema } from '../validators/user.validator';
import { computeEmploymentInfoComplete } from '../utils/employmentInfoCompleteness';

// ─── Types (single source: inferred from the Zod schema, not hand-duplicated) ─
export type EmploymentInfoInput = z.infer<typeof updateEmploymentInfoSchema>;

// ─── Permission check ──────────────────────────────────────────────────────
export async function canUpdateEmploymentInfo(
  userId: string,
): Promise<{ allowed: boolean; reason?: string }> {
  const user = await User.findById(userId).select('employmentInfo.isEmploymentInfoLocked');
  if (!user) return { allowed: false, reason: 'User not found' };

  if (user.employmentInfo?.isEmploymentInfoLocked) {
    return { allowed: false, reason: 'Your employment information update access has been locked' };
  }

  const settings = await SystemSettings.findOne();
  if (settings?.globalEmploymentInfoLock) {
    return { allowed: false, reason: 'Employment information updates are currently disabled globally' };
  }

  return { allowed: true };
}

function buildUpdateObject(data: EmploymentInfoInput): Record<string, any> {
  const update: Record<string, any> = {};
  for (const section of ['personalDetails', 'jobDetails', 'emergencyContact', 'bankDetails'] as const) {
    const sectionData = data[section];
    if (!sectionData) continue;
    for (const [key, val] of Object.entries(sectionData)) {
      if (val !== undefined) update[`employmentInfo.${section}.${key}`] = val;
    }
  }
  return update;
}

// ─── Self-service update ────────────────────────────────────────────────────
export async function updateEmploymentInfo(userId: string, data: EmploymentInfoInput) {
  const { allowed, reason } = await canUpdateEmploymentInfo(userId);
  if (!allowed) throw new AppError(reason ?? 'Locked', 403);

  const updateObj = buildUpdateObject(data);
  updateObj['employmentInfo.isProfileComplete'] = computeEmploymentInfoComplete(data);

  const user = await User.findByIdAndUpdate(
    userId,
    { $set: updateObj },
    { new: true, runValidators: false, select: 'employmentInfo firstName lastName email' },
  );
  if (!user) throw new AppError('User not found', 404);
  return user;
}

// ─── Admin/super-admin bypass update (ignores the lock) ────────────────────
export async function superAdminUpdateEmploymentInfo(
  adminId: string,
  targetUserId: string,
  data: EmploymentInfoInput,
) {
  const target = await User.findById(targetUserId).select('_id');
  if (!target) throw new AppError('User not found', 404);

  const updateObj = buildUpdateObject(data);
  updateObj['employmentInfo.isProfileComplete'] = computeEmploymentInfoComplete(data);

  const user = await User.findByIdAndUpdate(
    targetUserId,
    { $set: updateObj },
    { new: true, runValidators: false, select: 'employmentInfo firstName lastName email' },
  );
  if (!user) throw new AppError('User not found', 404);

  console.log(`Admin ${adminId} updated employment info for user ${targetUserId}`);
  return user;
}

// ─── Toggle global lock ──────────────────────────────────────────────────────
export async function toggleGlobalLock(adminId: string, enabled: boolean) {
  let settings = await SystemSettings.findOne();
  if (!settings) {
    settings = await SystemSettings.create({
      globalEmploymentInfoLock: enabled,
      lastUpdatedBy: adminId,
      lastUpdatedAt: new Date(),
    });
  } else {
    settings.globalEmploymentInfoLock = enabled;
    settings.lastUpdatedBy = new mongoose.Types.ObjectId(adminId);
    settings.lastUpdatedAt = new Date();
    await settings.save();
  }
  return settings;
}

// ─── Toggle per-user lock ─────────────────────────────────────────────────────
export async function toggleUserLock(adminId: string, userId: string, locked: boolean) {
  const user = await User.findByIdAndUpdate(
    userId,
    { $set: { 'employmentInfo.isEmploymentInfoLocked': locked } },
    { new: true, runValidators: false, select: 'employmentInfo.isEmploymentInfoLocked' },
  );
  if (!user) throw new AppError('User not found', 404);
  return user;
}

// ─── Get single user employment info ─────────────────────────────────────────
export async function getUserEmploymentInfo(userId: string) {
  const user = await User.findById(userId).select('employmentInfo firstName lastName email position');
  if (!user) throw new AppError('User not found', 404);

  return {
    employmentInfo: user.employmentInfo ?? {},
    isProfileComplete: user.employmentInfo?.isProfileComplete ?? false,
    canUpdate: !user.employmentInfo?.isEmploymentInfoLocked,
    isLocked: user.employmentInfo?.isEmploymentInfoLocked ?? false,
    firstName: user.firstName,
    lastName: user.lastName,
    email: user.email,
    position: user.position,
  };
}

// ─── Get all users' employment info status (admin view) ──────────────────────
export async function getAllEmploymentInfoStatus() {
  return User.aggregate([
    {
      $project: {
        _id: 0,
        id: '$_id',
        firstName: 1,
        lastName: 1,
        email: 1,
        employmentInfo: {
          isProfileComplete: '$employmentInfo.isProfileComplete',
          isEmploymentInfoLocked: '$employmentInfo.isEmploymentInfoLocked',
          personalDetails: { fullName: '$employmentInfo.personalDetails.fullName' },
          jobDetails: { title: '$employmentInfo.jobDetails.title' },
        },
      },
    },
  ]);
}

// ─── Get global settings ──────────────────────────────────────────────────────
export async function getGlobalSettings() {
  return (await SystemSettings.findOne()) ?? { globalEmploymentInfoLock: false };
}