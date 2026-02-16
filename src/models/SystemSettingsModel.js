const mongoose = require("mongoose");

const systemSettingsSchema = new mongoose.Schema(
  {
    // Renamed for clarity: this is a global override that works WITH user settings
    // When true, the system can still respect user's individual lock status
    globalEmploymentInfoLock: {
      type: Boolean,
      default: false, // Default: not locked globally
    },
    lastUpdatedBy: {
      type: mongoose.Schema.ObjectId,
      ref: "User",
    },
    lastUpdatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

// Ensure only one settings document exists
systemSettingsSchema.pre("save", async function (next) {
  const count = await this.constructor.countDocuments();
  if (count > 0 && this.isNew) {
    throw new Error("Only one system settings document can exist");
  }
  next();
});

const SystemSettings = mongoose.model("SystemSettings", systemSettingsSchema);
module.exports = SystemSettings;
