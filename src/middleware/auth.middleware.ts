import { Request, Response, NextFunction } from "express";
import jwt from "jsonwebtoken";
import { User, IUser } from "../models";
import { AppError } from "../utils/AppError";
import { catchAsync } from "../utils/catchAsync";
import { env } from "../config/env";

// Remove the import of 'File' from multer - it's not needed

export interface AuthRequest extends Request {
  user?: IUser;
  file?: Express.Multer.File; // Use Express.Multer.File instead
  files?:
    | Express.Multer.File[]
    | { [fieldname: string]: Express.Multer.File[] };
}

export const protect = catchAsync(
  async (req: AuthRequest, _res: Response, next: NextFunction) => {
    let token: string | undefined;

    if (req.headers.authorization?.startsWith("Bearer")) {
      token = req.headers.authorization.split(" ")[1];
    }

    if (!token) {
      throw new AppError(
        "You are not logged in. Please log in to get access.",
        401
      );
    }

    const decoded = jwt.verify(token, env.JWT_SECRET) as {
      id: string;
      iat: number;
    };

    const currentUser = await User.findById(decoded.id);
    if (!currentUser) {
      throw new AppError(
        "The user belonging to this token no longer exists.",
        401
      );
    }

    req.user = currentUser;
    next();
  }
);

export const restrictTo = (...roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError(
        "You do not have permission to perform this action.",
        403
      );
    }
    next();
  };
};

export const restrictByPermission = (section: 'finance' | 'procurement', roles: string[]) => {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.user || !roles.includes(req.user.role)) {
      throw new AppError("User not found.", 403);
    }

    if (!roles.includes(req.user.role)) {
      throw new AppError(
        "You do not have permission to perform this action.",
        403
      );
    }

    if (section === 'finance' && !req.user.financeRole?.canCreate) {
      throw new AppError(
        "You do not have permission to access finance section.",
        403
      );
    }

    if (section === 'procurement' && !req.user.procurementRole?.canCreate) {
      throw new AppError(
        "You do not have permission to access procurement section.",
        403
      );
    }

    next();
  };
};
