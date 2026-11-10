/** Checkout & payments endpoints — quotes, orders, provider webhooks, mock simulate (dev only). */
import { Inject, Body, Controller, Get, Param, Post, RawBodyRequest, Req } from "@nestjs/common";
import { ApiTags } from "@nestjs/swagger";
import type { Request } from "express";
import {
  checkoutQuoteSchema,
  createOrderSchema,
  type AuthPrincipal,
  type CheckoutQuoteDto,
  type CreateOrderDto,
} from "@annaadhya/contracts";
import { AppError, notFound, unauthenticated, type DataClient } from "@annaadhya/data-core";
import { COLLECTIONS, type OrderDoc, type PaymentAttemptDoc } from "@annaadhya/contracts";
import { CurrentUser, Public, RateLimit } from "../../common/auth/guards";
import { ZodValidationPipe } from "../../common/validation/zod.pipe";
import { CheckoutService } from "./checkout.service";
import { MockPaymentProvider } from "../payments/mock.provider";
import { RazorpayProvider } from "../payments/razorpay.provider";
import { AuditService } from "../audit/audit.service";
import { DATA_CLIENT } from "../../data/data.module";
import type { ApiEnv } from "../../config/env";
import { API_ENV } from "../../data/data.module";

@ApiTags("checkout")
@Controller()
export class CheckoutController {
  constructor(
    private readonly checkout: CheckoutService,
    private readonly mockProvider: MockPaymentProvider,
    private readonly razorpay: RazorpayProvider,
    private readonly audit: AuditService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    @Inject(DATA_CLIENT) private readonly data: DataClient,
  ) {}

  /** Server-priced checkout quote. The browser never supplies totals. */
  @Public()
  @RateLimit(60)
  @Post("checkout/quote")
  async quote(@Body(new ZodValidationPipe(checkoutQuoteSchema)) dto: CheckoutQuoteDto) {
    return this.checkout.quote(dto);
  }

  /** Order creation from a server quote. Requires a signed-in account — browsing is
   *  open to everyone, purchasing is not (no guest checkout). The AuthGuard enforces
   *  the bearer token; the service re-checks the principal as defence in depth. */
  @RateLimit(30)
  @Post("checkout/orders")
  async createOrder(@Body(new ZodValidationPipe(createOrderSchema)) dto: CreateOrderDto, @CurrentUser() principal: AuthPrincipal) {
    if (!principal) throw unauthenticated("Sign in to place an order");
    const order = await this.checkout.createOrder(dto, principal);
    const { clientPaymentPayload, ...orderDoc } = order as OrderDoc & { clientPaymentPayload?: Record<string, unknown> };
    return { order: orderDoc, payment: clientPaymentPayload ?? null };
  }

  /** Payment status polling for the storefront (by attempt id). */
  @Public()
  @Get("payments/:attemptId/status")
  async paymentStatus(@Param("attemptId") attemptId: string) {
    const attempt = await this.data.get<PaymentAttemptDoc>(COLLECTIONS.paymentAttempts, attemptId);
    if (!attempt) throw notFound("Payment attempt not found");
    const order = await this.data.get<OrderDoc>(COLLECTIONS.orders, attempt.orderId);
    return {
      attemptId: attempt.id,
      status: attempt.status,
      provider: attempt.provider,
      amountPaise: attempt.amountPaise,
      order: order
        ? { id: order.id, orderNumber: order.orderNumber, status: order.status, paymentStatus: order.paymentStatus }
        : null,
    };
  }

  /** Razorpay checkout handshake verification (client completes payment, we verify server-side). */
  @Public()
  @RateLimit(30)
  @Post("payments/razorpay/verify")
  async razorpayVerify(@Body() body: Record<string, unknown>) {
    const event = this.razorpay.verifyClientCallback(body);
    const result = await this.checkout.applyVerifiedEvent(event, "razorpay");
    return result;
  }

  /** Provider webhooks. Raw body is required for signature verification. */
  @Public()
  @Post("payments/webhook/:provider")
  async webhook(@Param("provider") provider: string, @Req() req: RawBodyRequest<Request>) {
    const rawBody = req.rawBody;
    if (!rawBody) throw new AppError("bad_request", "Missing raw body for signature verification", 400);
    const adapter = provider === "razorpay" ? this.razorpay : provider === "mock" ? this.mockProvider : null;
    if (!adapter) throw notFound(`Unknown payment provider: ${provider}`);
    if (provider === "razorpay" && !this.razorpay.configured) {
      throw new AppError("service_unconfigured", "Razorpay webhook secret is not configured", 503);
    }
    const event = adapter.verifyWebhook({ headers: req.headers, rawBody });
    const result = await this.checkout.applyVerifiedEvent(event, provider);
    await this.audit.record({
      actor: { uid: "system", role: "system" },
      action: `payment.webhook.${provider}`,
      targetType: "payment",
      targetId: event.eventId,
      summary: `${event.eventType} → ${event.outcome} (applied: ${result.applied})`,
    });
    return result;
  }

  /** Mock simulate endpoint — development/test only, hard-refused with Firebase configured or in production. */
  @Public()
  @RateLimit(60)
  @Post("payments/mock/confirm")
  async mockConfirm(@Body() body: { attemptId?: string; outcome?: "succeeded" | "failed" }) {
    if (this.env.isProduction || this.env.firebaseConfigured) {
      throw new AppError("forbidden", "Mock payment simulation is disabled outside mock-mode development", 403);
    }
    if (!body.attemptId || !body.outcome) throw new AppError("bad_request", "attemptId and outcome are required", 400);
    const attempt = await this.data.get<PaymentAttemptDoc>(COLLECTIONS.paymentAttempts, body.attemptId);
    if (!attempt) throw notFound("Payment attempt not found");
    if (attempt.provider !== "mock") throw new AppError("bad_request", "Not a mock payment attempt", 400);

    const event = {
      eventId: `mock_${body.attemptId}_${body.outcome}_${Date.now()}`,
      eventType: `mock.${body.outcome}`,
      providerOrderId: attempt.providerOrderId,
      outcome: body.outcome,
      amountPaise: attempt.amountPaise,
    };
    return this.checkout.applyVerifiedEvent(event, "mock");
  }
}
