/** Uniform API envelope: every success is `{ ok: true, data }`, every failure `{ ok: false, error }`. */
import {
  type CallHandler,
  type ExecutionContext,
  type NestInterceptor,
  Injectable,
} from "@nestjs/common";
import type { ApiSuccessBody } from "@annaadhya/contracts";
import type { Response } from "express";
import { Observable } from "rxjs";
import { map } from "rxjs/operators";

export type ApiHandlerReturn<T> = T | ApiSuccessBody<T>;

@Injectable()
export class EnvelopeInterceptor<T> implements NestInterceptor<T, ApiSuccessBody<T>> {
  intercept(_ctx: ExecutionContext, next: CallHandler<T>): Observable<ApiSuccessBody<T>> {
    return next.handle().pipe(
      map((data) => {
        // Services may return an already-enveloped body (e.g. streamed files bypass this).
        if (data && typeof data === "object" && "ok" in (data as Record<string, unknown>)) {
          return data as unknown as ApiSuccessBody<T>;
        }
        return { ok: true as const, data };
      }),
    );
  }
}

/** Raw passthrough for binary responses (Excel exports). */
export const RAW_RESPONSE = Symbol("raw-response");

export function rawResponse(res: Response, filename: string, contentType: string, body: Buffer): void {
  res.setHeader("Content-Type", contentType);
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  res.setHeader("Cache-Control", "no-store");
  res.end(body);
}
