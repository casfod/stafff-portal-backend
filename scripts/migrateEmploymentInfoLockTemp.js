// scripts/migrateEmploymentInfoLockTemp.js
const mongoose = require("mongoose");

/**
 * Migrate employment info lock fields
 * This function assumes mongoose is already connected
 */
const migrateEmploymentInfoLock = async () => {
  // Check if mongoose is connected
  if (mongoose.connection.readyState !== 1) {
    console.error(
      "Mongoose is not connected. Call this function after database connection is established."
    );
    return;
  }

  const db = mongoose.connection.db;

  try {
    console.log("\nStarting employment info lock migration...");

    // 1. MIGRATE SYSTEM SETTINGS
    console.log("\n--- Migrating System Settings ---");

    const systemSettings = await db.collection("systemsettings").findOne({});

    if (systemSettings) {
      console.log("Found system settings with ID:", systemSettings._id);
      console.log("Current settings:", {
        employmentInfoUpdateEnabled: systemSettings.employmentInfoUpdateEnabled,
        globalEmploymentInfoLock: systemSettings.globalEmploymentInfoLock,
      });

      const updateObj = {};

      // If old field exists and new field doesn't
      if (
        systemSettings.employmentInfoUpdateEnabled !== undefined &&
        systemSettings.globalEmploymentInfoLock === undefined
      ) {
        // Invert the value: enabled=true means lock=false
        updateObj.globalEmploymentInfoLock =
          !systemSettings.employmentInfoUpdateEnabled;
        console.log(
          `Setting globalEmploymentInfoLock to: ${updateObj.globalEmploymentInfoLock} (based on employmentInfoUpdateEnabled: ${systemSettings.employmentInfoUpdateEnabled})`
        );
      }

      // If no lock field at all, set default
      if (
        systemSettings.globalEmploymentInfoLock === undefined &&
        Object.keys(updateObj).length === 0
      ) {
        updateObj.globalEmploymentInfoLock = false;
        console.log("Setting globalEmploymentInfoLock to default: false");
      }

      // Apply updates if needed
      if (Object.keys(updateObj).length > 0) {
        await db
          .collection("systemsettings")
          .updateOne({ _id: systemSettings._id }, { $set: updateObj });
        console.log("✓ System settings updated with:", updateObj);
      } else {
        console.log(
          "✓ System settings already have globalEmploymentInfoLock =",
          systemSettings.globalEmploymentInfoLock
        );
      }
    } else {
      // Create new system settings
      console.log("No system settings found. Creating new...");
      await db.collection("systemsettings").insertOne({
        globalEmploymentInfoLock: false,
        employmentInfoUpdateEnabled: true,
        lastUpdatedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      console.log(
        "✓ Created new system settings with globalEmploymentInfoLock: false"
      );
    }

    // 2. MIGRATE ALL USERS
    console.log("\n--- Migrating Users ---");

    const users = await db.collection("users").find({}).toArray();
    console.log(`Found ${users.length} users to check`);

    let migratedCount = 0;
    let alreadyMigratedCount = 0;

    for (const user of users) {
      const updateFields = {};
      let needsUpdate = false;

      // Check if user has employmentInfo
      if (!user.employmentInfo) {
        // Create employmentInfo if it doesn't exist
        updateFields["employmentInfo"] = {
          isEmploymentInfoLocked: false,
          isProfileComplete: false,
          canUpdateEmploymentInfo: true, // for backward compatibility
        };
        needsUpdate = true;
        console.log(
          `User ${
            user.email || user._id
          }: Creating new employmentInfo with isEmploymentInfoLocked: false`
        );
      } else {
        // Check for old field
        if (
          user.employmentInfo.canUpdateEmploymentInfo !== undefined &&
          user.employmentInfo.isEmploymentInfoLocked === undefined
        ) {
          // Invert the value: canUpdate=true means isLocked=false
          const isLocked = !user.employmentInfo.canUpdateEmploymentInfo;
          updateFields["employmentInfo.isEmploymentInfoLocked"] = isLocked;
          needsUpdate = true;
          console.log(
            `User ${
              user.email || user._id
            }: Migrating canUpdateEmploymentInfo=${
              user.employmentInfo.canUpdateEmploymentInfo
            } → isEmploymentInfoLocked=${isLocked}`
          );
        }

        // Check if new field is missing and no old field to base it on
        if (
          user.employmentInfo.isEmploymentInfoLocked === undefined &&
          user.employmentInfo.canUpdateEmploymentInfo === undefined
        ) {
          updateFields["employmentInfo.isEmploymentInfoLocked"] = false;
          // Also set old field for backward compatibility
          updateFields["employmentInfo.canUpdateEmploymentInfo"] = true;
          needsUpdate = true;
          console.log(
            `User ${
              user.email || user._id
            }: Adding default isEmploymentInfoLocked=false and canUpdateEmploymentInfo=true`
          );
        }

        // If new field exists but old field doesn't, add old field for backward compatibility
        if (
          user.employmentInfo.isEmploymentInfoLocked !== undefined &&
          user.employmentInfo.canUpdateEmploymentInfo === undefined
        ) {
          updateFields["employmentInfo.canUpdateEmploymentInfo"] =
            !user.employmentInfo.isEmploymentInfoLocked;
          needsUpdate = true;
          console.log(
            `User ${
              user.email || user._id
            }: Adding backward compatibility: canUpdateEmploymentInfo=${!user
              .employmentInfo.isEmploymentInfoLocked}`
          );
        }

        if (
          !needsUpdate &&
          user.employmentInfo.isEmploymentInfoLocked !== undefined
        ) {
          alreadyMigratedCount++;
        }
      }

      // Apply updates if needed
      if (needsUpdate) {
        await db
          .collection("users")
          .updateOne({ _id: user._id }, { $set: updateFields });
        migratedCount++;
      }
    }

    console.log(`\n--- Migration Summary ---`);
    console.log(`Users migrated: ${migratedCount}`);
    console.log(`Users already migrated: ${alreadyMigratedCount}`);
    console.log(`Total users processed: ${users.length}`);

    // 3. VERIFY MIGRATION
    console.log("\n--- Verifying Migration ---");

    // Check system settings
    const updatedSettings = await db.collection("systemsettings").findOne({});
    console.log("System settings after migration:", {
      globalEmploymentInfoLock: updatedSettings?.globalEmploymentInfoLock,
      employmentInfoUpdateEnabled: updatedSettings?.employmentInfoUpdateEnabled,
    });

    // Count users with new field
    const usersWithNewField = await db.collection("users").countDocuments({
      "employmentInfo.isEmploymentInfoLocked": { $exists: true },
    });
    console.log(
      `Users with isEmploymentInfoLocked field: ${usersWithNewField}/${users.length}`
    );

    // Count users with old field
    const usersWithOldField = await db.collection("users").countDocuments({
      "employmentInfo.canUpdateEmploymentInfo": { $exists: true },
    });
    console.log(
      `Users with canUpdateEmploymentInfo field: ${usersWithOldField}/${users.length}`
    );

    console.log("\n✓ Employment info lock migration completed successfully");
  } catch (error) {
    console.error("Migration error:", error);
    throw error;
  }
};

// Also allow the script to be run directly if needed
if (require.main === module) {
  console.log("Running migration script directly...");
  const connectDB = require("../src/config/db");

  const runDirect = async () => {
    try {
      await connectDB();
      await migrateEmploymentInfoLock();
      console.log("\n✓ Direct migration completed");
      process.exit(0);
    } catch (error) {
      console.error("Direct migration failed:", error);
      process.exit(1);
    }
  };

  runDirect();
}

module.exports = { migrateEmploymentInfoLock };
