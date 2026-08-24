// src/services/shared/response-builder.ts

export interface PaginationMeta {
  page: number;
  limit: number;
  total: number;
  pages: number;
  hasNext?: boolean;
  hasPrev?: boolean;
}

export interface ApiListResponse<T> {
  data: T[];
  pagination: PaginationMeta;
  count: number;
}

export interface ApiSingleResponse<T> {
  data: T;
}

export interface ApiStatsResponse<T> {
  data: T;
  amount?: number;
}

export class ResponseBuilder {
  /**
   * Build a list response with pagination
   * Returns the data and pagination separately for the controller to handle
   */
  static list<T>(
    data: T[],
    pagination: PaginationMeta,
    _message = "Records retrieved successfully"
  ): ApiListResponse<T> {
    return {
      data,
      pagination: {
        page: pagination.page,
        limit: pagination.limit,
        total: pagination.total,
        pages: pagination.pages,
        hasNext: pagination.hasNext ?? pagination.page < pagination.pages,
        hasPrev: pagination.hasPrev ?? pagination.page > 1,
      },
      count: data.length,
    };
  }

  /**
   * Build a single item response - returns just the data
   */
  static single<T>(
    data: T,
    _message = "Record retrieved successfully"
  ): ApiSingleResponse<T> {
    return { data };
  }

  /**
   * Build a stats response - returns just the data
   */
  static stats<T>(
    data: T,
    _message = "Statistics retrieved successfully",
    amount?: number
  ): ApiStatsResponse<T> {
    const response: ApiStatsResponse<T> = { data };
    if (amount !== undefined) {
      response.amount = amount;
    }
    return response;
  }

  /**
   * Build a success response for operations (create, update, delete)
   */
  static operation<T>(
    data: T,
    _message = "Operation completed successfully"
  ): ApiSingleResponse<T> {
    return { data };
  }

  /**
   * Build a success response with no data
   */
  static success(
    _message = "Operation completed successfully"
  ): ApiSingleResponse<null> {
    return { data: null };
  }

  /**
   * Build an error response
   */
  static error(
    message = "An error occurred",
    statusCode = 500,
    errors?: any[]
  ): { status: number; message: string; data: null; errors?: any[] } {
    const response: { status: number; message: string; data: null; errors?: any[] } = {
      status: statusCode,
      message,
      data: null,
    };
    if (errors && errors.length > 0) {
      response.errors = errors;
    }
    return response;
  }

  /**
   * Extract pagination metadata from query params
   */
  static getPaginationMeta(page = 1, limit = 10, total = 0): PaginationMeta {
    const parsedPage = Math.max(1, Number(page));
    const parsedLimit = Math.min(100, Math.max(1, Number(limit)));
    const pages = Math.ceil(total / parsedLimit);

    return {
      page: parsedPage,
      limit: parsedLimit,
      total,
      pages,
      hasNext: parsedPage < pages,
      hasPrev: parsedPage > 1,
    };
  }
}