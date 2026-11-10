/**
 * API client for the Annaadhya admin panel.
 *
 * - Base URL comes from NEXT_PUBLIC_API_URL. When unset (default on Vercel), calls go to
 *   the same origin under /api/v1 — the platform rewrite in the root vercel.json routes
 *   them to the api service. Set NEXT_PUBLIC_API_URL only for local development against
 *   a separately running API (e.g. http://localhost:4000/api/v1).
 * - Every response is the platform envelope `{ ok: true, data } | { ok: false, error }`;
 *   this client unwraps successes and throws a typed ApiError for failures.
 * - Auth: bearer token kept in sessionStorage (dev-token flow). sessionStorage keeps the
 *   session out of persistent disk and scoped to the tab.
 *
 * NOTE: the admin panel is intentionally client-rendered (CSR) — it sits behind auth and
 * every page calls the API from the browser, so no server-side data fetching is used.
 * (Browser calls cannot use Vercel service bindings — those resolve server-side only.)
 */
import type { ApiErrorBody, AuthPrincipal } from "./types";

export const TOKEN_KEY = "annaadhya.admin.token";
export const PRINCIPAL_KEY = "annaadhya.admin.principal";

export const API_BASE: string = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export class ApiError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details?: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

export interface DevLoginResponse {
  token: string;
  expiresIn: number;
  principal: AuthPrincipal;
  staff: unknown;
  mode: {
    dataProvider: string;
    authentication: "firebase" | "mock-dev-tokens";
    payments: string;
    razorpayConfigured: boolean;
    cloudinaryConfigured: boolean;
    sandbox: boolean;
  };
}

/* ------------------------------ token storage ------------------------------ */

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.sessionStorage.getItem(TOKEN_KEY);
}

export function setSession(token: string, principal: AuthPrincipal): void {
  window.sessionStorage.setItem(TOKEN_KEY, token);
  window.sessionStorage.setItem(PRINCIPAL_KEY, JSON.stringify(principal));
}

export function clearSession(): void {
  window.sessionStorage.removeItem(TOKEN_KEY);
  window.sessionStorage.removeItem(PRINCIPAL_KEY);
}

export function getStoredPrincipal(): AuthPrincipal | null {
  if (typeof window === "undefined") return null;
  const raw = window.sessionStorage.getItem(PRINCIPAL_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as AuthPrincipal;
    if (typeof parsed.uid !== "string") return null;
    return parsed;
  } catch {
    return null;
  }
}

/* --------------------------------- fetcher -------------------------------- */

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /** Extra query params; undefined/null values are skipped. */
  query?: Record<string, string | number | boolean | undefined | null>;
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  // String concatenation (not `new URL`) so a relative API_BASE (same-origin
  // "/api/v1" on Vercel) works alongside absolute local-development URLs.
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === "") continue;
      params.set(key, String(value));
    }
  }
  const search = params.toString();
  return `${API_BASE}${path}${search ? `?${search}` : ""}`;
}

/** Low-level call: unwraps the envelope, throws ApiError with the server's message. */
export async function api<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { Accept: "application/json" };
  if (options.body !== undefined) headers["Content-Type"] = "application/json";
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, options.query), {
      method: options.method ?? "GET",
      headers,
      body: options.body !== undefined ? JSON.stringify(options.body) : undefined,
      cache: "no-store",
    });
  } catch {
    throw new ApiError("Could not reach the API. Is the backend running?", "network_error", 0);
  }

  let body: unknown = null;
  try {
    body = await res.json();
  } catch {
    // non-JSON body (e.g. empty 502 page)
  }

  if (!res.ok || !body || (body as { ok?: boolean }).ok !== true) {
    const err = (body as ApiErrorBody | null)?.error;
    throw new ApiError(
      err?.message ?? `Request failed with status ${res.status}`,
      err?.code ?? "internal",
      res.status,
      err?.details,
    );
  }

  return (body as { ok: true; data: T }).data;
}

/** Download a binary export with the Authorization header, then hand the bytes to the browser. */
export async function downloadFile(path: string, query?: RequestOptions["query"]): Promise<void> {
  const token = getToken();
  const headers: Record<string, string> = {};
  if (token) headers.Authorization = `Bearer ${token}`;

  let res: Response;
  try {
    res = await fetch(buildUrl(path, query), { headers, cache: "no-store" });
  } catch {
    throw new ApiError("Could not reach the API for the download.", "network_error", 0);
  }

  if (!res.ok) {
    let message = `Download failed with status ${res.status}`;
    try {
      const body = (await res.json()) as ApiErrorBody;
      if (body?.error?.message) message = body.error.message;
    } catch {
      // ignore non-JSON error bodies
    }
    throw new ApiError(message, "download_failed", res.status);
  }

  const blob = await res.blob();
  const disposition = res.headers.get("Content-Disposition") ?? "";
  const match = /filename="?([^";]+)"?/.exec(disposition);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = match?.[1] ?? "download";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Give the browser a tick to start the download before revoking.
  window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/* --------------------------------- helpers -------------------------------- */

/** Convenience wrappers so call sites read like the API surface. */
export const apiGet = <T>(path: string, query?: RequestOptions["query"]) => api<T>(path, { query });
export const apiPost = <T>(path: string, body?: unknown, query?: RequestOptions["query"]) =>
  api<T>(path, { method: "POST", body: body ?? {}, query });
export const apiPatch = <T>(path: string, body?: unknown, query?: RequestOptions["query"]) =>
  api<T>(path, { method: "PATCH", body: body ?? {}, query });
export const apiDelete = <T>(path: string) => api<T>(path, { method: "DELETE" });

/** Permission check against the stored principal's permission list. */
export function can(principal: AuthPrincipal | null, permission: string): boolean {
  return Boolean(principal?.permissions.includes(permission));
}
