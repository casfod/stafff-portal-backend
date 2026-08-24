import jwt from "jsonwebtoken";
import crypto from "crypto";
import { User } from "../models";
import { AppError } from "../utils/AppError";
import { env } from "../config/env";
import { emailService } from "./email.service";
import { tryCatch } from "../utils/tryCatch";
import { ResponseBuilder } from "./shared/response-builder";

// ─── Types ────────────────────────────────────────────────────────────────────
interface TokenPayload {
  id: string;
  role?: string;
}

interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

class AuthService {
  generateTokens(payload: TokenPayload): AuthTokens {
    const accessToken = jwt.sign(payload, env.JWT_SECRET, {
      expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    });

    const refreshToken = jwt.sign(payload, env.JWT_REFRESH_SECRET, {
      expiresIn: env.JWT_REFRESH_EXPIRES_IN as jwt.SignOptions["expiresIn"],
    });

    return { accessToken, refreshToken };
  }

  verifyToken(token: string, secret: string): TokenPayload {
    return jwt.verify(token, secret) as TokenPayload;
  }

  async createPasswordResetToken(userId: string): Promise<string> {
    return tryCatch(async () => {
      const resetToken = crypto.randomBytes(32).toString("hex");
      const hashedToken = crypto.createHash("sha256").update(resetToken).digest("hex");

      await User.findByIdAndUpdate(userId, {
        passwordResetToken: hashedToken,
        passwordResetExpires: new Date(Date.now() + 10 * 60 * 1000),
      });

      return resetToken;
    });
  }

  async verifyPasswordResetToken(token: string): Promise<any> {
    return tryCatch(async () => {
      const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

      const user = await User.findOne({
        passwordResetToken: hashedToken,
        passwordResetExpires: { $gt: Date.now() },
      });

      if (!user) throw new AppError("Token is invalid or has expired", 400);
      return user;
    });
  }

  async sendPasswordResetEmail(email: string): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findOne({ email });
      if (!user) throw new AppError("No user found with that email", 404);

      const resetToken = await this.createPasswordResetToken(String(user._id));
      await emailService.sendPasswordResetEmail(email, resetToken);
      return ResponseBuilder.operation(null, "Password reset email sent successfully");
    });
  }

  async resetPassword(token: string, newPassword: string): Promise<any> {
    return tryCatch(async () => {
      const user = await this.verifyPasswordResetToken(token);
      user.password = newPassword;
      user.passwordResetToken = undefined;
      user.passwordResetExpires = undefined;
      await user.save();
      return ResponseBuilder.operation(null, "Password reset successfully");
    });
  }

  async refreshAccessToken(refreshToken: string): Promise<any> {
    return tryCatch(async () => {
      const decoded = this.verifyToken(refreshToken, env.JWT_REFRESH_SECRET);
      const user = await User.findById(decoded.id);
      if (!user) throw new AppError("User not found", 404);
      if (!user.isActive) throw new AppError("Account is deactivated", 401);

      const newAccessToken = jwt.sign(
        { id: String(user._id), role: user.role },
        env.JWT_SECRET,
        { expiresIn: env.JWT_EXPIRES_IN as jwt.SignOptions["expiresIn"] }
      );

      return ResponseBuilder.single(
        { accessToken: newAccessToken },
        "Access token refreshed successfully"
      );
    });
  }

  // Login method - returns tokens with user data
  async login(email: string, password: string): Promise<any> {
    return tryCatch(async () => {
      const user = await User.findOne({ email }).select("+password");
      if (!user) throw new AppError("Invalid credentials", 401);
      if (!user.isActive) throw new AppError("Account is deactivated", 401);

      const isMatch = await user.comparePassword(password);
      if (!isMatch) throw new AppError("Invalid credentials", 401);

      const { accessToken, refreshToken } = this.generateTokens({
        id: String(user._id),
        role: user.role,
      });

      const userObj = user.toObject();
      delete (userObj as any).password;

      return {
        status: 200,
        message: "Login successful",
        data: { user: userObj },
        token: accessToken,
        refreshToken,
      };
    });
  }
}

export const authService = new AuthService();