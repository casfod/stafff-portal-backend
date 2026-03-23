const Vendor = require("../models/VendorModel"); // adjust path as needed

const migratePendingVendorsToDraft = async () => {
  try {
    const result = await Vendor.updateMany(
      { status: "pending" },
      { $set: { status: "draft" } }
    );

    console.log(
      `✓ Vendor migration completed: ${result.modifiedCount} vendor(s) updated from "pending" to "draft"`
    );
  } catch (error) {
    console.error("✗ Vendor migration failed:", error);
    throw error;
  }
};

module.exports = { migratePendingVendorsToDraft };
