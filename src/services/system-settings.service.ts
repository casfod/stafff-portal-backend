import mongoose from "mongoose";
import { SystemSettings, User } from "../models";
import { ResponseBuilder } from "./shared/response-builder";

// ─── Initialize ───────────────────────────────────────────────────────────────
export async function initializeSystemSettings(): Promise<void> {
  const count = await SystemSettings.countDocuments();
  if (count === 0) {
    await SystemSettings.create({ globalEmploymentInfoLock: false, lastUpdatedAt: new Date() });
    console.log("✓ System settings initialized");
  } else {
    await migrateEmploymentInfoLockFields();
  }
}

// ─── Get settings (always returns a document) ────────────────────────────────
export async function getSystemSettings(): Promise<any> {
  let settings = await SystemSettings.findOne();
  if (!settings) {
    settings = await SystemSettings.create({ globalEmploymentInfoLock: false, lastUpdatedAt: new Date() });
  }
  return ResponseBuilder.single(settings, "System settings retrieved successfully");
}

// ─── Update settings ─────────────────────────────────────────────────────────
export async function updateSystemSettings(
  updates: Partial<{ globalEmploymentInfoLock: boolean }>,
  userId: mongoose.Types.ObjectId
): Promise<any> {
  let settings = await SystemSettings.findOne();
  if (!settings) {
    settings = new SystemSettings();
  }

  Object.assign(settings, updates);
  settings.lastUpdatedBy = userId;
  settings.lastUpdatedAt = new Date();
  await settings.save();
  return ResponseBuilder.operation(settings, "System settings updated successfully");
}

// ─── Migration: rename old fields to new ──────────────────────────────────────
export async function migrateEmploymentInfoLockFields(): Promise<any> {
  const userWithOldField = await User.findOne({ "employmentInfo.canUpdateEmploymentInfo": { $exists: true } });
  const settings = await SystemSettings.findOne();
  const settingsNeedsMigration =
    settings && (settings as any).employmentInfoUpdateEnabled !== undefined && settings.globalEmploymentInfoLock === undefined;

  if (!userWithOldField && !settingsNeedsMigration) {
    return ResponseBuilder.single({ migrated: false, message: "No migration needed" }, "Migration check completed");
  }

  if (settingsNeedsMigration && settings) {
    settings.globalEmploymentInfoLock = !(settings as any).employmentInfoUpdateEnabled;
    await settings.save();
  }

  const usersToMigrate = await User.find({ "employmentInfo.canUpdateEmploymentInfo": { $exists: true } });
  let migrated = 0;

  for (const user of usersToMigrate) {
    const canUpdate = (user.employmentInfo as any)?.canUpdateEmploymentInfo;
    if (canUpdate !== undefined) {
      user.employmentInfo.isEmploymentInfoLocked = !canUpdate;
      await user.save();
      migrated++;
    }
  }

  await User.updateMany(
    {
      $and: [
        { "employmentInfo.isEmploymentInfoLocked": { $exists: false } },
        { "employmentInfo.canUpdateEmploymentInfo": { $exists: false } },
        { employmentInfo: { $exists: true } },
      ],
    },
    { $set: { "employmentInfo.isEmploymentInfoLocked": false } }
  );

  return ResponseBuilder.single(
    { migrated: true, message: "Migration completed", usersMigrated: migrated },
    "Migration completed successfully"
  );
}

// ─── Get migration status ─────────────────────────────────────────────────────
export async function getMigrationStatus(): Promise<any> {
  const settings = await SystemSettings.findOne();
  const [total, withNew, withOld] = await Promise.all([
    User.countDocuments(),
    User.countDocuments({ "employmentInfo.isEmploymentInfoLocked": { $exists: true } }),
    User.countDocuments({ "employmentInfo.canUpdateEmploymentInfo": { $exists: true } }),
  ]);

  const data = {
    systemSettings: {
      exists: !!settings,
      globalEmploymentInfoLock: settings?.globalEmploymentInfoLock,
      needsMigration: withOld > 0 || settingsNeedsMigration(settings),
    },
    users: {
      total,
      withNewField: withNew,
      withOldField: withOld,
      needsMigration: withOld > 0,
    },
    recommendations: withOld > 0 ? "Run migrateEmploymentInfoLockFields() to migrate" : "All users are migrated",
  };

  return ResponseBuilder.single(data, "Migration status retrieved successfully");
}

function settingsNeedsMigration(settings: any): boolean {
  return !!(settings && (settings as any).employmentInfoUpdateEnabled !== undefined && settings.globalEmploymentInfoLock === undefined);
}