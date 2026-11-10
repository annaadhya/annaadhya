/** API envelope, error codes and pagination shared by every endpoint. */
import type { AdminRole } from "./enums";

export const API_ERROR_CODES = [
  "bad_request",
  "validation_failed",
  "unauthenticated",
  "forbidden",
  "not_found",
  "conflict",
  "gone",
  "unprocessable",
  "rate_limited",
  "internal",
  "service_unconfigured",
] as const;
export type ApiErrorCode = (typeof API_ERROR_CODES)[number];

export interface ApiErrorBody {
  ok: false;
  error: {
    code: ApiErrorCode;
    message: string;
    details?: unknown;
  };
}

export interface ApiSuccessBody<T> {
  ok: true;
  data: T;
}

export type ApiResponseBody<T> = ApiSuccessBody<T> | ApiErrorBody;

export interface Page<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export const DEFAULT_PAGE_SIZE = 12;

/** Principal derived from a *verified* Firebase ID token (never from client-supplied ids). */
export interface AuthPrincipal {
  uid: string;
  email?: string;
  phone?: string;
  displayName?: string;
  /** Profile photo from the verified identity provider (Google account picture).
   *  Only present when the token carries one — never client-supplied. */
  photoUrl?: string;
  provider: string; // "google" | "password" | "phone" | "dev"
  role: AdminRole | "customer";
  permissions: string[]; // for admin roles
  isStaff: boolean;
}
