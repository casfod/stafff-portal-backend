const mongoose = require("mongoose");
const dotenv = require("dotenv");
const { seedSuperUserService } = require("../services/authService");
const { migrateUsers } = require("../../scripts/migrateUsers");
const {
  initializeSystemSettings,
} = require("../services/systemSettingsService");

// Import the migration function
const {
  migrateEmploymentInfoLock,
} = require("../../scripts/migrateEmploymentInfoLockTemp");

dotenv.config({ path: "./config.env" });

const DB = process.env.DATABASE.replace(
  "<PASSWORD>",
  process.env.DATABASE_PASSWORD
);

const connectDB = async () => {
  try {
    await mongoose.connect(DB, {});
    console.log("DB connection successful!");

    // Seed super user if not exists
    await seedSuperUserService();
    console.log("✓ Super user seeding completed");

    // Run user migrations
    await migrateUsers();

    // RUN EMPLOYMENT INFO LOCK MIGRATION
    // Comment this out after it has run successfully once
    console.log("Running employment info lock migration...");
    // await migrateEmploymentInfoLock();
    console.log("✓ Employment info lock migration completed");
    // END OF MIGRATION BLOCK - REMOVE AFTER FIRST RUN

    // Initialize system settings
    await initializeSystemSettings();
    console.log("✓ System settings initialization completed");

    console.log("MongoDB connected and migrations completed successfully");
  } catch (error) {
    console.error("MongoDB connection error:", error);
    process.exit(1);
  }
};

module.exports = connectDB;
