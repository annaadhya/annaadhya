/**
 * Lightweight in-memory sliding-window rate limiter (per IP + route bucket).
 * Suitable for single-process deployments; document a shared-store limiter (e.g. Redis)
 * as a hardening step for horizontally scaled production environments.
 */
import { type CanActivate, type ExecutionContext, Injectable, SetMetadata } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { rateLimited } from "@annaadhya/data-core";
import { Inject } from "@nestjs/common";
import type { ApiEnv } from "../../config/env";
// Same token source as auth.service — importing from data.module would recreate the
// module-load TDZ cycle that app.tokens.ts exists to break (see 0598d3c).
import { API_ENV } from "../../app.tokens";

const BUCKETS = new Map<string, number[]>();

export const RATE_LIMIT_KEY = "rateLimitOverride";
export const RateLimit = (max: number) => SetMetadata(RATE_LIMIT_KEY, max);

// Periodic cleanup so the map cannot grow unbounded.
setInterval(() => {
  const cutoff = Date.now() - 2 * 3600 * 1000;
  for (const [key, hits] of BUCKETS) {
    const recent = hits.filter((t) => t > cutoff);
    if (recent.length === 0) BUCKETS.delete(key);
    else BUCKETS.set(key, recent);
  }
}, 10 * 60 * 1000).unref?.();

@Injectable()
export class RateLimitGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  canActivate(ctx: ExecutionContext): boolean {
    const req = ctx.switchToHttp().getRequest<Request>();
    const override = this.reflector.getAllAndOverride<number | undefined>(RATE_LIMIT_KEY, [
      ctx.getHandler(),
      ctx.getClass(),
    ]);
    const max = override ?? this.env.RATE_LIMIT_MAX_REQUESTS;
    const windowMs = this.env.RATE_LIMIT_WINDOW_SECONDS * 1000;
    const ip = req.ip ?? req.socket?.remoteAddress ?? "unknown";
    const bucket = `${ip}:${req.route?.path ?? req.path}`;
    const now = Date.now();
    const hits = (BUCKETS.get(bucket) ?? []).filter((t) => t > now - windowMs);
    hits.push(now);
    BUCKETS.set(bucket, hits);
    if (hits.length > max) {
      throw rateLimited(`Rate limit exceeded — try again in ${this.env.RATE_LIMIT_WINDOW_SECONDS}s`);
    }
    return true;
  }
}
