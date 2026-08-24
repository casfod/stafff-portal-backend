import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { sendSuccess } from '../utils/responseHandler';
import { AppError } from '../utils/AppError';
import { AuthRequest } from '../middleware/auth.middleware';
import { userId } from './controller.helpers';
import * as employmentInfoService from '../services/employment-info.service';

// ── Self-service ──────────────────────────────────────────────────────────
export const getMyEmploymentInfo = catchAsync(async (req: AuthRequest, res: Response) => {
  const info = await employmentInfoService.getUserEmploymentInfo(userId(req));
  sendSuccess(res, info, 'Employment information retrieved');
});

export const updateMyEmploymentInfo = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await employmentInfoService.updateEmploymentInfo(userId(req), req.body);
  sendSuccess(res, user, 'Employment information updated successfully');
});

// ── Admin ────────────────────────────────────────────────────────────────
export const getAllEmploymentInfoStatus = catchAsync(async (_req: AuthRequest, res: Response) => {
  const users = await employmentInfoService.getAllEmploymentInfoStatus();
  sendSuccess(res, {
    data: users,
    pagination: { page: 1, limit: users.length, total: users.length, pages: 1 },
  }, 'Employment info status retrieved');
});

export const getUserEmploymentInfo = catchAsync(async (req: AuthRequest, res: Response) => {
  const info = await employmentInfoService.getUserEmploymentInfo(req.params.id);
  sendSuccess(res, info, 'Employment info retrieved');
});

export const superAdminUpdateEmploymentInfo = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await employmentInfoService.superAdminUpdateEmploymentInfo(
    userId(req), req.params.id, req.body,
  );
  sendSuccess(res, user, 'Employment info updated');
});

export const toggleUserLock = catchAsync(async (req: AuthRequest, res: Response) => {
  const { locked } = req.body;
  if (typeof locked !== 'boolean') throw new AppError('`locked` field must be a boolean', 400);
  const user = await employmentInfoService.toggleUserLock(userId(req), req.params.id, locked);
  sendSuccess(res, user, `Employment info ${locked ? 'locked' : 'unlocked'} successfully`);
});

export const toggleGlobalLock = catchAsync(async (req: AuthRequest, res: Response) => {
  const settings = await employmentInfoService.toggleGlobalLock(userId(req), req.body.enabled);
  sendSuccess(res, settings, `Global employment info lock ${req.body.enabled ? 'enabled' : 'disabled'}`);
});

export const getGlobalSettings = catchAsync(async (_req: AuthRequest, res: Response) => {
  const settings = await employmentInfoService.getGlobalSettings();
  sendSuccess(res, settings, 'Global settings retrieved');
});