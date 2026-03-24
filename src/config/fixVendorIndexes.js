const mongoose = require("mongoose");
const Migration = require("../models/MigrationModel");

/**
 * Fix vendor indexes to allow duplicate drafts
 * This script:
 * 1. Drops the old unique indexes
 * 2. Creates new partial indexes that only enforce uniqueness for approved vendors
 */
const fixVendorIndexes = async () => {
  try {
    console.log("\n🔧 Fixing vendor indexes...\n");

    const collection = mongoose.connection.collection("vendors");

    // Get all existing indexes
    const indexes = await collection.indexes();
    console.log("📊 Existing indexes:");
    indexes.forEach((idx) => {
      console.log(`   - ${idx.name}: ${JSON.stringify(idx.key)}`);
    });

    // Drop all existing indexes (except _id)
    console.log("\n🗑️  Dropping all existing indexes...");

    for (const idx of indexes) {
      if (idx.name !== "_id_") {
        try {
          await collection.dropIndex(idx.name);
          console.log(`   ✓ Dropped index: ${idx.name}`);
        } catch (err) {
          console.log(
            `   ⚠️  Could not drop index ${idx.name}: ${err.message}`
          );
        }
      }
    }

    // Create new partial indexes that only enforce uniqueness for approved vendors
    console.log("\n📝 Creating new partial indexes...");

    // Business name - only unique for approved vendors
    await collection.createIndex(
      { businessName: 1 },
      {
        unique: true,
        partialFilterExpression: { status: "approved" },
        name: "businessName_approved_unique",
      }
    );
    console.log(
      "   ✓ Created: businessName_approved_unique (only for approved vendors)"
    );

    // Business registration number - only unique for approved vendors
    await collection.createIndex(
      { businessRegNumber: 1 },
      {
        unique: true,
        partialFilterExpression: { status: "approved" },
        name: "businessRegNumber_approved_unique",
      }
    );
    console.log(
      "   ✓ Created: businessRegNumber_approved_unique (only for approved vendors)"
    );

    // Email - only unique for approved vendors where email exists
    // Simple existence check - no $ne operators
    await collection.createIndex(
      { email: 1 },
      {
        unique: true,
        partialFilterExpression: {
          status: "approved",
          email: { $exists: true },
        },
        name: "email_approved_unique",
      }
    );
    console.log(
      "   ✓ Created: email_approved_unique (only for approved vendors with email)"
    );

    // Vendor code - always unique when present
    await collection.createIndex(
      { vendorCode: 1 },
      {
        unique: true,
        partialFilterExpression: { vendorCode: { $exists: true } },
        name: "vendorCode_unique_partial",
      }
    );
    console.log(
      "   ✓ Created: vendorCode_unique_partial (unique when vendor code exists)"
    );

    console.log("\n✅ Indexes fixed successfully!");

    // Verify new indexes
    const newIndexes = await collection.indexes();
    console.log("\n📊 New indexes:");
    newIndexes.forEach((idx) => {
      if (idx.name !== "_id_") {
        console.log(`   ✓ ${idx.name}: ${JSON.stringify(idx.key)}`);
        if (idx.partialFilterExpression) {
          console.log(
            `     Partial filter: ${JSON.stringify(
              idx.partialFilterExpression
            )}`
          );
        }
      }
    });

    return { success: true };
  } catch (error) {
    console.error("❌ Failed to fix indexes:", error);
    throw error;
  }
};

/**
 * Clean up duplicate data before creating unique indexes
 */
const cleanupDuplicateData = async () => {
  try {
    console.log("\n🧹 Cleaning up duplicate data...\n");

    const Vendor = mongoose.model("Vendor");

    // Find duplicate business names among approved vendors
    const duplicateBusinessNames = await Vendor.aggregate([
      { $match: { status: "approved" } },
      {
        $group: {
          _id: "$businessName",
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (duplicateBusinessNames.length > 0) {
      console.log("⚠️  Found duplicate business names among approved vendors:");
      for (const dup of duplicateBusinessNames) {
        console.log(`   - "${dup._id}": ${dup.count} occurrences`);
        // Keep the most recent one, mark others for review
        const [keep, ...duplicates] = dup.ids;
        await Vendor.updateMany(
          { _id: { $in: duplicates } },
          {
            $set: {
              status: "rejected",
              comments: [
                {
                  user: null,
                  text: `[SYSTEM] Duplicate vendor with business name "${dup._id}". Original approved vendor kept.`,
                  createdAt: new Date(),
                },
              ],
            },
          }
        );
        console.log(
          `     → Kept: ${keep}, marked ${duplicates.length} as rejected`
        );
      }
    } else {
      console.log(
        "✅ No duplicate business names found among approved vendors"
      );
    }

    // Find duplicate registration numbers among approved vendors
    const duplicateRegNumbers = await Vendor.aggregate([
      { $match: { status: "approved" } },
      {
        $group: {
          _id: "$businessRegNumber",
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (duplicateRegNumbers.length > 0) {
      console.log(
        "\n⚠️  Found duplicate registration numbers among approved vendors:"
      );
      for (const dup of duplicateRegNumbers) {
        console.log(`   - "${dup._id}": ${dup.count} occurrences`);
        const [keep, ...duplicates] = dup.ids;
        await Vendor.updateMany(
          { _id: { $in: duplicates } },
          {
            $set: {
              status: "rejected",
              comments: [
                {
                  user: null,
                  text: `[SYSTEM] Duplicate vendor with registration number "${dup._id}". Original approved vendor kept.`,
                  createdAt: new Date(),
                },
              ],
            },
          }
        );
        console.log(
          `     → Kept: ${keep}, marked ${duplicates.length} as rejected`
        );
      }
    } else {
      console.log(
        "✅ No duplicate registration numbers found among approved vendors"
      );
    }

    // Find duplicate emails among approved vendors
    const duplicateEmails = await Vendor.aggregate([
      { $match: { status: "approved", email: { $exists: true } } },
      {
        $group: {
          _id: "$email",
          count: { $sum: 1 },
          ids: { $push: "$_id" },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ]);

    if (duplicateEmails.length > 0) {
      console.log("\n⚠️  Found duplicate emails among approved vendors:");
      for (const dup of duplicateEmails) {
        console.log(`   - "${dup._id}": ${dup.count} occurrences`);
        const [keep, ...duplicates] = dup.ids;
        await Vendor.updateMany(
          { _id: { $in: duplicates } },
          {
            $set: {
              status: "rejected",
              comments: [
                {
                  user: null,
                  text: `[SYSTEM] Duplicate vendor with email "${dup._id}". Original approved vendor kept.`,
                  createdAt: new Date(),
                },
              ],
            },
          }
        );
        console.log(
          `     → Kept: ${keep}, marked ${duplicates.length} as rejected`
        );
      }
    } else {
      console.log("✅ No duplicate emails found among approved vendors");
    }

    console.log("\n✅ Duplicate data cleaned up!");
    return { success: true };
  } catch (error) {
    console.error("❌ Failed to clean up duplicates:", error);
    throw error;
  }
};

/**
 * Main migration function that runs only once
 */
const runVendorIndexMigration = async () => {
  const migrationName = "vendor_index_fix_v3"; // Changed version to v3

  try {
    // Check if migration already ran
    const existingMigration = await Migration.findOne({ name: migrationName });

    if (existingMigration && existingMigration.success) {
      console.log(
        `✅ Migration "${migrationName}" already ran successfully on ${existingMigration.runAt}`
      );
      return { success: true, alreadyRan: true };
    }

    console.log(`\n🚀 Running migration: ${migrationName}\n`);

    // Run cleanup and index fix
    await cleanupDuplicateData();
    await fixVendorIndexes();

    // Record successful migration
    await Migration.create({
      name: migrationName,
      description:
        "Fix vendor indexes to allow duplicate drafts with partial unique constraints (v3 - simplified to only $exists)",
      success: true,
      runAt: new Date(),
    });

    console.log(`\n✅ Migration "${migrationName}" completed successfully!`);
    return { success: true, alreadyRan: false };
  } catch (error) {
    console.error(`❌ Migration "${migrationName}" failed:`, error);

    // Record failed migration
    try {
      // Check if we already have a failed record
      const existingFailed = await Migration.findOne({ name: migrationName });
      if (!existingFailed) {
        await Migration.create({
          name: migrationName,
          description:
            "Fix vendor indexes to allow duplicate drafts with partial unique constraints (v3 - simplified to only $exists)",
          success: false,
          error: error.message,
          runAt: new Date(),
        });
      }
    } catch (recordError) {
      console.error("Failed to record migration error:", recordError);
    }

    throw error;
  }
};

module.exports = {
  fixVendorIndexes,
  cleanupDuplicateData,
  runVendorIndexMigration,
};
