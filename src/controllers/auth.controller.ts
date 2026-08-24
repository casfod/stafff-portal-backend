import { Response } from 'express';
import { User } from '../models';
import { AppError } from '../utils/AppError';
import { catchAsync } from '../utils/catchAsync';
import { authService } from '../services/auth.service';
import { sendToken, sendSuccess } from '../utils/responseHandler';
import { AuthRequest } from '../middleware/auth.middleware';
import { toStringId } from '../utils/idConverter';

// ─── Register ─────────────────────────────────────────────────────────────────
export const register = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email, password, firstName, lastName } = req.body;

  const existing = await User.findOne({ email });
  if (existing) throw new AppError('Email already in use', 400);

  const user = await User.create({
    email,
    password,
    passwordConfirm: password,
    firstName,
    lastName,
    role: 'STAFF',
  });

  const { accessToken, refreshToken } = authService.generateTokens({
    id:   toStringId(user._id),
    role: user.role,
  });

  sendToken(res, accessToken, refreshToken, user, 'Registration successful');
});

// ─── Login ────────────────────────────────────────────────────────────────────
export const login = catchAsync(async (req: AuthRequest, res: Response) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email }).select('+password');
  if (!user || !(await user.comparePassword(password))) {
    throw new AppError('Incorrect email or password', 401);
  }

  if (user.isDeleted) {
    throw new AppError('This account no longer exists', 401);
  }

  if (!user.isActive) {
    throw new AppError('Your account has been deactivated. Please contact support.', 403);
  }

  const { accessToken, refreshToken } = authService.generateTokens({
    id:   toStringId(user._id),
    role: user.role,
  });

  sendToken(res, accessToken, refreshToken, user, 'Login successful');
});

// ─── Get current user ─────────────────────────────────────────────────────────
export const getMe = catchAsync(async (req: AuthRequest, res: Response) => {
  sendSuccess(res, { user: req.user }, 'User profile retrieved');
});

// ─── Refresh token ────────────────────────────────────────────────────────────
export const refreshToken = catchAsync(async (req: AuthRequest, res: Response) => {
  const { refreshToken: token } = req.body;
  if (!token) throw new AppError('Refresh token is required', 400);

  const decoded = authService.verifyToken(token, process.env.JWT_REFRESH_SECRET!);

  const user = await User.findById(decoded.id);
  if (!user)            throw new AppError('User not found', 401);
  if (!user.isActive)   throw new AppError('Account is deactivated', 403);
  if (user.isDeleted)   throw new AppError('Account no longer exists', 401);

  const { accessToken, refreshToken: newRefresh } = authService.generateTokens({
    id:   toStringId(user._id),
    role: user.role,
  });

  sendToken(res, accessToken, newRefresh, user, 'Token refreshed');
});

// ─── Forgot password ──────────────────────────────────────────────────────────
export const forgotPassword = catchAsync(async (req: AuthRequest, res: Response) => {
  await authService.sendPasswordResetEmail(req.body.email);
  // Always respond with 200 — don't reveal whether the email exists
  sendSuccess(res, null, 'If that email is registered, a reset link has been sent');
});

// ─── Reset password ───────────────────────────────────────────────────────────
export const resetPassword = catchAsync(async (req: AuthRequest, res: Response) => {
  const { token, password } = req.body;
  await authService.resetPassword(token, password);
  sendSuccess(res, null, 'Password reset successful. Please log in with your new password.');
});
