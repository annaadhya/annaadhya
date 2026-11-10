/** ZodValidationPipe — request schemas live in @annaadhya/contracts and are enforced here, server-side. */
import { type ArgumentMetadata, type PipeTransform, Injectable } from "@nestjs/common";
import { ZodType, ZodTypeDef } from "zod";
import { validationFailed } from "@annaadhya/data-core";

@Injectable()
export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  // Input is deliberately `unknown`: schemas may parse a different shape than they return
  // (defaults, transforms). Only the OUTPUT type is the pipe's contract.
  constructor(private readonly schema: ZodType<T, ZodTypeDef, unknown>) {}

  transform(value: unknown, _meta: ArgumentMetadata): T {
    const result = this.schema.safeParse(value);
    if (!result.success) {
      const details = result.error.issues.map((i) => ({
        path: i.path.join("."),
        message: i.message,
        code: i.code,
      }));
      throw validationFailed(
        `Validation failed: ${details.map((d) => `${d.path || "(root)"} — ${d.message}`).join("; ")}`,
        details,
      );
    }
    return result.data;
  }
}
