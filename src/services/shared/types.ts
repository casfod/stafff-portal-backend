import mongoose from 'mongoose';

// ─── Common user shape returned by populate ──────────────────────────────────
export interface PopulatedUser {
  _id: mongoose.Types.ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  role: string;
  position?: string;
}

// ─── Pagination params & result ───────────────────────────────────────────────
export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginatedResult<T> {
  results: T[];
  total: number;
  totalPages: number;
  currentPage: number;
  hasNext: boolean;
  hasPrev: boolean;
}

// ─── Common query params ──────────────────────────────────────────────────────
export interface BaseQueryParams extends PaginationParams {
  search?: string;
  sort?: string;
  status?: string;
  period?: string;
}

// ─── Current user shape (from auth middleware) ────────────────────────────────
export interface CurrentUser {
  _id: mongoose.Types.ObjectId;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SUPER-ADMIN' | 'ADMIN' | 'REVIEWER' | 'STAFF';
  position?: string;
  department?: string;
  employmentInfo?: {
    jobDetails?: {
      supervisorId?: mongoose.Types.ObjectId;
      title?: string;
    };
  };
}

// ─── File shape returned by fileService ──────────────────────────────────────
export interface FileDoc {
  _id: string;
  name?: string;
  url: string;
  publicId: string;
  format: string;
  resourceType: string;
  mimeType?: string;
  fileType?: string;
  size: number;
  originalName: string;
  folder: string;
}

// ─── Comment shape ────────────────────────────────────────────────────────────
export interface CommentInput {
  user: mongoose.Types.ObjectId;
  text: string;
  edited?: boolean;
  deleted?: boolean;
  createdAt?: Date;
  updatedAt?: Date;
}

export interface CommentResult {
  _id: mongoose.Types.ObjectId;
  user: PopulatedUser;
  text: string;
  edited: boolean;
  deleted: boolean;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Status update payload ────────────────────────────────────────────────────
export interface StatusUpdatePayload {
  status: string;
  comment?: string;
  approvedBy?: string;
  financeReviewStatus?: string;
  procurementReviewStatus?: string;
}

export interface WorkflowPayload {
  reviewedBy?: string;
  approvedBy?: string;
  copiedTo?: string[];
  status?: string;
  comments?: CommentInput[];
  [key: string]: unknown;
}

// ─── Document with workflow fields ───────────────────────────────────────────
export interface WorkflowDocument {
  _id?: mongoose.Types.ObjectId | string;
  comments?: unknown[];
  status?: string;
  createdBy?: unknown;
  copiedTo?: unknown[];
  reviewedBy?: unknown;
  approvedBy?: unknown;
  [key: string]: unknown;
}

export interface IApiListResponse<T> {
  success: boolean;
  statusCode: number;
  message: string;
  timestamp: string;
  data: T[];
  count: number;
  pagination: {
    page: number;
    limit: number;
    total: number;
    pages: number;
    hasNext?: boolean;
    hasPrev?: boolean;
  };
}

export interface IApiSingleResponse<T> {
  status: number;
  message: string;
  data: T;
}

export interface IApiStatsResponse<T> {
  status: number;
  message: string;
  amount?: number;
  data: T;
}
