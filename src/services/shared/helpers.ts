// helpers.ts - Add transformDocument function

import mongoose from "mongoose";
import { CurrentUser } from "./types";

// ─── Standard populate select strings ────────────────────────────────────────
export const USER_SELECT = "email firstName lastName role signature";
export const USER_SELECT_POSITION = "email firstName lastName role position";
export const VENDOR_SELECT =
  "businessName email contactPerson businessPhoneNumber address";

// ─── Validate and clean a MongoDB ObjectId string ────────────────────────────
export function cleanObjectId(id: unknown): string {
  if (!id) throw new Error("ID is required");
  const str = id
    .toString()
    .trim()
    .replace(/^"+|"+$/g, "");
  if (!/^[0-9a-fA-F]{24}$/.test(str)) {
    throw new Error(`Invalid ObjectId format: ${id}`);
  }
  return str;
}

// ─── Transform Mongoose document to consistent format ──────────────────────
// Converts _id to id, removes __v, preserves all other fields
export function transformDocument<T = any>(doc: any): T {
  if (!doc) return null as any;
  
  // If it's a Mongoose document, convert to plain object
  const obj = doc.toJSON ? doc.toJSON() : { ...doc };
  
  // Transform _id to id
  if (obj._id) {
    obj.id = obj._id.toString();
    delete obj._id;
  }
  
  // Remove __v if present
  delete obj.__v;

  // Parse comments if they exist and are an array
  if (obj.comments && Array.isArray(obj.comments)) {
    obj.comments = obj.comments.map((comment: any) => {
      if (comment._id) {
        comment.id = comment._id.toString();
        delete comment._id;
      }
      return comment;
    });
  }
  
  // Don't include empty files array - let the caller add it if needed
  if (obj.files && Array.isArray(obj.files) && obj.files.length === 0) {
    delete obj.files;
  }
  
  return obj as T;
}

// ─── ReviewStep interface ────────────────────────────────────────────────────
export interface ReviewStep {
  field: string;
  statusField: string;
  label: string;
  requiredRoles?: string[];
}

// ─── Build a $or role-based visibility query ─────────────────────────────────
export function buildRoleVisibilityQuery(
  currentUser: CurrentUser,
  ownerField: string = "createdBy",
  reviewSteps?: ReviewStep[]
): Record<string, unknown> {
  const uid = currentUser._id;
  
  switch (currentUser.role) {
    case "STAFF":
      return { $or: [{ [ownerField]: uid }, { copiedTo: uid }] };
      
    case "ADMIN": {
      const conditions: any[] = [
        { [ownerField]: uid },
        { approvedBy: uid },
        { copiedTo: uid }
      ];
      
      if (reviewSteps && reviewSteps.length > 0) {
        for (const step of reviewSteps) {
          conditions.push({ [step.field]: uid });
        }
      }
      
      return { $or: conditions };
    }
    
    case "REVIEWER": {
      const conditions: any[] = [
        { [ownerField]: uid },
        { reviewedBy: uid },
        { copiedTo: uid }
      ];
      
      if (reviewSteps && reviewSteps.length > 0) {
        for (const step of reviewSteps) {
          conditions.push({ [step.field]: uid });
        }
      }
      
      return { $or: conditions };
    }
    
    case "SUPER-ADMIN":
      return {
        $or: [
          { status: { $ne: "draft" } },
          { [ownerField]: uid, status: "draft" },
          { copiedTo: uid },
        ],
      };
      
    default:
      throw new Error("Invalid user role");
  }
}

// ─── Add comment to a Mongoose document ──────────────────────────────────────
export function buildComment(userId: mongoose.Types.ObjectId, text: string) {
  return {
    user: userId,
    text: text.trim(),
    edited: false,
    deleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ─── Filter deleted comments from a lean result ──────────────────────────────
export function filterDeleted<T extends { deleted?: boolean }>(
  items: T[]
): T[] {
  if (!Array.isArray(items)) return [];
  return items.filter((c) => !c.deleted);
}

// ─── Safe population helper ───────────────────────────────────────────────────
export function getPopulateOptions(
  fields: { path: string; select: string }[]
): { path: string; select: string }[] {
  return fields;
}

// ─── Parse pagination params ──────────────────────────────────────────────────
export function parsePaginationParams(
  page?: number | string,
  limit?: number | string,
  defaultLimit: number = 20
): { page: number; limit: number; skip: number } {
  const parsedPage = Math.max(1, Number(page) || 1);
  const parsedLimit = Math.min(100, Math.max(1, Number(limit) || defaultLimit));
  return {
    page: parsedPage,
    limit: parsedLimit,
    skip: (parsedPage - 1) * parsedLimit,
  };
}

export function validateId(id: string, context: string) {
  return cleanObjectId(id) as string;
}