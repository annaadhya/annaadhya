/** Contact — public, unauthenticated, per-IP rate-limited enquiry capture. */
import { Body, Controller, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { contactMessageSchema, type AuthPrincipal, type ContactMessageDto } from "@annaadhya/contracts";
import { CurrentUser, Public } from "../../common/auth/guards";
import { RateLimit } from "../../common/http/rate-limit.guard";
import { ZodValidationPipe } from "../../common/validation/zod.pipe";
import { ContactService } from "./contact.service";

@ApiTags("contact")
@Controller("contact")
export class ContactController {
  constructor(private readonly contact: ContactService) {}

  /**
   * Public capture endpoint. 8 requests per rate-limit window per IP+route:
   * generous for a real customer composing and retrying a message, tight enough
   * to make scripted flooding pointless. Signed-in callers get their uid attached
   * for cross-reference (optional; anonymous use is fully supported).
   */
  @Post("messages")
  @Public()
  @RateLimit(8)
  async receive(
    @Body(new ZodValidationPipe(contactMessageSchema)) dto: ContactMessageDto,
    @CurrentUser() principal?: AuthPrincipal | null,
  ) {
    return this.contact.receive(dto, principal ?? null);
  }
}
