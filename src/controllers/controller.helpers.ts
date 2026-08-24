// src/controllers/controller.helpers.ts
import { Response } from 'express';
import { AuthRequest } from '../middleware/auth.middleware';
import { sendSuccess, sendCreated } from '../utils/responseHandler';
import { toStringId } from '../utils/idConverter';
import type { CurrentUser } from '../services/shared/types';

const DEFAULT_PAGE = 1;
const DEFAULT_LIMIT = 20;

// ─── Build CurrentUser from authenticated request ─────────────────────────────
export function currentUser(req: AuthRequest): CurrentUser {
  return req.user as unknown as CurrentUser;
}

// ─── Coerce empty/whitespace-only query strings to undefined ─────────────────
export function parseString(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const trimmed = value.trim();
  return trimmed === '' ? undefined : trimmed;
}

// ─── Extract pagination/search params from query string ──────────────────────
export function queryParams(req: AuthRequest) {
  const { page, limit, sort, search, status, period, ...rest } = req.query;

  const params: Record<string, unknown> = {
    page: parseNumber(page, DEFAULT_PAGE),
    limit: parseNumber(limit, DEFAULT_LIMIT),
    sort: parseString(sort),
    search: parseString(search),
    status: parseString(status),
    period: parseString(period),
  };

  // Forward every other query param (department, dateFrom, dateTo,
  // arNumber, financeReviewStatus, etc.) through the same empty-string ->
  // undefined sanitization, instead of silently dropping anything that
  // isn't one of the six named fields above. This is what each workflow's
  // filterableFields config in workflow-service.factory.ts relies on to
  // receive a value at all.
  for (const [key, value] of Object.entries(rest)) {
    const parsed = parseString(value);
    if (parsed !== undefined) {
      params[key] = parsed;
    }
  }

  return params;
}

export function parseNumber(value: unknown, fallback?: number): number | undefined {
  if (value === undefined || value === null || value === '') return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function parseBoolean(value: unknown): boolean | undefined {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const normalized = value.toLowerCase();
    if (['true', '1', 'yes', 'y'].includes(normalized)) return true;
    if (['false', '0', 'no', 'n'].includes(normalized)) return false;
  }
  return undefined;
}

export function paramId(req: AuthRequest, name = 'id'): string {
  const value = req.params[name];
  if (!value) throw new Error(`Missing required path parameter: ${name}`);
  return value;
}

// ─── Shared response helpers ────────────────────────────────────────────────
export function sendResource(
  res: Response,
  data: unknown,
  message: string,
  created = false
) {
  if (created) {
    return sendCreated(res, data, message);
  }
  return sendSuccess(res, data, message);
}

// ─── Extract file uploads safely ─────────────────────────────────────────────
export function multerFiles(req: AuthRequest): Express.Multer.File[] {
  // Handle single file upload (upload.single)
  if (req.file) {
    return [req.file];
  }
  
  // Handle multiple file upload (upload.array)
  if (req.files && Array.isArray(req.files)) {
    return req.files as Express.Multer.File[];
  }
  
  // Handle fields upload (upload.fields)
  if (req.files && typeof req.files === 'object') {
    const allFiles: Express.Multer.File[] = [];
    for (const key in req.files) {
      if (Array.isArray(req.files[key])) {
        allFiles.push(...(req.files[key] as Express.Multer.File[]));
      }
    }
    return allFiles;
  }
  
  return [];
}

export function multerFile(req: AuthRequest): Express.Multer.File | undefined {
  return req.file;
}

// ─── Role guards (matches IUser enum values) ──────────────────────────────────
export function isAdmin(req: AuthRequest): boolean {
  return ['ADMIN', 'SUPER-ADMIN'].includes(req.user!.role);
}

export function isSuperAdmin(req: AuthRequest): boolean {
  return req.user!.role === 'SUPER-ADMIN';
}

export function userId(req: AuthRequest): string {
  return toStringId(req.user!._id);
}