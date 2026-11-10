import { Controller, Get } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import { Public } from "../../common/auth/guards";
import { DATA_CLIENT } from "../../data/data.module";
import { Inject } from "@nestjs/common";
import type { DataClient } from "@annaadhya/data-core";
import type { ApiEnv } from "../../config/env";
import { API_ENV } from "../../data/data.module";

@ApiTags("health")
@Controller("health")
export class HealthController {
  constructor(
    @Inject(DATA_CLIENT) private readonly data: DataClient,
    @Inject(API_ENV) private readonly env: ApiEnv,
  ) {}

  @Public()
  @Get()
  async health() {
    const stats = await this.data.stats().catch(() => null);
    return {
      status: "ok",
      provider: this.data.providerName,
      nodeEnv: this.env.NODE_ENV,
      payments: this.env.PAYMENT_PROVIDER,
      auth: this.env.firebaseConfigured ? "firebase" : "mock-dev-tokens",
      collections: stats?.collections ?? null,
      time: new Date().toISOString(),
    };
  }

  @Public()
  @Get("live")
  live() {
    return { status: "ok" };
  }
}
