// src/utils/responseHandler.ts
import { Response } from "express";

export interface PaginationInfo {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export interface ApiResponse<T = any> {
  success: boolean;
  statusCode: number;
  message: string;
  timestamp: string;
  data: T;
  count?: number;
  pagination?: PaginationInfo;
  token?: string;
  refreshToken?: string;
  errors?: any[];
}

// Type for paginated response from ResponseBuilder
interface PaginatedBuilderResponse<T = any> {
  data: T[];
  pagination: PaginationInfo;
  count: number;
}

// Type guard for paginated response from ResponseBuilder
function isPaginatedBuilderResponse(value: any): value is PaginatedBuilderResponse {
  return (
    value &&
    typeof value === 'object' &&
    'data' in value &&
    Array.isArray(value.data) &&
    'pagination' in value &&
    value.pagination &&
    typeof value.pagination === 'object' &&
    'count' in value
  );
}

// Type for single response from ResponseBuilder
interface SingleBuilderResponse<T = any> {
  data: T;
}

function isSingleBuilderResponse(value: any): value is SingleBuilderResponse {
  return (
    value &&
    typeof value === 'object' &&
    'data' in value &&
    !Array.isArray(value.data) &&
    !('pagination' in value)
  );
}

export const sendResponse = <T = any>(
  res: Response,
  statusCode: number,
  message: string,
  data: T,
  pagination?: PaginationInfo,
  token?: string,
  refreshToken?: string,
  errors?: any[]
): void => {
  const response: ApiResponse<T> = {
    success: statusCode >= 200 && statusCode < 300,
    statusCode,
    message: message || getDefaultMessage(statusCode),
    timestamp: new Date().toISOString(),
    data: data !== undefined && data !== null ? data : (null as any),
  };

  if (pagination) {
    response.pagination = pagination;
  }

  if (Array.isArray(data) && !pagination) {
    response.count = data.length;
  }

  if (token) {
    response.token = token;
    if (refreshToken) {
      response.refreshToken = refreshToken;
    }
  }

  if (errors && errors.length > 0) {
    response.errors = errors;
  }

  res.status(statusCode).json(response);
};

export const sendSuccess = <T = any>(
  res: Response,
  data: T,
  message = "Success",
  statusCode = 200
): void => {
  // Handle paginated response from ResponseBuilder.list()
  if (isPaginatedBuilderResponse(data)) {
    sendResponse(res, statusCode, message, data.data, data.pagination);
    return;
  }

  // Handle single response from ResponseBuilder.single() / .operation() / .stats()
  if (isSingleBuilderResponse(data)) {
    sendResponse(res, statusCode, message, data.data);
    return;
  }

  // Handle raw array
  if (Array.isArray(data)) {
    sendResponse(res, statusCode, message, data);
    return;
  }

  // Handle raw single item
  sendResponse(res, statusCode, message, data);
};

export const sendCreated = <T = any>(
  res: Response,
  data: T,
  message = "Created successfully"
): void => {
  // Handle paginated response from ResponseBuilder.list()
  if (isPaginatedBuilderResponse(data)) {
    sendResponse(res, 201, message, data.data, data.pagination);
    return;
  }

  // Handle single response from ResponseBuilder.single() / .operation()
  if (isSingleBuilderResponse(data)) {
    sendResponse(res, 201, message, data.data);
    return;
  }

  sendResponse(res, 201, message, data);
};

export const sendNoContent = (res: Response): void => {
  res.status(204).json({ status: 'success', data: null });
};

export const sendToken = (
  res: Response,
  accessToken: string,
  refreshToken: string,
  user: any,
  message = "Success"
): void => {
  sendResponse(res, 200, message, { user }, undefined, accessToken, refreshToken);
};

export const sendPaginated = <T = any>(
  res: Response,
  data: T[],
  pagination: PaginationInfo,
  message = "Success"
): void => {
  sendResponse(res, 200, message, data, pagination);
};

const getDefaultMessage = (statusCode: number): string => {
  const messages: Record<number, string> = {
    200: "Success",
    201: "Created successfully",
    204: "Deleted successfully",
    400: "Bad request",
    401: "Unauthorized",
    403: "Forbidden",
    404: "Not found",
    409: "Conflict",
    422: "Validation failed",
    500: "Internal server error",
  };
  return messages[statusCode] || "Operation completed";
};