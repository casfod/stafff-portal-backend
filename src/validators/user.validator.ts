import { z } from 'zod';

// ─── Create Staff ─────────────────────────────────────────────────────────────
export const createStaffSchema = z.object({
  email:     z.string().email('Valid email required'),
  firstName: z.string().min(2).max(24).trim(),
  lastName:  z.string().min(2).max(24).trim(),
  phone:     z.string().optional(),
  position:  z.string().optional(),
  role:      z.enum(['STAFF','REVIEWER','ADMIN']).default('STAFF'),
});

// ─── Update Basic Profile ─────────────────────────────────────────────────────
// Only top-level IUser fields: firstName, lastName, position
export const updateProfileSchema = z.object({
  firstName: z.string().min(2).max(24).trim().optional(),
  lastName:  z.string().min(2).max(24).trim().optional(),
  position:  z.string().optional(),
});

// ─── Update Employment Info ───────────────────────────────────────────────────
export const updateEmploymentInfoSchema = z.object({
  personalDetails: z.object({
    fullName:         z.string().optional(),
    stateOfOrigin:    z.string().optional(),
    lga:              z.string().optional(),
    religion:         z.string().optional(),
    gender:           z.enum(['Male', 'Female']).optional(),
    address:          z.string().optional(),
    homePhone:        z.string().optional(),
    cellPhone:        z.string().optional(),
    emailAddress:     z.string().email().optional(),
    ninNumber:        z.string().length(11, 'NIN must be exactly 11 digits').optional(),
    birthDate:        z.coerce.date().optional(),
    maritalStatus:    z.enum(['Single', 'Married', 'Divorced', 'Widowed']).optional(),
    spouseName:       z.string().optional(),
    spouseAddress:    z.string().optional(),
    spousePhone:      z.string().optional(),
    numberOfChildren: z.number().int().min(0).optional(),
  }).optional(),

  jobDetails: z.object({
    title:         z.string().optional(),
    idNo:          z.string().optional(),
    staffTaxIdNo:  z.string().optional(),
    workLocation:  z.string().optional(),
    workEmail:     z.string().email().optional(),
    workPhone:     z.string().optional(),
    workCellPhone: z.string().optional(),
    startDate:     z.coerce.date().optional(),
    endDate:       z.coerce.date().optional(),
    supervisor:    z.string().optional(),
    supervisorId:  z.string().optional(),
  }).optional(),

  emergencyContact: z.object({
    fullName:     z.string().optional(),
    address:      z.string().optional(),
    primaryPhone: z.string().optional(),
    cellPhone:    z.string().optional(),
    relationship: z.string().optional(),
  }).optional(),

  bankDetails: z.object({
    bankName:      z.string().optional(),
    accountName:   z.string().optional(),
    bankSortCode:  z.string().optional(),
    accountNumber: z.string().optional(),
  }).optional(),
});

// ─── Change Password ──────────────────────────────────────────────────────────
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password required'),
  newPassword:     z.string().min(8, 'New password must be at least 8 characters'),
});

// ─── Lock/Unlock Employment Info ──────────────────────────────────────────────
export const lockEmploymentInfoSchema = z.object({
  locked: z.boolean({ required_error: '`locked` boolean is required' }),
});

// ─── User role update (super-admin only) ──────────────────────────────────────
// ─── User role update (super-admin only) ──────────────────────────────────────
export const updateUserRoleSchema = z.object({
  // Basic profile fields
  firstName: z.string().min(2).max(24).trim().optional(),
  lastName: z.string().min(2).max(24).trim().optional(),
  email: z.string().email().optional(),
  position: z.string().optional(),
  
  // Role and permissions
  role: z.enum(['SUPER-ADMIN', 'ADMIN', 'REVIEWER', 'STAFF']).optional(),
  procurementRole: z.object({
    canCreate: z.boolean().optional(),
    canView: z.boolean().optional(),
    canUpdate: z.boolean().optional(),
    canDelete: z.boolean().optional(),
  }).optional(),
  financeRole: z.object({
    canCreate: z.boolean().optional(),
    canView: z.boolean().optional(),
    canUpdate: z.boolean().optional(),
    canDelete: z.boolean().optional(),
  }).optional(),
});
