// src/services/user.service.ts

import { User, IUser } from "../models";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";
import { emailService } from "./email.service";
import { cloudinaryService } from "./cloudinary.service";
import { tryCatch } from "../utils/tryCatch";
import { ResponseBuilder } from "./shared/response-builder";
import { logger } from "../utils/logger";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface CreateStaffInput {
  email: string;
  firstName: string;
  lastName: string;
  phone?: string;
  position?: string;
  role: "staff" | "admin" | "reviewer";
  supervisorId?: string; // ✅ Add supervisorId
}

export interface UpdateEmploymentInfoInput {
  personalDetails?: Record<string, any>;
  jobDetails?: Record<string, any>;
  emergencyContact?: Record<string, any>;
  bankDetails?: Record<string, any>;
}

export interface UserFilters {
  role?: string;
  isActive?: boolean | string;
  position?: string;
  page?: number;
  limit?: number;
  sort?: string;
  search?: string;
}

export interface UpdateUserInput {
  firstName?: string;
  lastName?: string;
  position?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const TEMP_PASSWORD_LENGTH = 12;
function generateTempPassword(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789!@#$";
  return Array.from({ length: TEMP_PASSWORD_LENGTH })
    .map(() => chars[Math.floor(Math.random() * chars.length)])
    .join("");
}

// Helper to transform user document
function transformUserDocument(user: any): any {
  if (!user) return null;
  
  const result = { ...user };
  
  // Convert _id to id
  if (result._id) {
    result.id = result._id.toString();
    delete result._id;
  }
  
  // Handle populated supervisorId
  if (result.employmentInfo?.jobDetails?.supervisorId) {
    const supervisor = result.employmentInfo.jobDetails.supervisorId;
    
    // Check if it's a populated document (has _id) or just an ObjectId
    if (supervisor && typeof supervisor === 'object') {
      // If it has _id, convert to id
      if (supervisor._id) {
        supervisor.id = supervisor._id.toString();
        delete supervisor._id;
      }
      // Add fullName if firstName and lastName exist
      if (supervisor.firstName || supervisor.lastName) {
        supervisor.fullName = `${supervisor.firstName || ''} ${supervisor.lastName || ''}`.trim();
      }
    }
  }
  
  // Add fullName for the user
  result.fullName = `${result.firstName || ''} ${result.lastName || ''}`.trim();
  
  // Remove __v
  delete result.__v;
  
  return result;
}

// ─── Service ──────────────────────────────────────────────────────────────────
class UserService {
  // ── Upload / update avatar ─────────────────────────────────────────────
  async updateUserAvatar(userId: string, buffer: Buffer): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findById(userId);
      if (!user) throw new AppError("User not found", 404);

      const { url, publicId } = await cloudinaryService.uploadAvatar(buffer, userId, user.avatar?.publicId || undefined);

      user.avatar = { url, publicId };
      await user.save();
      return ResponseBuilder.operation(user, "Avatar updated successfully");
    });
  }
  async updateUserSignature(userId: string, buffer: Buffer): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findById(userId);
      if (!user) throw new AppError("User not found", 404);

      const { url, publicId } = await cloudinaryService.uploadAvatar(buffer, userId, user.signature?.publicId || undefined);

      user.signature = { url, publicId };
      await user.save();
      return ResponseBuilder.operation(user, "Signature updated successfully");
    });
  }

  // ── Remove avatar ──────────────────────────────────────────────────────
  async removeUserAvatar(userId: string): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findById(userId);
      if (!user) throw new AppError("User not found", 404);

      if (user.avatar?.publicId) {
        await cloudinaryService.deleteFile(user.avatar.publicId);
      }

      user.avatar = { url: "", publicId: "" };
      await user.save();
      return ResponseBuilder.operation(user, "Avatar removed successfully");
    });
  }

  async removeUserSignature(userId: string): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findById(userId);
      if (!user) throw new AppError("User not found", 404);

      if (user.signature?.publicId) {
        await cloudinaryService.deleteFile(user.signature.publicId);
      }

      user.signature = { url: "", publicId: "" };
      await user.save();
      return ResponseBuilder.operation(user, "Signature removed successfully");
    });
  }

  // ── Super-admin creates a staff / admin account ──────────────────────
  async createStaffAccount(input: CreateStaffInput): Promise<any> {
    return tryCatch(async () => {
      const existing = await User.findOne({ email: input.email });
      if (existing) throw new AppError("Email already in use", 400);

      const roleMap: Record<string, IUser["role"]> = { 
        STAFF: "STAFF", 
        ADMIN: "ADMIN", 
        REVIEWER: "REVIEWER" 
      };

      const role = roleMap[input.role];

      if (!role) throw new AppError("Role must be staff, reviewer or admin", 400);

      const tempPassword = generateTempPassword();

      // If supervisorId is provided, find the supervisor
      let supervisorId = null;
      if (input.supervisorId) {
        const supervisor = await User.findById(input.supervisorId);
        if (supervisor) {
          supervisorId = supervisor._id;
        }
      }

      const user = await User.create({
        email: input.email,
        firstName: input.firstName,
        lastName: input.lastName,
        password: tempPassword,
        position: input.position,
        role,
        employmentInfo: {
          isProfileComplete: false,
          isEmploymentInfoLocked: false,
          ...(input.phone ? { personalDetails: { cellPhone: input.phone } } : {}),
          ...(supervisorId ? { 
            jobDetails: { 
              supervisorId: supervisorId 
            } 
          } : {})
        },
      });

      // Populate the supervisorId before returning
      if (supervisorId) {
        await user.populate('employmentInfo.jobDetails.supervisorId');
      }

      emailService
        .sendWelcomeStaffEmail(input.email, {
          name: `${input.firstName} ${input.lastName}`,
          tempPassword,
          loginUrl: `${env.FRONTEND_URL}/login`,
          profileUrl: `${env.FRONTEND_URL}/human-resources/staff-information/employment`,
        })
        .catch(console.error);

      // Transform the user
      const userObj = user.toJSON ? user.toJSON() : user;
      const transformedUser = transformUserDocument(userObj);

      return ResponseBuilder.operation(
        { user: transformedUser, tempPassword }, 
        "Staff account created successfully"
      );
    });
  }

  // ── Employee fills in their own employment info ──────────────────────
  async updateEmploymentInfo(
    userId: string,
    input: UpdateEmploymentInfoInput,
    requestingUserId: string,
    isAdmin: boolean
  ): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findById(userId);
      if (!user) throw new AppError("User not found", 404);

      if (!isAdmin && userId !== requestingUserId) {
        throw new AppError("You can only update your own employment info", 403);
      }

      if (user.employmentInfo?.isEmploymentInfoLocked && !isAdmin) {
        throw new AppError("Your employment profile has been locked. Contact an administrator.", 403);
      }

      const ei = user.employmentInfo || ({} as any);

      if (input.personalDetails) {
        ei.personalDetails = { ...(ei.personalDetails || {}), ...input.personalDetails };
      }
      if (input.jobDetails) {
        if (!isAdmin) {
          const { title, idNo, staffTaxIdNo, supervisorId, ...allowedJobFields } = input.jobDetails;
          ei.jobDetails = { ...(ei.jobDetails || {}), ...allowedJobFields };
        } else {
          ei.jobDetails = { ...(ei.jobDetails || {}), ...input.jobDetails };
        }
      }
      if (input.emergencyContact) {
        ei.emergencyContact = { ...(ei.emergencyContact || {}), ...input.emergencyContact };
      }
      if (input.bankDetails) {
        ei.bankDetails = { ...(ei.bankDetails || {}), ...input.bankDetails };
      }

      ei.isProfileComplete = [ei.personalDetails, ei.jobDetails, ei.emergencyContact, ei.bankDetails].every(Boolean);

      user.employmentInfo = ei;
      await user.save();
      return ResponseBuilder.operation(user, "Employment info updated successfully");
    });
  }

  // ── Admin locks / unlocks an employee's profile ──────────────────────
  async setEmploymentInfoLocked(userId: string, locked: boolean): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findById(userId);
      if (!user) throw new AppError("User not found", 404);

      if (!["STAFF", "ADMIN"].includes(user.role)) {
        throw new AppError("Only staff or admin profiles can be locked", 400);
      }

      user.employmentInfo = {
        ...((user.employmentInfo as any) || {}),
        isEmploymentInfoLocked: locked,
      };
      await user.save();
      return ResponseBuilder.operation(user, `Employment profile ${locked ? "locked" : "unlocked"} successfully`);
    });
  }

  // ── Get all users (paginated + filters) ──────────────────────────────
  async getUsers(filters: UserFilters): Promise<any> {
    return tryCatch(async () => {
      const { role, isActive, position, page = 1, limit = 20, sort = "-createdAt", search } = filters;

      const query: Record<string, any> = {};
      
      // Handle role filtering - if role is 'admin', get both ADMIN and SUPER-ADMIN
      if (role) {
        if (role === 'admin') {
          query.role = { $in: ['ADMIN', 'SUPER-ADMIN'] };
        } else {
          query.role = role.toUpperCase();
        }
      }

      // isActive comes through as string "true"/"false"
      if (typeof isActive !== "undefined") {
        query.isActive = typeof isActive === "boolean" ? isActive : isActive === "true";
      }

      if (position) {
        const escaped = String(position).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.position = new RegExp(escaped, "i");
      }

      if (search) {
        const escapedSearch = String(search).trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        query.$or = [
          { firstName: new RegExp(escapedSearch, "i") },
          { lastName: new RegExp(escapedSearch, "i") },
          { email: new RegExp(escapedSearch, "i") },
        ];
      }

      const skip = (page - 1) * limit;
      const [users, total] = await Promise.all([
        User.find(query)
          .populate({
            path: 'employmentInfo.jobDetails.supervisorId',
            select: 'firstName lastName email role position'
          }) // ✅ Populate supervisorId
          .sort(sort)
          .skip(skip)
          .limit(limit)
          .lean(), // Use lean() for better performance
        User.countDocuments(query),
      ]);

      // Transform users to ensure consistent ID format
      const transformedUsers = users.map(user => transformUserDocument(user));

      logger.info(`Retrieved ${transformedUsers.length} users (page ${page}, limit ${limit}, total ${total})`);

      const pagination = ResponseBuilder.getPaginationMeta(page, limit, total);
      return ResponseBuilder.list(transformedUsers, pagination, "Users retrieved successfully");
    });
  }

  // ── Get single user by ID ─────────────────────────────────────────────
  async getUserById(userId: string): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findById(userId)
        .populate({
          path: 'employmentInfo.jobDetails.supervisorId',
          select: 'firstName lastName email role position'
        }) // ✅ Populate supervisorId
        .lean();

      if (!user) throw new AppError("User not found", 404);

      // Transform the user document
      const transformedUser = transformUserDocument(user);

      return ResponseBuilder.single(transformedUser, "User retrieved successfully");
    });
  }

  // ── Update basic user info ────────────────────────────────────────────
  async updateUser(userId: string, updates: any, requestingUserId: string, isAdmin: boolean): Promise<any> {
    return tryCatch(async () => {
      if (!isAdmin && userId !== requestingUserId) {
        throw new AppError("You can only update your own profile", 403);
      }

      const user = await User.findById(userId);
      if (!user) throw new AppError("User not found", 404);

      // Start building the update object
      const updateData: Record<string, any> = {};

      // Basic fields that anyone can update
      const basicFields = ["firstName", "lastName", "position"];
      for (const key of basicFields) {
        if (updates[key] !== undefined) {
          updateData[key] = updates[key];
        }
      }

      // Admin-only fields
      if (isAdmin) {
        // Update email if provided
        if (updates.email) {
          const existingUser = await User.findOne({ email: updates.email, _id: { $ne: userId } });
          if (existingUser) {
            throw new AppError("Email already in use", 400);
          }
          updateData.email = updates.email;
        }

        // Update role if provided
        if (updates.role) {
          const validRoles = ['SUPER-ADMIN', 'ADMIN', 'REVIEWER', 'STAFF'];
          if (!validRoles.includes(updates.role)) {
            throw new AppError(`Invalid role. Must be one of: ${validRoles.join(', ')}`, 400);
          }
          updateData.role = updates.role;
        }

        // Update permissions - using $set for nested objects
        if (updates.procurementRole) {
          updateData['procurementRole.canCreate'] = updates.procurementRole.canCreate ?? false;
          updateData['procurementRole.canView'] = updates.procurementRole.canView ?? false;
          updateData['procurementRole.canUpdate'] = updates.procurementRole.canUpdate ?? false;
          updateData['procurementRole.canDelete'] = updates.procurementRole.canDelete ?? false;
        }

        if (updates.financeRole) {
          updateData['financeRole.canCreate'] = updates.financeRole.canCreate ?? false;
          updateData['financeRole.canView'] = updates.financeRole.canView ?? false;
          updateData['financeRole.canUpdate'] = updates.financeRole.canUpdate ?? false;
          updateData['financeRole.canDelete'] = updates.financeRole.canDelete ?? false;
        }
      }

      const updatedUser = await User.findByIdAndUpdate(userId, updateData, {
        new: true,
        runValidators: true,
      }).populate({
        path: 'employmentInfo.jobDetails.supervisorId',
        select: 'firstName lastName email role position'
      });
      
      if (!updatedUser) throw new AppError("User not found", 404);
      
      const transformedUser = transformUserDocument(updatedUser);
      return ResponseBuilder.operation(transformedUser, "User updated successfully");
    });
  }

  // ── Soft-deactivate a user account ───────────────────────────────────
  async deactivateUser(userId: string): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findByIdAndUpdate(userId, { isActive: false, isDeleted: true }, { new: true });
      if (!user) throw new AppError("User not found", 404);

      emailService.sendAccountDeactivated(user.email, user.firstName).catch(console.error);

      return ResponseBuilder.operation(user, "User deactivated successfully");
    });
  }

  // ── Reactivate a user account ────────────────────────────────────────
  async activateUser(userId: string): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findByIdAndUpdate(userId, { isActive: true, isDeleted: false }, { new: true });
      if (!user) throw new AppError("User not found", 404);
      return ResponseBuilder.operation(user, "User activated successfully");
    });
  }

  // ── Hard delete (super-admin only) ───────────────────────────────────
  async deleteUser(userId: string): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findById(userId);
      if (!user) throw new AppError("User not found", 404);

      if (user.avatar?.publicId) {
        await cloudinaryService.deleteFile(user.avatar.publicId).catch(() => null);
      }

      await User.findByIdAndDelete(userId);
      return ResponseBuilder.operation(null, "User deleted successfully");
    });
  }

  // ── Change password ──────────────────────────────────────────────────
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findById(userId).select("+password");
      if (!user) throw new AppError("User not found", 404);

      const isMatch = await user.comparePassword(currentPassword);
      if (!isMatch) throw new AppError("Current password is incorrect", 401);

      user.password = newPassword;
      await user.save();
      return ResponseBuilder.operation(null, "Password changed successfully");
    });
  }
}

export const userService = new UserService();