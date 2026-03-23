const Vendor = require("../models/VendorModel"); // adjust path as needed

const DORCAS_ID = "682deb0cbb509e9139c417d6";

const migrateVendorCreatedBy = async () => {
  try {
    const result = await Vendor.updateMany(
      {
        $or: [{ createdBy: { $exists: false } }, { createdBy: null }],
      },
      { $set: { createdBy: DORCAS_ID } }
    );

    console.log(
      `✓ Vendor createdBy migration completed: ${result.modifiedCount} vendor(s) assigned to Dorcas (${DORCAS_ID})`
    );
  } catch (error) {
    console.error("✗ Vendor createdBy migration failed:", error);
    throw error;
  }
};

module.exports = { migrateVendorCreatedBy };
