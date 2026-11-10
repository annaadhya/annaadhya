/**
 * Permission matrix as code — the single source used by:
 *  - the API permission guard (server-enforced, always authoritative)
 *  - the admin UI (to hide controls; never a substitute for the server)
 *  - docs/permissions-matrix.md (generated narrative)
 */
import type { AdminRole } from "./enums";

export const PERMISSIONS = [
  "dashboard:read",
  "products:read",
  "products:write",
  "categories:read",
  "categories:write",
  "orders:read",
  "orders:write",
  "orders:refund",
  "inventory:read",
  "inventory:write",
  "suppliers:read",
  "suppliers:write",
  "purchases:read",
  "purchases:write",
  "customers:read",
  "customers:write",
  "expenses:read",
  "expenses:write",
  "reports:read",
  "reports:export",
  "media:write",
  "team:read",
  "team:write",
  "settings:read",
  "settings:write",
  "content:read",
  "content:write",
  "audit:read",
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const READ_ONLY: Permission[] = [
  "dashboard:read",
  "products:read",
  "categories:read",
  "orders:read",
  "inventory:read",
  "suppliers:read",
  "purchases:read",
  "customers:read",
  "expenses:read",
  "reports:read",
  "team:read",
  "settings:read",
  "content:read",
];

/** Role → granted permissions. Server guard denies anything not granted here. */
export const ROLE_PERMISSION_MAP: Record<AdminRole, readonly Permission[]> = {
  owner: [...PERMISSIONS],
  manager: PERMISSIONS.filter(
    (p) =>
      p !== "team:write" &&
      p !== "settings:write" &&
      p !== "audit:read",
  ),
  inventory: [
    "products:read",
    "categories:read",
    "inventory:read",
    "inventory:write",
    "suppliers:read",
    "suppliers:write",
    "purchases:read",
    "purchases:write",
    "reports:read",
  ],
  orders_support: [
    "products:read",
    "categories:read",
    "orders:read",
    "orders:write",
    "customers:read",
    "customers:write",
    "reports:read",
  ],
  reports: [...READ_ONLY, "reports:export"],
};

/** Runtime lookup used by guards. */
export function permissionsForRole(role: AdminRole): ReadonlySet<Permission> {
  return new Set(ROLE_PERMISSION_MAP[role]);
}

export function roleHasPermission(role: AdminRole, permission: Permission): boolean {
  return permissionsForRole(role).has(permission);
}
