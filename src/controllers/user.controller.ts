import { Response } from 'express';
import { catchAsync } from '../utils/catchAsync';
import { sendSuccess, sendCreated, sendNoContent } from '../utils/responseHandler';
import { AppError } from '../utils/AppError';
import { userService } from '../services/user.service';
import { generateUsersExcelReport } from '../services/user-excel.service';
import { AuthRequest } from '../middleware/auth.middleware';
import { queryParams, userId, isAdmin, multerFile, parseBoolean, parseString } from './controller.helpers';

// ─── Admin: List all users ────────────────────────────────────────────────────
export const getAllUsers = catchAsync(async (req: AuthRequest, res: Response) => {
  const { role, isActive } = req.query;
  const params = queryParams(req);

  // Properly type the values before passing to the service
  const result = await userService.getUsers({
    role: parseString(role),
    isActive: parseBoolean(isActive),
    page: params.page as number | undefined,
    limit: params.limit as number | undefined,
    sort: params.sort as string | undefined,
    search: params.search as string | undefined,
  });

  sendSuccess(res, result, 'Users retrieved successfully');
});

// ─── Admin: Get one user ──────────────────────────────────────────────────────
export const getUserById = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await userService.getUserById(req.params.id);
  sendSuccess(res, user, 'User retrieved successfully');
});

// ─── Auth: Get current user ───────────────────────────────────────────────────
export const getMe = catchAsync(async (req: AuthRequest, res: Response) => {
  sendSuccess(res, req.user, 'User profile retrieved');
});

// ─── Auth: Update own basic profile (firstName, lastName, position) ───────────
export const updateMe = catchAsync(async (req: AuthRequest, res: Response) => {
  const uid = userId(req);
  const user = await userService.updateUser(uid, req.body, uid, false);
  sendSuccess(res, user, 'Profile updated successfully');
});

// ─── Admin: Update any user ───────────────────────────────────────────────────
export const updateUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await userService.updateUser(
    req.params.id,
    req.body,
    userId(req),
    isAdmin(req),
  );
  sendSuccess(res, user, 'User updated successfully');
});

// ─── Super-admin: Create staff account ───────────────────────────────────────
export const createStaff = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email, firstName, lastName, phone, role, position } = req.body;

  const { user, tempPassword } = await userService.createStaffAccount({
    email, firstName, lastName, phone, position,
    role: role ?? 'STAFF',
  });

  sendCreated(
    res,
    { user, tempPassword },
    'Staff account created. Temporary password sent to employee email.',
  );
});

// ─── Staff: Update own employment info ───────────────────────────────────────
export const updateMyEmploymentInfo = catchAsync(async (req: AuthRequest, res: Response) => {
  const uid = userId(req);
  const user = await userService.updateEmploymentInfo(uid, req.body, uid, false);
  sendSuccess(res, user, 'Employment information updated successfully');
});

// ─── Admin: Update any user's employment info ─────────────────────────────────
export const updateEmploymentInfo = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await userService.updateEmploymentInfo(
    req.params.id,
    req.body,
    userId(req),
    isAdmin(req),
  );
  sendSuccess(res, user, 'Employment information updated successfully');
});

// ─── Admin: Lock / unlock employment info ────────────────────────────────────
export const lockEmploymentInfo = catchAsync(async (req: AuthRequest, res: Response) => {
  const { locked } = req.body;
  if (typeof locked !== 'boolean') {
    throw new AppError('`locked` field must be a boolean', 400);
  }
  const user = await userService.setEmploymentInfoLocked(req.params.id, locked);
  sendSuccess(res, user, `Employment info ${locked ? 'locked' : 'unlocked'} successfully`);
});

// ─── Auth: Upload own avatar ──────────────────────────────────────────────────
export const uploadAvatar = catchAsync(async (req: AuthRequest, res: Response) => {
  const file = multerFile(req);
  if (!file) throw new AppError('No image file provided', 400);

  const user = await userService.updateUserAvatar(userId(req), file.buffer);
  sendSuccess(res, user, 'Avatar uploaded successfully');
});
export const uploadSignature = catchAsync(async (req: AuthRequest, res: Response) => {
  const file = multerFile(req);
  if (!file) throw new AppError('No image file provided', 400);

  const user = await userService.updateUserAvatar(userId(req), file.buffer);
  sendSuccess(res, user, 'Avatar uploaded successfully');
});

// ─── Admin: Upload avatar for any user ───────────────────────────────────────
export const uploadUserAvatar = catchAsync(async (req: AuthRequest, res: Response) => {
  const file = multerFile(req);
  if (!file) throw new AppError('No image file provided', 400);

  const user = await userService.updateUserAvatar(req.params.id, file.buffer);
  sendSuccess(res, user, 'Avatar uploaded successfully');
});

// ─── Auth: Remove own avatar ──────────────────────────────────────────────────
export const removeAvatar = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await userService.removeUserAvatar(userId(req));
  sendSuccess(res, user, 'Avatar removed successfully');
});

export const removeSignature = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await userService.removeUserSignature(userId(req));
  sendSuccess(res, user, 'Signature removed successfully');
});

// ─── Auth: Change password ────────────────────────────────────────────────────
export const changePassword = catchAsync(async (req: AuthRequest, res: Response) => {
  const { currentPassword, newPassword } = req.body;
  await userService.changePassword(userId(req), currentPassword, newPassword);
  sendSuccess(res, null, 'Password changed successfully');
});

// ─── Admin: Deactivate user ───────────────────────────────────────────────────
export const deactivateUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await userService.deactivateUser(req.params.id);
  sendSuccess(res, user, 'User deactivated successfully');
});

// ─── Admin: Activate user ─────────────────────────────────────────────────────
export const activateUser = catchAsync(async (req: AuthRequest, res: Response) => {
  const user = await userService.activateUser(req.params.id);
  sendSuccess(res, user, 'User activated successfully');
});

// ─── Super-admin: Hard delete ─────────────────────────────────────────────────
export const deleteUser = catchAsync(async (req: AuthRequest, res: Response) => {
  await userService.deleteUser(req.params.id);
  sendNoContent(res);
});

// ─── Super-admin: Export users to Excel ──────────────────────────────────────
export const exportUsersExcel = catchAsync(async (_req: AuthRequest, res: Response) => {
  await generateUsersExcelReport(res);
});