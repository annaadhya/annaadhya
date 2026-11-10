/**
 * AuthGuard unit tests — the optional-authentication contract on @Public routes.
 *
 * Regression guard for the checkout bug where a signed-in customer's order was always
 * created as a guest: @Public routes short-circuited before parsing the Authorization
 * header, so POST /checkout/orders never saw the customer's principal.
 */
import { describe, expect, it, vi } from "vitest";
import type { ExecutionContext } from "@nestjs/common";
import { unauthenticated } from "@annaadhya/data-core";
import { AuthGuard } from "../src/common/auth/guards";

const principal = {
  uid: "guard-test-uid",
  email: "guard@test.dev",
  provider: "dev",
  role: "customer" as const,
  permissions: [],
  isStaff: false,
};

function makeGuard(isPublic: boolean, verify = vi.fn(async () => principal)): AuthGuard {
  const reflector = { getAllAndOverride: vi.fn().mockReturnValue(isPublic) };
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return new AuthGuard(reflector as any, { verifyPrincipal: verify } as any);
}

function ctxWith(header?: string): ExecutionContext {
  const req: { headers: Record<string, string>; principal?: unknown } = {
    headers: header ? { authorization: header } : {},
  };
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => undefined,
    getClass: () => undefined,
  } as unknown as ExecutionContext;
}

const principalOf = (ctx: ExecutionContext): unknown =>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (ctx.switchToHttp().getRequest() as any).principal;

describe("AuthGuard — optional authentication on @Public routes", () => {
  it("adopts the principal when a valid bearer token is present", async () => {
    const guard = makeGuard(true);
    const ctx = ctxWith("Bearer valid-token");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(principalOf(ctx)).toMatchObject({ uid: "guard-test-uid", isStaff: false });
  });

  it("stays guest when no header is sent (true guest checkout)", async () => {
    const guard = makeGuard(true);
    const ctx = ctxWith();
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(principalOf(ctx)).toBeUndefined();
  });

  it("degrades to guest on an invalid token instead of blocking the public action", async () => {
    const verify = vi.fn(async () => {
      throw unauthenticated("bad token");
    });
    const guard = makeGuard(true, verify);
    const ctx = ctxWith("Bearer expired-token");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(principalOf(ctx)).toBeUndefined();
  });

  it("ignores malformed headers on public routes", async () => {
    const guard = makeGuard(true);
    const ctx = ctxWith("Token something");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(principalOf(ctx)).toBeUndefined();
  });

  it("still requires a bearer token on protected routes", async () => {
    const guard = makeGuard(false);
    await expect(guard.canActivate(ctxWith())).rejects.toThrow(/Missing bearer token/);
  });

  it("protected routes verify the token and attach the principal", async () => {
    const guard = makeGuard(false);
    const ctx = ctxWith("Bearer valid-token");
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(principalOf(ctx)).toMatchObject({ uid: "guard-test-uid" });
  });
});
