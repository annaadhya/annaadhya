/** Auth decorators & guards — server-enforced authorization, never UI-only. */
import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  SetMetadata,
  createParamDecorator,
  UseGuards,
  applyDecorators,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import type { AuthPrincipal, Permission } from "@annaadhya/contracts";
import { forbidden, unauthenticated } from "@annaadhya/data-core";
import { AuthService } from "./auth.service";
import { RateLimitGuard } from "../http/rate-limit.guard";

export { RateLimit, RATE_LIMIT_KEY } from "../http/rate-limit.guard";

export const IS_PUBLIC_KEY = "isPublic";
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

export const PERMISSIONS_KEY = "requiredPermissions";
export const RequirePermissions = (...perms: Permission[]) => SetMetadata(PERMISSIONS_KEY, perms);

@Injectable()
export class AuthGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const req = ctx.switchToHttp().getRequest<Request & { principal?: AuthPrincipal }>();
    if (isPublic) {
      // Optional auth: on public routes a presented bearer token is STILL resolved
      // (best effort) so endpoints like POST /checkout/orders can link the order to
      // the signed-in customer. An absent or invalid token simply continues as guest.
      const header = req.headers.authorization;
      if (header?.startsWith("Bearer ")) {
        const token = header.slice("Bearer ".length).trim();
        if (token) {
          try {
            req.principal = await this.authService.verifyPrincipal(token);
          } catch {
            /* invalid/expired credentials on a public route — proceed as guest */
          }
        }
      }
      return true;
    }

    const header = req.headers.authorization;
    if (!header?.startsWith("Bearer ")) throw unauthenticated("Missing bearer token");
    const token = header.slice("Bearer ".length).trim();
    if (!token) throw unauthenticated("Missing bearer token");

    req.principal = await this.authService.verifyPrincipal(token);
    return true;
  }
}

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (isPublic) return true;

    const required = this.reflector.getAllAndOverride<Permission[] | undefined>(PERMISSIONS_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = ctx.switchToHttp().getRequest<Request & { principal?: AuthPrincipal }>();
    const principal = req.principal;
    if (!principal) throw unauthenticated();
    if (!principal.isStaff) throw forbidden("Staff access required");
    const granted = new Set(principal.permissions);
    const missing = required.filter((p) => !granted.has(p));
    if (missing.length > 0) {
      throw forbidden(`Missing required permission(s): ${missing.join(", ")}`);
    }
    return true;
  }
}

/** Convenience decorator: authenticated + permission-checked + rate-limited route. */
export function Protected(...perms: Permission[]): MethodDecorator & ClassDecorator {
  return applyDecorators(UseGuards(RateLimitGuard), RequirePermissions(...perms));
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthPrincipal | null => {
    const req = ctx.switchToHttp().getRequest<Request & { principal?: AuthPrincipal }>();
    // Returns null on @Public routes (e.g. guest checkout); guarded routes always have a principal.
    return req.principal ?? null;
  },
);

export { RateLimitGuard };
