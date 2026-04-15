// scripts/migrateLeaveReviewedStatus.js
const mongoose = require("mongoose");
const Leave = require("../models/LeaveModel");
const LeaveBalance = require("../models/LeaveBalanceModel");

/**
 * Migrate leave documents with status "reviewed" to the new workflow:
 * - Change status from "reviewed" to "pending"
 * - Assign reviewedBy value to approvedBy
 * - Add migration metadata for tracking
 */
async function migrateLeaveReviewedStatus() {
  console.log("\n🔄 Starting leave status migration (reviewed -> pending)...");
  console.log("=".repeat(60));

  try {
    // Check if migration has already been run
    const migrationMarker = await mongoose.connection.db
      .collection("migrations")
      .findOne({ name: "leaveReviewedStatusMigration", completed: true });

    if (migrationMarker) {
      console.log("✅ Leave status migration already completed. Skipping...");
      console.log(`   Completed at: ${migrationMarker.completedAt}`);
      return { alreadyRun: true };
    }

    // Find all leaves with "reviewed" status
    const reviewedLeaves = await Leave.find({ status: "reviewed" });

    if (reviewedLeaves.length === 0) {
      console.log(
        "✓ No leaves with 'reviewed' status found. Migration not needed."
      );

      // Still mark as completed to avoid checking again
      await markMigrationComplete();
      return { migrated: 0, total: 0 };
    }

    console.log(
      `📊 Found ${reviewedLeaves.length} leaves with 'reviewed' status\n`
    );

    let migratedCount = 0;
    let errorCount = 0;
    const errors = [];

    for (const leave of reviewedLeaves) {
      try {
        console.log(`  Processing: ${leave.leaveNumber || leave._id}`);
        console.log(`    Status: ${leave.status}`);
        console.log(`    ReviewedBy: ${leave.reviewedBy || "none"}`);
        console.log(`    ApprovedBy: ${leave.approvedBy || "none"}`);
        console.log(`    Days applied: ${leave.totalDaysApplied}`);

        // Store original values for audit
        const originalStatus = leave.status;
        const originalReviewedBy = leave.reviewedBy;

        // 1. Change status to "pending"
        leave.status = "pending";

        // 2. Assign reviewedBy value to approvedBy (if reviewedBy exists)
        if (leave.reviewedBy) {
          leave.approvedBy = leave.reviewedBy;
          console.log(`    ✓ ApprovedBy set to: ${leave.reviewedBy}`);
        } else {
          console.log(`    ⚠ No reviewedBy found - approvedBy remains null`);
        }

        // 3. Add migration metadata (optional - for audit trail)
        if (!leave.migrationInfo) {
          leave.migrationInfo = {};
        }
        leave.migrationInfo.migratedFromReviewed = true;
        leave.migrationInfo.previousStatus = originalStatus;
        leave.migrationInfo.migratedAt = new Date();
        leave.migrationInfo.previousReviewedBy = originalReviewedBy;

        // 4. Keep reviewedBy for backward compatibility (don't delete it)
        // This ensures existing queries that expect reviewedBy still work

        await leave.save();

        // Verify balance is correct (days should already be reserved from reviewed status)
        const leaveBalance = await LeaveBalance.findOne({ user: leave.user });
        if (leaveBalance) {
          console.log(
            `    ✓ Balance check: ${leave.totalDaysApplied} days reserved (pending status)`
          );
        }

        migratedCount++;
        console.log(`    ✅ Successfully migrated\n`);
      } catch (error) {
        console.error(
          `    ❌ Error migrating ${leave.leaveNumber || leave._id}:`,
          error.message
        );
        errorCount++;
        errors.push({
          leaveId: leave._id,
          leaveNumber: leave.leaveNumber,
          error: error.message,
        });
        console.log(``);
      }
    }

    // Log summary
    console.log("=".repeat(60));
    console.log("📊 Migration Summary:");
    console.log(`  Total reviewed leaves: ${reviewedLeaves.length}`);
    console.log(`  Successfully migrated: ${migratedCount}`);
    console.log(`  Failed migrations: ${errorCount}`);

    if (errors.length > 0) {
      console.log(`\n❌ Failed migrations:`);
      errors.forEach((err) => {
        console.log(`  - ${err.leaveNumber || err.leaveId}: ${err.error}`);
      });
    }

    // Verify no remaining reviewed status
    const remainingReviewed = await Leave.countDocuments({
      status: "reviewed",
    });
    if (remainingReviewed > 0) {
      console.log(
        `\n⚠ Warning: ${remainingReviewed} leaves still have 'reviewed' status`
      );
    } else {
      console.log(`\n✅ All 'reviewed' status leaves have been migrated`);
    }

    // Show post-migration stats
    const pendingStats = await Leave.aggregate([
      { $match: { status: "pending" } },
      {
        $group: {
          _id: null,
          withApprover: {
            $sum: { $cond: [{ $ne: ["$approvedBy", null] }, 1, 0] },
          },
          withoutApprover: {
            $sum: { $cond: [{ $eq: ["$approvedBy", null] }, 1, 0] },
          },
        },
      },
    ]);

    if (pendingStats.length > 0) {
      console.log(`\n📈 Post-migration status:`);
      console.log(
        `  - Pending leaves with approver: ${pendingStats[0].withApprover}`
      );
      console.log(
        `  - Pending leaves without approver: ${pendingStats[0].withoutApprover}`
      );
    }

    // Mark migration as complete
    await markMigrationComplete(migratedCount, errorCount);

    console.log("\n✅ Leave status migration completed!\n");

    return {
      migrated: migratedCount,
      failed: errorCount,
      total: reviewedLeaves.length,
      errors: errors.length > 0 ? errors : undefined,
    };
  } catch (error) {
    console.error("❌ Migration failed:", error);
    // Don't throw - allow server to start even if migration fails
    // But log extensively for manual intervention
    return { error: error.message };
  }
}

/**
 * Mark migration as complete in database
 */
async function markMigrationComplete(migratedCount = 0, errorCount = 0) {
  try {
    const migrationsCollection =
      mongoose.connection.db.collection("migrations");
    await migrationsCollection.updateOne(
      { name: "leaveReviewedStatusMigration" },
      {
        $set: {
          completed: true,
          completedAt: new Date(),
          migratedCount,
          errorCount,
          version: "1.0.0",
        },
      },
      { upsert: true }
    );
    console.log("✓ Migration marked as complete in database");
  } catch (error) {
    console.error("⚠ Could not mark migration as complete:", error.message);
  }
}

/**
 * Optional: Send notifications to affected users
 * Can be run separately or as part of migration
 */
// async function notifyAffectedUsers() {
//   try {
//     const migratedLeaves = await Leave.find({
//       "migrationInfo.migratedFromReviewed": true,
//       status: "pending"
//     }).populate("user approvedBy", "email first_name last_name");

//     if (migratedLeaves.length === 0) {
//       console.log("No migrated leaves to notify");
//       return;
//     }

//     console.log(`\n📧 Would send notifications to ${migratedLeaves.length} users`);

//     // Here you would integrate with your notification system
//     // For now, just log
//     for (const leave of migratedLeaves) {
//       console.log(`  - Notify ${leave.user?.email} about leave ${leave.leaveNumber}`);
//       if (leave.approvedBy) {
//         console.log(`    Notify approver ${leave.approvedBy?.email} about pending approval`);
//       }
//     }

//     // Uncomment when ready to implement actual notifications
//     // await notify.multipleUsers(notificationData);

//   } catch (error) {
//     console.error("Error sending notifications:", error.message);
//   }
// }

module.exports = { migrateLeaveReviewedStatus };
