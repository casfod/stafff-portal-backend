// Add this to your auth.middleware.ts alongside `protect` and `restrictTo`

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { User } from '../models';
import { catchAsync } from '../utils/catchAsync';
import { AuthRequest } from './auth.middleware';

/**
 * optionalAuth — like `protect` but never rejects unauthenticated requests.
 * If a valid Bearer token is present it populates req.user exactly as `protect`
 * does; otherwise it simply calls next() with req.user undefined.
 * Use this on routes that are public but behave differently for logged-in users.
 */
export const optionalAuth = catchAsync(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) return next();

    const token = authHeader.split(' ')[1];
    if (!token) return next();

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET as string) as {
        id: string;
        iat: number;
      };
      const user = await User.findById(decoded.id).select('+role');
      if (user) req.user = user as any;
    } catch {
      // Invalid / expired token — treat as unauthenticated, don't throw
    }

    next();
  }
);
