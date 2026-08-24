import { AppError } from "./AppError";

/**
 * Wraps a service method in a try/catch that re-throws as AppError.
 * Mirrors the controller-layer catchAsync pattern for service-level safety.
 */
export async function tryCatch<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err: any) {
    // Re-throw AppErrors as-is; wrap unknown errors so they surface cleanly
    if (err?.isOperational) throw err;
    throw new AppError(err?.message ?? "An unexpected error occurred", 500);
  }
}
