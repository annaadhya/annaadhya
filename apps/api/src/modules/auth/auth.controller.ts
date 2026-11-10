/** Auth — token verification, session profile, dev-token issuance (mock mode only), owner bootstrap. */
import { Inject, Body, Controller, Get, Post } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { z } from "zod";
import {
  bootstrapOwnerSchema,
  profileUpdateSchema,
  type AuthPrincipal,
  type BootstrapOwnerDto,
} from "@annaadhya/contracts";
import { CurrentUser, Public } from "../../common/auth/guards";
import { ZodValidationPipe } from "../../common/validation/zod.pipe";
import { AuthService } from "../../common/auth/auth.service";
import { CustomersService } from "../customers/customers.service";
import { TeamService } from "../team/team.service";
import { SettingsService } from "../settings/settings.service";
import type { ApiEnv } from "../../config/env";
import { API_ENV } from "../../data/data.module";

const devTokenSchema = z.object({
  uid: z.string().min(4).max(128),
  email: z.string().email().optional(),
  displayName: z.string().max(120).optional(),
  provider: z.enum(["google", "password", "phone", "dev"]).default("dev"),
});

const verifySchema = z.object({ idToken: z.string().min(10).max(4096) });

@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly customers: CustomersService,
    private readonly team: TeamService,
    private readonly settings: SettingsService,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  /** Exchange a verified credential for the app session identity; lazily provisions the customer profile. */
  @Public()
  @Post("verify")
  async verify(@Body(new ZodValidationPipe(verifySchema)) body: { idToken: string }) {
    const principal = await this.auth.verifyPrincipal(body.idToken);
    // Every authenticated identity gets a storefront customer profile — staff and owners
    // included (they shop and test checkout like anyone else). The admin app ignores this
    // field, so provisioning a profile for staff breaks nothing there. Returning null for
    // staff made the storefront treat a signed-in owner as a guest: no saved-address book,
    // "sign in to save addresses" prompts, and orders that never save their address.
    const customer = await this.customers.me(principal);
    const staff = await this.auth.loadStaff(principal.uid);
    // forSelf strips internal staff notes — private support content never reaches
    // a customer-facing payload (the customer can only ever see their own profile).
    return { principal, customer: this.customers.forSelf(customer), staff, mode: this.modeDescriptor() };
  }

  @Get("me")
  async me(@CurrentUser() principal: AuthPrincipal) {
    // Same contract as /auth/verify — staff always get their storefront profile too.
    const customer = await this.customers.me(principal);
    return { principal, customer: this.customers.forSelf(customer) };
  }

  @Post("profile")
  async updateProfile(
    @Body(new ZodValidationPipe(profileUpdateSchema)) dto: z.infer<typeof profileUpdateSchema>,
    @CurrentUser() principal: AuthPrincipal,
  ) {
    return this.customers.updateMe(principal, dto).then((c) => this.customers.forSelf(c));
  }

  /** Mock-mode session issuance for development/testing. Refused whenever real auth is configured. */
  @Public()
  @Post("dev/token")
  async devToken(
    @Body(new ZodValidationPipe(devTokenSchema)) body: { uid: string; email?: string; displayName?: string; provider: string },
  ) {
    if (this.env.firebaseConfigured || this.env.isProduction) {
      throw Object.assign(new Error("Dev tokens are disabled when real authentication is configured"), { status: 403 });
    }
    const issued = this.auth.issueDevToken(body);
    const principal = await this.auth.verifyPrincipal(issued.token);
    const staff = await this.auth.loadStaff(principal.uid);
    return { ...issued, principal, staff, mode: this.modeDescriptor() };
  }

  /** One-time owner provisioning (documented bootstrap; guarded by ADMIN_SETUP_KEY). */
  @Public()
  @Post("bootstrap-owner")
  async bootstrapOwner(@Body(new ZodValidationPipe(bootstrapOwnerSchema)) dto: BootstrapOwnerDto) {
    // Fields are validated non-empty by bootstrapOwnerSchema; explicit fallbacks
    // keep the required-shape contract under non-strict type-checking.
    const staff = await this.team.bootstrapOwner({
      uid: dto.uid ?? "",
      displayName: dto.displayName ?? "",
      email: dto.email ?? "",
      setupKey: dto.setupKey ?? "",
    });
    return { created: true, staff };
  }

  @Get("platform-status")
  @Public()
  async platformStatus() {
    const settings = await this.settings.get();
    return {
      mode: this.modeDescriptor(),
      paymentsSandbox: settings.payments.sandboxMode,
      codEnabled: settings.payments.codEnabled,
    };
  }

  private modeDescriptor() {
    return {
      dataProvider: this.env.DATA_PROVIDER,
      authentication: this.env.firebaseConfigured ? ("firebase" as const) : ("mock-dev-tokens" as const),
      // The storefront's checkout labels ("Pay Online" vs demo copy) key off this value, so
      // it must reflect the ACTUAL gateway capability — whether the Razorpay credential pair
      // exists in this environment — never a raw env flag that can advertise a gateway the
      // backend cannot use.
      payments: this.env.razorpayConfigured ? ("razorpay" as const) : ("mock" as const),
      razorpayConfigured: this.env.razorpayConfigured,
      cloudinaryConfigured: this.env.cloudinaryConfigured,
      sandbox: !this.env.isProduction,
    };
  }
}
