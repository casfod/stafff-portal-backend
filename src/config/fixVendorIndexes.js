const mongoose = require("mongoose");
const Vendor = require("../models/VendorModel");

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

    // Drop the old unique indexes if they exist
    console.log("\n🗑️  Dropping old unique indexes...");

    const indexesToDrop = [
      "businessRegNumber_1",
      "businessName_1",
      "email_1",
      "vendorCode_1",
      "businessName_approved_unique",
      "businessRegNumber_approved_unique",
      "email_approved_unique",
      "vendorCode_unique_sparse",
    ];

    for (const indexName of indexesToDrop) {
      try {
        await collection.dropIndex(indexName);
        console.log(`   ✓ Dropped index: ${indexName}`);
      } catch (err) {
        // Index doesn't exist, that's fine
        if (err.code !== 27) {
          // 27 = IndexNotFound
          console.log(`   ℹ️  Index ${indexName} does not exist`);
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

    // Email - only unique for approved vendors (using partial filter only, no sparse)
    await collection.createIndex(
      { email: 1 },
      {
        unique: true,
        partialFilterExpression: {
          status: "approved",
          email: { $exists: true, $ne: null, $ne: "" },
        },
        name: "email_approved_unique",
      }
    );
    console.log(
      "   ✓ Created: email_approved_unique (only for approved vendors with non-empty email)"
    );

    // Vendor code - always unique when present (using partial filter only)
    await collection.createIndex(
      { vendorCode: 1 },
      {
        unique: true,
        partialFilterExpression: {
          vendorCode: { $exists: true, $ne: null, $ne: "" },
        },
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
      if (idx.name.includes("approved") || idx.name.includes("partial")) {
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
    }

    // Find duplicate emails among approved vendors
    const duplicateEmails = await Vendor.aggregate([
      {
        $match: {
          status: "approved",
          email: { $exists: true, $ne: null, $ne: "" },
        },
      },
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
    }

    console.log("\n✅ Duplicate data cleaned up!");
    return { success: true };
  } catch (error) {
    console.error("❌ Failed to clean up duplicates:", error);
    throw error;
  }
};

module.exports = { fixVendorIndexes, cleanupDuplicateData };
