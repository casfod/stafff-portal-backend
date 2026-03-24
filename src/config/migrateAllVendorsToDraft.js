const mongoose = require("mongoose");
const Vendor = require("../models/VendorModel");

/**
 * Complete migration to convert ALL existing vendors to draft status
 * This ensures every vendor gets a temporary DRAFT-{id} code
 */
const migrateAllVendorsToDraft = async () => {
  let session;

  try {
    // Start a transaction
    session = await mongoose.startSession();
    session.startTransaction();

    // Find ALL vendors (no filtering)
    const allVendors = await Vendor.find({}).session(session);

    if (allVendors.length === 0) {
      console.log("✓ No vendors found to migrate");
      await session.commitTransaction();
      session.endSession();
      return;
    }

    console.log(`\n📊 Found ${allVendors.length} total vendors to migrate\n`);

    const migratedVendors = [];
    const skippedVendors = [];
    const errors = [];

    // Process each vendor
    for (const vendor of allVendors) {
      try {
        const originalStatus = vendor.status || "unknown";
        const originalCode = vendor.vendorCode;
        const hasTempCode = originalCode && originalCode.startsWith("DRAFT-");
        const alreadyHasOriginalCodeField = vendor.originalVendorCode;

        // Skip if already has a DRAFT- code and is in draft status with original code preserved
        if (
          hasTempCode &&
          vendor.status === "draft" &&
          alreadyHasOriginalCodeField
        ) {
          console.log(
            `⏭️  Skipping (already migrated): ${vendor.businessName
              .substring(0, 40)
              .padEnd(40)} | ${originalCode}`
          );
          skippedVendors.push({
            id: vendor._id,
            businessName: vendor.businessName,
            reason: "Already migrated",
          });
          continue;
        }

        // Preserve original vendor code if not already set
        if (!vendor.originalVendorCode && originalCode && !hasTempCode) {
          vendor.originalVendorCode = originalCode;
        }

        // Generate temporary vendor code
        const tempCode = `DRAFT-${vendor._id}`;
        vendor.vendorCode = tempCode;

        // Update status to draft if not already
        const oldStatus = vendor.status;
        if (vendor.status !== "draft") {
          vendor.status = "draft";
        }

        // Reset approval fields
        if (vendor.approvedBy) {
          vendor.approvedBy = null;
        }

        // Add migration comment
        if (!vendor.comments) {
          vendor.comments = [];
        }

        const migrationComment = {
          user: null,
          text: `[SYSTEM MIGRATION - ${new Date().toISOString()}] Vendor migrated from "${oldStatus}" status with code "${
            originalCode || "none"
          }" to draft status for approval workflow. Temporary code "${tempCode}" assigned. ${
            vendor.originalVendorCode
              ? `Original code preserved: ${vendor.originalVendorCode}`
              : "No original code to preserve"
          }`,
          createdAt: new Date(),
        };

        // Add comment at the beginning
        vendor.comments.unshift(migrationComment);

        vendor.updatedAt = new Date();

        await vendor.save({ session });

        migratedVendors.push({
          id: vendor._id,
          businessName: vendor.businessName,
          oldStatus,
          oldCode: originalCode || "none",
          newCode: tempCode,
          originalPreserved: vendor.originalVendorCode || false,
        });

        console.log(
          `✅ Migrated: ${vendor.businessName
            .substring(0, 40)
            .padEnd(40)} | ${oldStatus} → draft | ${(
            originalCode || "none"
          ).padEnd(15)} → ${tempCode}`
        );
      } catch (error) {
        console.error(
          `❌ Failed to migrate vendor ${vendor._id}:`,
          error.message
        );
        errors.push({
          id: vendor._id,
          businessName: vendor.businessName,
          error: error.message,
        });
      }
    }

    // If there were errors, decide whether to rollback or continue
    if (errors.length > 0) {
      console.log(
        `\n⚠️  Found ${errors.length} errors. Do you want to rollback? (yes/no)`
      );
      // In a script, you might want to prompt or just log and continue
      // For now, we'll log and continue with successful migrations
      console.log(
        "Continuing with successful migrations, errors will be logged separately"
      );
    }

    // Commit the transaction
    await session.commitTransaction();
    session.endSession();

    // Print detailed summary
    console.log("\n" + "=".repeat(100));
    console.log("📋 MIGRATION SUMMARY REPORT");
    console.log("=".repeat(100));
    console.log(`✅ Successfully migrated: ${migratedVendors.length} vendors`);
    console.log(
      `⏭️  Skipped (already migrated): ${skippedVendors.length} vendors`
    );
    console.log(`❌ Failed migrations: ${errors.length} vendors`);
    console.log(`📊 Total vendors processed: ${allVendors.length}`);

    if (migratedVendors.length > 0) {
      console.log("\n📝 MIGRATED VENDORS (first 10):");
      console.log("-".repeat(100));
      migratedVendors.slice(0, 10).forEach((v, index) => {
        console.log(
          `${(index + 1).toString().padStart(3)}. ${v.businessName
            .substring(0, 50)
            .padEnd(50)}`
        );
        console.log(`     Status: ${v.oldStatus} → draft`);
        console.log(`     Code: ${v.oldCode} → ${v.newCode}`);
        console.log(
          `     Original Preserved: ${v.originalPreserved ? "Yes" : "No"}`
        );
      });
      if (migratedVendors.length > 10) {
        console.log(`     ... and ${migratedVendors.length - 10} more`);
      }
    }

    if (skippedVendors.length > 0) {
      console.log("\n⏭️  SKIPPED VENDORS (already in correct state):");
      console.log("-".repeat(100));
      skippedVendors.slice(0, 5).forEach((v, index) => {
        console.log(
          `${(index + 1).toString().padStart(3)}. ${v.businessName
            .substring(0, 50)
            .padEnd(50)} - ${v.reason}`
        );
      });
      if (skippedVendors.length > 5) {
        console.log(`     ... and ${skippedVendors.length - 5} more`);
      }
    }

    if (errors.length > 0) {
      console.log("\n❌ ERROR DETAILS:");
      console.log("-".repeat(100));
      errors.forEach((err, index) => {
        console.log(
          `${(index + 1).toString().padStart(3)}. ${err.businessName
            .substring(0, 50)
            .padEnd(50)}`
        );
        console.log(`     Error: ${err.error}`);
      });
    }

    console.log("\n" + "=".repeat(100));
    console.log("📌 NEXT STEPS");
    console.log("=".repeat(100));
    console.log("1. All vendors now have temporary DRAFT-{id} codes");
    console.log(
      "2. Original codes preserved in 'originalVendorCode' field where available"
    );
    console.log("3. When a vendor is approved, the system will:");
    console.log("   - Generate a proper permanent vendor code");
    console.log("   - Add a system comment about the code generation");
    console.log(
      "   - Preserve the DRAFT code in originalVendorCode if not already set"
    );
    console.log(
      "4. Review and approve vendors through the normal approval workflow"
    );
    console.log("=".repeat(100));

    return {
      success: true,
      totalVendors: allVendors.length,
      migratedCount: migratedVendors.length,
      skippedCount: skippedVendors.length,
      errorCount: errors.length,
      migratedVendors,
      skippedVendors,
      errors,
    };
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    console.error("\n❌ Migration failed:", error);
    throw error;
  }
};

/**
 * Fix for vendors that have regular codes but are in draft status
 * This specifically targets vendors like those in your response
 */
const fixDraftVendorsWithRegularCodes = async () => {
  let session;

  try {
    session = await mongoose.startSession();
    session.startTransaction();

    // Find vendors that are in draft status but don't have DRAFT- codes
    const vendorsToFix = await Vendor.find({
      status: "draft",
      vendorCode: { $not: /^DRAFT-/ },
    }).session(session);

    if (vendorsToFix.length === 0) {
      console.log(
        "✓ No vendors need fixing - all draft vendors have DRAFT- codes"
      );
      await session.commitTransaction();
      session.endSession();
      return { fixed: 0 };
    }

    console.log(
      `\n🔧 Found ${vendorsToFix.length} draft vendors with regular codes to fix\n`
    );

    const fixedVendors = [];

    for (const vendor of vendorsToFix) {
      try {
        const originalCode = vendor.vendorCode;
        const tempCode = `DRAFT-${vendor._id}`;

        // Preserve original code if not already set
        if (!vendor.originalVendorCode) {
          vendor.originalVendorCode = originalCode;
        }

        vendor.vendorCode = tempCode;

        // Add fix comment
        if (!vendor.comments) {
          vendor.comments = [];
        }

        vendor.comments.unshift({
          user: null,
          text: `[SYSTEM FIX] Vendor had status "draft" but regular code "${originalCode}". Fixed to temporary code "${tempCode}". Original code preserved.`,
          createdAt: new Date(),
        });

        vendor.updatedAt = new Date();
        await vendor.save({ session });

        fixedVendors.push({
          id: vendor._id,
          businessName: vendor.businessName,
          oldCode: originalCode,
          newCode: tempCode,
        });

        console.log(
          `✅ Fixed: ${vendor.businessName
            .substring(0, 40)
            .padEnd(40)} | ${originalCode} → ${tempCode}`
        );
      } catch (error) {
        console.error(`❌ Failed to fix vendor ${vendor._id}:`, error.message);
      }
    }

    await session.commitTransaction();
    session.endSession();

    console.log(`\n✅ Fixed ${fixedVendors.length} vendors`);

    return {
      fixed: fixedVendors.length,
      fixedVendors,
    };
  } catch (error) {
    if (session) {
      await session.abortTransaction();
      session.endSession();
    }
    console.error("Fix failed:", error);
    throw error;
  }
};

/**
 * Verification function to check migration status
 */
const verifyAllVendors = async () => {
  try {
    console.log("\n🔍 VERIFYING ALL VENDORS\n");
    console.log("=".repeat(80));

    const allVendors = await Vendor.find({});
    const draftVendors = await Vendor.find({ status: "draft" });
    const approvedVendors = await Vendor.find({ status: "approved" });
    const pendingVendors = await Vendor.find({ status: "pending" });
    const rejectedVendors = await Vendor.find({ status: "rejected" });

    const vendorsWithTempCodes = await Vendor.find({
      vendorCode: { $regex: /^DRAFT-/ },
    });

    const vendorsWithRegularCodes = await Vendor.find({
      status: "draft",
      vendorCode: { $not: /^DRAFT-/ },
    });

    const vendorsWithOriginalCodes = await Vendor.find({
      originalVendorCode: { $exists: true, $ne: null },
    });

    console.log("\n📊 VENDOR STATUS BREAKDOWN:");
    console.log(`   Total Vendors: ${allVendors.length}`);
    console.log(`   ├─ Draft: ${draftVendors.length}`);
    console.log(`   ├─ Pending: ${pendingVendors.length}`);
    console.log(`   ├─ Approved: ${approvedVendors.length}`);
    console.log(`   └─ Rejected: ${rejectedVendors.length}`);

    console.log("\n🔑 VENDOR CODE BREAKDOWN:");
    console.log(`   Vendors with DRAFT- codes: ${vendorsWithTempCodes.length}`);
    console.log(
      `   Draft vendors with regular codes (NEED FIX): ${vendorsWithRegularCodes.length}`
    );
    console.log(
      `   Vendors with preserved original codes: ${vendorsWithOriginalCodes.length}`
    );

    if (vendorsWithRegularCodes.length > 0) {
      console.log("\n⚠️  VENDORS NEEDING FIX:");
      vendorsWithRegularCodes.forEach((v) => {
        console.log(
          `   - ${v.businessName}: code=${v.vendorCode}, status=${v.status}`
        );
      });
    }

    console.log("\n" + "=".repeat(80));

    return {
      total: allVendors.length,
      draft: draftVendors.length,
      pending: pendingVendors.length,
      approved: approvedVendors.length,
      rejected: rejectedVendors.length,
      tempCodes: vendorsWithTempCodes.length,
      needFix: vendorsWithRegularCodes.length,
      originalCodes: vendorsWithOriginalCodes.length,
    };
  } catch (error) {
    console.error("Verification failed:", error);
    throw error;
  }
};

module.exports = {
  migrateAllVendorsToDraft,
  fixDraftVendorsWithRegularCodes,
  verifyAllVendors,
};
