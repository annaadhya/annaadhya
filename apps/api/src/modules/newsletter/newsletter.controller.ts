/** Newsletter — public capture endpoint (rate-limited globally, no auth required). */
import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import {
  newsletterSubscribeSchema,
  type AuthPrincipal,
  type NewsletterSubscribeDto,
} from "@annaadhya/contracts";
import { CurrentUser, Public } from "../../common/auth/guards";
import { ZodValidationPipe } from "../../common/validation/zod.pipe";
import { NewsletterService } from "./newsletter.service";

@ApiTags("newsletter")
@Controller("newsletter")
export class NewsletterController {
  constructor(private readonly newsletter: NewsletterService) {}

  /** Public, idempotent capture. Signed-in callers get their uid attached for cross-reference. */
  @Post("subscribe")
  @Public()
  async subscribe(
    @Body(new ZodValidationPipe(newsletterSubscribeSchema)) dto: NewsletterSubscribeDto,
    @CurrentUser() principal?: AuthPrincipal | null,
  ) {
    return this.newsletter.subscribe(dto, principal ?? null);
  }
}
