const User = require("../src/models/UserModel");
const SystemSettings = require("../src/models/SystemSettingsModel");

/**
 * Comprehensive user migration script to add missing fields
 */
const migrateUsers = async () => {
  try {
    console.log("Starting user migration...");

    // 1. Add procurementRole and financeRole if missing
    await User.updateMany(
      {
        $or: [
          { procurementRole: { $exists: false } },
          { financeRole: { $exists: false } },
        ],
      },
      {
        $set: {
          procurementRole: {
            canCreate: false,
            canView: false,
            canUpdate: false,
            canDelete: false,
          },
          financeRole: {
            canCreate: false,
            canView: false,
            canUpdate: false,
            canDelete: false,
          },
        },
      }
    );
    console.log("✓ Added missing procurementRole and financeRole");

    // 2. Add position field if missing or empty
    await User.updateMany(
      {
        $or: [{ position: { $exists: false } }, { position: "" }],
      },
      {
        $set: { position: "" },
      }
    );
    console.log("✓ Added missing position field");

    // 3. Initialize employmentInfo for users who don't have it
    await User.updateMany(
      { employmentInfo: { $exists: false } },
      {
        $set: {
          employmentInfo: {
            isProfileComplete: false,
            canUpdateEmploymentInfo: true,
            personalDetails: {},
            jobDetails: {},
            emergencyContact: {},
            bankDetails: {},
          },
        },
      }
    );
    console.log("✓ Added missing employmentInfo");

    // 4. Update employmentInfo for users with partial employmentInfo
    await User.updateMany(
      {
        employmentInfo: { $exists: true },
        "employmentInfo.canUpdateEmploymentInfo": { $exists: false },
      },
      {
        $set: {
          "employmentInfo.canUpdateEmploymentInfo": true,
          "employmentInfo.isProfileComplete": false,
        },
      }
    );
    console.log("✓ Updated employmentInfo with canUpdateEmploymentInfo flag");

    // 5. Ensure all users have isDeleted field
    await User.updateMany(
      { isDeleted: { $exists: false } },
      { $set: { isDeleted: false } }
    );
    console.log("✓ Added missing isDeleted field");

    // 6. Ensure passwordChangedAt exists for all users
    await User.updateMany(
      { passwordChangedAt: { $exists: false } },
      { $set: { passwordChangedAt: null } }
    );
    console.log("✓ Added missing passwordChangedAt field");

    console.log("✓ User migration completed successfully");
    return { success: true, message: "User migration completed" };
  } catch (error) {
    console.error("User migration failed:", error);
    throw error;
  }
};

/**
 * Migrate specific user by ID
 */
const migrateUserById = async (userId) => {
  try {
    const user = await User.findById(userId);
    if (!user) {
      throw new Error("User not found");
    }

    let needsUpdate = false;
    const updates = {};

    // Check and add missing procurementRole
    if (!user.procurementRole) {
      updates.procurementRole = {
        canCreate: false,
        canView: false,
        canUpdate: false,
        canDelete: false,
      };
      needsUpdate = true;
    }

    // Check and add missing financeRole
    if (!user.financeRole) {
      updates.financeRole = {
        canCreate: false,
        canView: false,
        canUpdate: false,
        canDelete: false,
      };
      needsUpdate = true;
    }

    // Check and add missing position
    if (!user.position && user.position !== "") {
      updates.position = "";
      needsUpdate = true;
    }

    // Check and add missing employmentInfo
    if (!user.employmentInfo) {
      updates.employmentInfo = {
        isProfileComplete: false,
        canUpdateEmploymentInfo: true,
        personalDetails: {},
        jobDetails: {},
        emergencyContact: {},
        bankDetails: {},
      };
      needsUpdate = true;
    } else {
      // Check for missing canUpdateEmploymentInfo
      if (user.employmentInfo.canUpdateEmploymentInfo === undefined) {
        updates["employmentInfo.canUpdateEmploymentInfo"] = true;
        needsUpdate = true;
      }
      // Check for missing isProfileComplete
      if (user.employmentInfo.isProfileComplete === undefined) {
        updates["employmentInfo.isProfileComplete"] = false;
        needsUpdate = true;
      }
    }

    // Check and add missing isDeleted
    if (user.isDeleted === undefined) {
      updates.isDeleted = false;
      needsUpdate = true;
    }

    if (needsUpdate) {
      await User.findByIdAndUpdate(userId, { $set: updates });
      console.log(`✓ User ${userId} migrated successfully`);
    }

    return { success: true, user: await User.findById(userId) };
  } catch (error) {
    console.error(`User migration failed for ID ${userId}:`, error);
    throw error;
  }
};

module.exports = { migrateUsers, migrateUserById };
