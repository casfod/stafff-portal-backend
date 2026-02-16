const User = require("../models/UserModel");
const SystemSettings = require("../models/SystemSettingsModel");
const AppError = require("../utils/appError");

class EmploymentInfoService {
  // Check if user can update employment info
  // Priority: User-specific lock takes precedence over global lock
  static async canUpdateEmploymentInfo(userId) {
    // First, check if user exists and their specific lock status
    const user = await User.findById(userId).select(
      "employmentInfo.isEmploymentInfoLocked"
    );

    if (!user) {
      return {
        allowed: false,
        reason: "User not found",
      };
    }

    // User-specific lock takes PRIORITY
    if (user.employmentInfo?.isEmploymentInfoLocked === true) {
      return {
        allowed: false,
        reason: "Your employment information update access has been locked",
      };
    }

    // If user is not locked, check global setting (secondary check)
    const settings = await SystemSettings.findOne();

    // Global lock only applies if user is not already locked
    // If global lock is true, we still respect that
    if (settings?.globalEmploymentInfoLock === true) {
      return {
        allowed: false,
        reason:
          "Employment information updates are currently disabled globally",
      };
    }

    // All checks passed - user can update
    return { allowed: true };
  }

  // Helper method to check if employment info is complete
  static isEmploymentInfoComplete(employmentData) {
    if (employmentData) {
      const requiredFields = [
        employmentData.personalDetails?.fullName,
        employmentData.personalDetails?.stateOfOrigin,
        employmentData.personalDetails?.lga,
        employmentData.personalDetails?.address,
        employmentData.personalDetails?.cellPhone,
        employmentData.personalDetails?.ninNumber,
        employmentData.jobDetails?.title,
        employmentData.jobDetails?.startDate,
        employmentData.emergencyContact?.fullName,
        employmentData.emergencyContact?.primaryPhone,
        employmentData.bankDetails?.bankName,
        employmentData.bankDetails?.accountName,
        employmentData.bankDetails?.accountNumber,
      ];

      return requiredFields.every(
        (field) => field && field.toString().trim() !== ""
      );
    }
    return false;
  }

  // Build update object for employment info
  static buildEmploymentInfoUpdate(employmentData) {
    const updateObj = {};

    if (employmentData.personalDetails) {
      Object.keys(employmentData.personalDetails).forEach((key) => {
        if (employmentData.personalDetails[key] !== undefined) {
          updateObj[`employmentInfo.personalDetails.${key}`] =
            employmentData.personalDetails[key];
        }
      });
    }

    if (employmentData.jobDetails) {
      Object.keys(employmentData.jobDetails).forEach((key) => {
        if (employmentData.jobDetails[key] !== undefined) {
          updateObj[`employmentInfo.jobDetails.${key}`] =
            employmentData.jobDetails[key];
        }
      });
    }

    if (employmentData.emergencyContact) {
      Object.keys(employmentData.emergencyContact).forEach((key) => {
        if (employmentData.emergencyContact[key] !== undefined) {
          updateObj[`employmentInfo.emergencyContact.${key}`] =
            employmentData.emergencyContact[key];
        }
      });
    }

    if (employmentData.bankDetails) {
      Object.keys(employmentData.bankDetails).forEach((key) => {
        if (employmentData.bankDetails[key] !== undefined) {
          updateObj[`employmentInfo.bankDetails.${key}`] =
            employmentData.bankDetails[key];
        }
      });
    }

    return updateObj;
  }

  // Super Admin: Update any user's employment info (bypasses permission checks)
  static async superAdminUpdateEmploymentInfo(
    adminId,
    targetUserId,
    employmentData
  ) {
    const targetUser = await User.findById(targetUserId).select("_id");
    if (!targetUser) {
      throw new AppError("User not found", 404);
    }

    const updateObj = this.buildEmploymentInfoUpdate(employmentData);
    const isComplete = this.isEmploymentInfoComplete(employmentData);
    updateObj["employmentInfo.isProfileComplete"] = isComplete;

    const updatedUser = await User.findByIdAndUpdate(
      targetUserId,
      { $set: updateObj },
      {
        new: true,
        runValidators: false,
        select: "employmentInfo first_name last_name email",
      }
    );

    if (!updatedUser) {
      throw new AppError("User not found", 404);
    }

    console.log(
      `Super Admin ${adminId} updated employment info for user ${targetUserId}`
    );

    return updatedUser;
  }

  // Update employment info (regular users)
  static async updateEmploymentInfo(userId, employmentData) {
    const { allowed, reason } = await this.canUpdateEmploymentInfo(userId);
    if (!allowed) {
      throw new AppError(reason, 403);
    }

    const updateObj = this.buildEmploymentInfoUpdate(employmentData);
    const isComplete = this.isEmploymentInfoComplete(employmentData);
    updateObj["employmentInfo.isProfileComplete"] = isComplete;

    const user = await User.findByIdAndUpdate(
      userId,
      { $set: updateObj },
      {
        new: true,
        runValidators: false,
        select: "employmentInfo first_name last_name email",
      }
    );

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return user;
  }

  // Toggle global employment info lock
  static async toggleGlobalLock(adminId, enabled) {
    let settings = await SystemSettings.findOne();

    if (!settings) {
      settings = await SystemSettings.create({
        globalEmploymentInfoLock: enabled,
        lastUpdatedBy: adminId,
        lastUpdatedAt: Date.now(),
      });
    } else {
      settings.globalEmploymentInfoLock = enabled;
      settings.lastUpdatedBy = adminId;
      settings.lastUpdatedAt = Date.now();
      await settings.save();
    }

    return settings;
  }

  // Toggle user-specific employment info lock
  static async toggleUserLock(adminId, userId, locked) {
    const user = await User.findById(userId).select("_id");
    if (!user) {
      throw new AppError("User not found", 404);
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          "employmentInfo.isEmploymentInfoLocked": locked,
        },
      },
      {
        new: true,
        runValidators: false,
        select: "employmentInfo.isEmploymentInfoLocked",
      }
    );

    return updatedUser;
  }

  // Get employment info status for all users (admin only)
  static async getAllEmploymentInfoStatus() {
    const users = await User.find(
      {},
      {
        _id: 1,
        first_name: 1,
        last_name: 1,
        email: 1,
        "employmentInfo.isProfileComplete": 1,
        "employmentInfo.isEmploymentInfoLocked": 1,
        "employmentInfo.personalDetails.fullName": 1,
        "employmentInfo.jobDetails.title": 1,
      }
    );

    return users;
  }

  // Get user's employment info
  static async getUserEmploymentInfo(userId) {
    const user = await User.findById(userId).select(
      "employmentInfo first_name last_name email position"
    );

    if (!user) {
      throw new AppError("User not found", 404);
    }

    return {
      employmentInfo: user.employmentInfo || {},
      isProfileComplete: user.employmentInfo?.isProfileComplete || false,
      // Return the lock status (inverted for clarity in API response)
      canUpdate: !user.employmentInfo?.isEmploymentInfoLocked,
      isLocked: user.employmentInfo?.isEmploymentInfoLocked || false,
      firstName: user.first_name,
      lastName: user.last_name,
      email: user.email,
      position: user.position,
    };
  }

  // Get global settings
  static async getGlobalSettings() {
    const settings = await SystemSettings.findOne();
    return settings || { globalEmploymentInfoLock: false };
  }
}

module.exports = EmploymentInfoService;
