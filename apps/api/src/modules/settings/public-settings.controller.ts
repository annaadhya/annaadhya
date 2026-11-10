/** Public settings projection — the only settings surface the storefront may read.
 *  Whitelisted fields only (no GSTIN, licences, payment internals, reporting flags). */
import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { PublicStoreSettings } from "@annaadhya/contracts";
import { Public } from "../../common/auth/guards";
import { SettingsService } from "./settings.service";

@ApiTags("settings")
@Controller("settings")
export class PublicSettingsController {
  constructor(private readonly settings: SettingsService) {}

  /** Public, cacheable. Consumed by the contact page and the newsletter flag. */
  @Get("public")
  @Public()
  async publicSettings(): Promise<PublicStoreSettings> {
    return this.settings.getPublic();
  }
}
