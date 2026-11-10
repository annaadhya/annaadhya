/** Centralized exception handling: AppError -> structured envelope; unknown errors are never leaked. */
import { type ArgumentsHost, Catch, type ExceptionFilter, HttpException, Logger } from "@nestjs/common";
import { AppError } from "@annaadhya/data-core";
import type { ApiErrorBody } from "@annaadhya/contracts";
import type { Response } from "express";

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger("Exceptions");

  catch(exception: unknown, host: ArgumentsHost): void {
    const res = host.switchToHttp().getResponse<Response>();

    if (exception instanceof AppError) {
      const body: ApiErrorBody = {
        ok: false,
        error: { code: exception.code, message: exception.message, details: exception.details },
      };
      if (exception.status >= 500) this.logger.error(exception.message, exception.stack);
      res.status(exception.status).json(body);
      return;
    }

    if (exception instanceof HttpException) {
      const status = exception.getStatus();
      const payload = exception.getResponse();
      const message =
        typeof payload === "string"
          ? payload
          : ((payload as { message?: string | string[] }).message instanceof Array
              ? (payload as { message: string[] }).message.join("; ")
              : ((payload as { message?: string }).message ?? exception.message));
      const body: ApiErrorBody = {
        ok: false,
        error: {
          code: status === 404 ? "not_found" : status === 401 ? "unauthenticated" : status === 403 ? "forbidden" : "bad_request",
          message: message || exception.message,
        },
      };
      res.status(status).json(body);
      return;
    }

    this.logger.error(
      exception instanceof Error ? exception.message : String(exception),
      exception instanceof Error ? exception.stack : undefined,
    );
    const body: ApiErrorBody = {
      ok: false,
      error: { code: "internal", message: "Internal server error" },
    };
    res.status(500).json(body);
  }
}
