// scripts/migrateUsersEmploymentInfo.js
// const mongoose = require("mongoose");
const User = require("../src/models/UserModel");

const migrateUsers = async () => {
  try {
    // Initialize employmentInfo for users who don't have it
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

    console.log("Migration completed successfully");
  } catch (error) {
    console.error("Migration failed:", error);
  }
};

module.exports = migrateUsers;
