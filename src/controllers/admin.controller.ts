import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { sendSuccess, sendCreated, sendNoContent } from '../utils/responseHandler';
import { AuthRequest } from '../middleware/auth.middleware';
import { currentUser, queryParams, userId, multerFiles } from './controller.helpers';
import * as vendorService          from '../services/vendor.service';
import * as projectService         from '../services/project.service';
import * as systemSettingsService  from '../services/system-settings.service';
import * as employmentInfoService  from '../services/employment-info.service';
import { generateVendorsExcelReport } from '../services/vendor-excel.service';
import { exportUsersExcel } from './user.controller';

// ═══════════════════════════════════════════════════════════════════════════════
// PROJECT
// ═══════════════════════════════════════════════════════════════════════════════
export const getProjectStats = catchAsync(async (_req: AuthRequest, res: Response) => {
  const stats = await projectService.getProjectsStats();
  sendSuccess(res, stats, 'Project stats retrieved');
});

export const getAllProjects = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await projectService.getAllProjects(queryParams(req));
  sendSuccess(res, result, 'Projects retrieved');
});

export const getProjectById = catchAsync(async (req: AuthRequest, res: Response) => {
  const project = await projectService.getProjectById(req.params.id);
  sendSuccess(res, project, 'Project retrieved');
});

export const createProject = catchAsync(async (req: AuthRequest, res: Response) => {
  const project = await projectService.createProject(req.body, multerFiles(req));
  sendCreated(res, project, 'Project created');
});

export const updateProject = catchAsync(async (req: AuthRequest, res: Response) => {
  const project = await projectService.updateProject(req.params.id, req.body, multerFiles(req));
  sendSuccess(res, project, 'Project updated');
});

export const deleteProject = catchAsync(async (req: AuthRequest, res: Response) => {
  await projectService.deleteProject(req.params.id);
  sendNoContent(res);
});

// ═══════════════════════════════════════════════════════════════════════════════
// VENDOR
// ═══════════════════════════════════════════════════════════════════════════════
export const getAllVendors = catchAsync(async (req: AuthRequest, res: Response) => {
  const result = await vendorService.getVendors(queryParams(req), currentUser(req));
  sendSuccess(res, result, 'Vendors retrieved');
});

export const getVendorById = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await vendorService.getVendorById(req.params.id);
  sendSuccess(res, vendor, 'Vendor retrieved');
});

export const saveVendorDraft = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await vendorService.saveVendorDraft(req.body, currentUser(req));
  sendCreated(res, vendor, 'Vendor draft saved');
});

// Submits a vendor for approval. The creator picks the approver up front
// (req.body.approvedBy) — single-step approval, no separate reviewer stage.
export const createVendor = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await vendorService.submitVendor(req.body, currentUser(req));
  sendCreated(res, vendor, 'Vendor created and submitted for approval');
});

export const exportVendorsToExcel = catchAsync(async (_req: AuthRequest, res: Response) => {
  await generateVendorsExcelReport(res);
});

export const updateVendor = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await vendorService.updateVendor(req.params.id, req.body, currentUser(req));
  sendSuccess(res, vendor, 'Vendor updated');
});

// Approve or reject a pending vendor. Runs the duplicate-approved-vendor
// check, generates the real vendor code, and archives sibling drafts —
// see vendor.service.ts's updateVendorStatus for the full rationale.
export const updateVendorStatus = catchAsync(async (req: AuthRequest, res: Response) => {
  const vendor = await vendorService.updateVendorStatus(req.params.id, req.body, currentUser(req));
  sendSuccess(res, vendor, `Vendor ${req.body.status} successfully`);
});

export const deleteVendor = catchAsync(async (req: AuthRequest, res: Response) => {
  await vendorService.deleteVendor(req.params.id);
  sendNoContent(res);
});

// ═══════════════════════════════════════════════════════════════════════════════
// SYSTEM SETTINGS
// ═══════════════════════════════════════════════════════════════════════════════
export const getSystemSettings = catchAsync(async (_req: AuthRequest, res: Response) => {
  const settings = await systemSettingsService.getSystemSettings();
  sendSuccess(res, settings, 'System settings retrieved');
});

export const updateSystemSettings = catchAsync(async (req: AuthRequest, res: Response) => {
  const settings = await systemSettingsService.updateSystemSettings(
    req.body,
    currentUser(req)._id,
  );
  sendSuccess(res, settings, 'System settings updated');
});

export const getMigrationStatus = catchAsync(async (_req: AuthRequest, res: Response) => {
  const status = await systemSettingsService.getMigrationStatus();
  sendSuccess(res, status, 'Migration status retrieved');
});

export const runMigration = catchAsync(async (_req: AuthRequest, res: Response) => {
  const result = await systemSettingsService.migrateEmploymentInfoLockFields();
  sendSuccess(res, result, 'Migration completed');
});

// ═══════════════════════════════════════════════════════════════════════════════
// EMPLOYMENT INFO (Admin-level operations)
// ═══════════════════════════════════════════════════════════════════════════════
export const toggleGlobalLock = catchAsync(async (req: AuthRequest, res: Response) => {
  const settings = await employmentInfoService.toggleGlobalLock(userId(req), req.body.enabled);
  sendSuccess(res, settings, `Global employment info lock ${req.body.enabled ? 'enabled' : 'disabled'}`);
});


export const getGlobalSettings = catchAsync(async (_req: AuthRequest, res: Response) => {
  const settings = await employmentInfoService.getGlobalSettings();
  sendSuccess(res, settings, 'Global settings retrieved');
});