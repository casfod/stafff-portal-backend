const SystemSettings = require("../models/SystemSettingsModel");
const User = require("../models/UserModel");

/**
 * Migrate employment info lock fields from old naming to new naming
 * This ensures backward compatibility with existing data
 */
const migrateEmploymentInfoLockFields = async () => {
  try {
    console.log("Checking for employment info lock fields migration...");

    // Check if ANY user still has the old field
    const userWithOldField = await User.findOne({
      "employmentInfo.canUpdateEmploymentInfo": { $exists: true },
    });

    // Check if system settings needs migration
    const settings = await SystemSettings.findOne();
    const settingsNeedsMigration =
      settings &&
      settings.employmentInfoUpdateEnabled !== undefined &&
      settings.globalEmploymentInfoLock === undefined;

    // If no migration needed for both users and settings
    if (!userWithOldField && !settingsNeedsMigration) {
      console.log("✓ Employment info lock fields are already up to date");
      return { migrated: false, message: "No migration needed" };
    }

    console.log("Migration needed. Starting migration process...");

    // Migrate system settings first
    if (settingsNeedsMigration && settings) {
      console.log("Migrating system settings fields...");

      // If old field exists, use it to set the new field
      if (settings.employmentInfoUpdateEnabled !== undefined) {
        // Invert the value: enabled=true means lock=false
        settings.globalEmploymentInfoLock =
          !settings.employmentInfoUpdateEnabled;

        // Keep the old field for backward compatibility during transition
        // You can remove this line later when all frontend code is updated
        // settings.employmentInfoUpdateEnabled = undefined;

        await settings.save();
        console.log(
          `✓ System settings migrated: globalEmploymentInfoLock = ${settings.globalEmploymentInfoLock}`
        );
      }
    }

    // Migrate all users that still have the old field
    console.log("Migrating user fields...");
    const usersToMigrate = await User.find({
      "employmentInfo.canUpdateEmploymentInfo": { $exists: true },
    });

    let migratedCount = 0;

    for (const user of usersToMigrate) {
      if (
        user.employmentInfo &&
        user.employmentInfo.canUpdateEmploymentInfo !== undefined
      ) {
        // Invert the value: canUpdate=true means isLocked=false
        const canUpdate = user.employmentInfo.canUpdateEmploymentInfo;

        // Create employmentInfo if it doesn't exist
        if (!user.employmentInfo) {
          user.employmentInfo = {};
        }

        // Set the new field
        user.employmentInfo.isEmploymentInfoLocked = !canUpdate;

        // Keep the old field for backward compatibility during transition
        // Uncomment the next line to remove old field after frontend is updated
        // delete user.employmentInfo.canUpdateEmploymentInfo;

        await user.save();
        migratedCount++;
        console.log(
          `✓ Migrated user: ${
            user.email
          } - canUpdate: ${canUpdate} → isLocked: ${!canUpdate}`
        );
      }
    }

    // Also check for users that don't have either field
    const usersWithoutAnyField = await User.find({
      $and: [
        { "employmentInfo.canUpdateEmploymentInfo": { $exists: false } },
        { "employmentInfo.isEmploymentInfoLocked": { $exists: false } },
        { employmentInfo: { $exists: true } },
      ],
    });

    for (const user of usersWithoutAnyField) {
      user.employmentInfo.isEmploymentInfoLocked = false; // Default: not locked
      await user.save();
      console.log(
        `✓ Added default isEmploymentInfoLocked=false for user: ${user.email}`
      );
      migratedCount++;
    }

    console.log(`✓ Migration completed. Migrated ${migratedCount} users.`);
    return {
      migrated: true,
      message: "Migration completed successfully",
      usersMigrated: migratedCount,
      settingsMigrated: settingsNeedsMigration,
    };
  } catch (error) {
    console.error("Migration failed:", error);
    throw error;
  }
};

/**
 * Initialize or update system settings
 */
const initializeSystemSettings = async () => {
  try {
    const settingsCount = await SystemSettings.countDocuments();

    if (settingsCount === 0) {
      // Create default settings with new field names
      await SystemSettings.create({
        globalEmploymentInfoLock: false, // Default: not locked globally
        lastUpdatedAt: new Date(),
      });
      console.log("✓ System settings initialized with default values");
    } else {
      console.log("Starting user migration...");
      // Run migration to ensure all data is consistent
      await migrateEmploymentInfoLockFields();
    }

    console.log("✓ System settings initialization completed");
    return { success: true, message: "System settings initialized" };
  } catch (error) {
    console.error("System settings initialization failed:", error);
    throw error;
  }
};

/**
 * Get system settings with backward compatibility
 */
const getSystemSettings = async () => {
  let settings = await SystemSettings.findOne();

  if (!settings) {
    settings = await SystemSettings.create({
      globalEmploymentInfoLock: false,
      lastUpdatedAt: new Date(),
    });
  } else {
    // Ensure settings have both old and new fields for backward compatibility
    const needsUpdate = false;

    if (settings.globalEmploymentInfoLock === undefined) {
      // If only old field exists, migrate it
      if (settings.employmentInfoUpdateEnabled !== undefined) {
        settings.globalEmploymentInfoLock =
          !settings.employmentInfoUpdateEnabled;
      } else {
        settings.globalEmploymentInfoLock = false;
      }
      await settings.save();
    }

    // Always ensure the old field exists for backward compatibility
    if (
      settings.employmentInfoUpdateEnabled === undefined &&
      settings.globalEmploymentInfoLock !== undefined
    ) {
      settings.employmentInfoUpdateEnabled = !settings.globalEmploymentInfoLock;
      await settings.save();
    }
  }

  return settings;
};

/**
 * Update system settings with backward compatibility
 */
const updateSystemSettings = async (updates, userId) => {
  let settings = await SystemSettings.findOne();

  if (!settings) {
    settings = new SystemSettings();
  }

  // Handle both old and new field names
  if (updates.employmentInfoUpdateEnabled !== undefined) {
    updates.globalEmploymentInfoLock = !updates.employmentInfoUpdateEnabled;
  }

  if (updates.globalEmploymentInfoLock !== undefined) {
    updates.employmentInfoUpdateEnabled = !updates.globalEmploymentInfoLock;
  }

  // Update fields
  Object.keys(updates).forEach((key) => {
    if (
      key !== "_id" &&
      key !== "__v" &&
      key !== "createdAt" &&
      key !== "updatedAt"
    ) {
      settings[key] = updates[key];
    }
  });

  settings.lastUpdatedBy = userId;
  settings.lastUpdatedAt = new Date();

  await settings.save();

  return settings;
};

/**
 * Force re-run migration
 */
const forceReRunMigration = async () => {
  console.log("Force re-running employment info lock migration...");
  return await migrateEmploymentInfoLockFields();
};

/**
 * Get detailed migration status
 */
const getMigrationStatus = async () => {
  const settings = await SystemSettings.findOne();

  // User statistics
  const totalUsers = await User.countDocuments();
  const usersWithNewField = await User.countDocuments({
    "employmentInfo.isEmploymentInfoLocked": { $exists: true },
  });
  const usersWithOldField = await User.countDocuments({
    "employmentInfo.canUpdateEmploymentInfo": { $exists: true },
  });
  const usersWithBothFields = await User.countDocuments({
    $and: [
      { "employmentInfo.isEmploymentInfoLocked": { $exists: true } },
      { "employmentInfo.canUpdateEmploymentInfo": { $exists: true } },
    ],
  });
  const usersWithNoFields = await User.countDocuments({
    $and: [
      { "employmentInfo.isEmploymentInfoLocked": { $exists: false } },
      { "employmentInfo.canUpdateEmploymentInfo": { $exists: false } },
      { employmentInfo: { $exists: true } },
    ],
  });

  // Sample users that still need migration
  const sampleUsersNeedingMigration = await User.find({
    "employmentInfo.canUpdateEmploymentInfo": { $exists: true },
  })
    .limit(5)
    .select("email employmentInfo.canUpdateEmploymentInfo");

  return {
    systemSettings: {
      exists: !!settings,
      globalEmploymentInfoLock: settings?.globalEmploymentInfoLock,
      employmentInfoUpdateEnabled: settings?.employmentInfoUpdateEnabled,
      needsMigration:
        settings &&
        settings.employmentInfoUpdateEnabled !== undefined &&
        settings.globalEmploymentInfoLock === undefined,
    },
    users: {
      total: totalUsers,
      withNewField: usersWithNewField,
      withOldField: usersWithOldField,
      withBothFields: usersWithBothFields,
      withNoFields: usersWithNoFields,
      needsMigration: usersWithOldField > 0,
      sampleUsersNeedingMigration: sampleUsersNeedingMigration,
    },
    recommendations:
      usersWithOldField > 0
        ? "Run forceReRunMigration() to migrate users with old fields"
        : "All users are migrated",
  };
};

module.exports = {
  initializeSystemSettings,
  getSystemSettings,
  updateSystemSettings,
  migrateEmploymentInfoLockFields,
  forceReRunMigration,
  getMigrationStatus,
};
