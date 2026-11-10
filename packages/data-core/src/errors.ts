/** Typed application errors mapped to consistent HTTP responses by the API exception filter. */
import type { ApiErrorCode } from "@annaadhya/contracts";

export class AppError extends Error {
  constructor(
    public readonly code: ApiErrorCode,
    message: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "AppError";
  }
}

export const badRequest = (m: string, d?: unknown) => new AppError("bad_request", m, 400, d);
export const validationFailed = (m: string, d?: unknown) => new AppError("validation_failed", m, 422, d);
export const unauthenticated = (m = "Authentication required") => new AppError("unauthenticated", m, 401);
export const forbidden = (m = "You do not have permission to perform this action") =>
  new AppError("forbidden", m, 403);
export const notFound = (m = "Resource not found") => new AppError("not_found", m, 404);
export const conflict = (m: string, d?: unknown) => new AppError("conflict", m, 409, d);
export const gone = (m: string) => new AppError("gone", m, 410);
export const unprocessable = (m: string, d?: unknown) => new AppError("unprocessable", m, 422, d);
export const rateLimited = (m = "Too many requests") => new AppError("rate_limited", m, 429);
export const internal = (m = "Internal server error") => new AppError("internal", m, 500);
export const serviceUnconfigured = (m: string, d?: unknown) =>
  new AppError("service_unconfigured", m, 503, d);
