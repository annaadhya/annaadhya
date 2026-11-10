/**
 * MockPaymentProvider — explicit development/test adapter.
 *  - Creates a synthetic provider order id.
 *  - "Webhook" events are HMAC-signed JSON driven through the same verification pipeline
 *    as real providers, so order/payment state machinery is exercised identically.
 *  - Hard-refused in production.
 */
import { Injectable } from "@nestjs/common";
import { createHmac } from "node:crypto";
import type { VerifiedEvent, PaymentProvider, ProviderPaymentInput } from "./provider.interface";
import { AppError } from "@annaadhya/data-core";

const MOCK_WEBHOOK_SECRET = process.env.MOCK_WEBHOOK_SECRET ?? "mock-webhook-secret-dev-only";

@Injectable()
export class MockPaymentProvider implements PaymentProvider {
  readonly name = "mock" as const;
  readonly configured = true;

  async createPayment(input: ProviderPaymentInput) {
    const providerOrderId = `mock_order_${input.attempt.id}`;
    return {
      providerOrderId,
      clientPayload: {
        provider: "mock",
        attemptId: input.attempt.id,
        providerOrderId,
        amountPaise: input.attempt.amountPaise,
        simulateUrl: `/api/v1/payments/mock/confirm`,
        note: "Mock gateway — use the simulate endpoint in development/test only.",
      },
    };
  }

  verifyWebhook({
    headers,
    rawBody,
  }: {
    headers: Record<string, string | string[] | undefined>;
    rawBody: Buffer;
  }): VerifiedEvent {
    const signatureHeader = "x-mock-signature";
    const sig = asString(headers[signatureHeader]);
    if (!sig) throw new AppError("bad_request", "Missing mock webhook signature", 400);
    const expected = createHmac("sha256", MOCK_WEBHOOK_SECRET).update(rawBody).digest("hex");
    if (sig !== expected) throw new AppError("unauthenticated", "Invalid webhook signature", 401);

    let parsed: {
      eventId: string;
      eventType: string;
      providerOrderId?: string;
      providerPaymentId?: string;
      outcome: VerifiedEvent["outcome"];
      amountPaise?: number;
    };
    try {
      parsed = JSON.parse(rawBody.toString("utf8"));
    } catch {
      throw new AppError("bad_request", "Invalid webhook JSON", 400);
    }
    if (!parsed.eventId || !parsed.outcome) {
      throw new AppError("bad_request", "Webhook payload missing eventId/outcome", 400);
    }
    return {
      eventId: parsed.eventId,
      eventType: parsed.eventType ?? parsed.outcome,
      providerOrderId: parsed.providerOrderId,
      providerPaymentId: parsed.providerPaymentId,
      outcome: parsed.outcome,
      amountPaise: parsed.amountPaise,
    };
  }

  /** Helper for dev tooling/tests: build a correctly-signed mock webhook body. */
  static signedWebhookBody(payload: object): { body: Buffer; headers: Record<string, string> } {
    const body = Buffer.from(JSON.stringify(payload), "utf8");
    return {
      body,
      headers: {
        "content-type": "application/json",
        "x-mock-signature": createHmac("sha256", MOCK_WEBHOOK_SECRET).update(body).digest("hex"),
      },
    };
  }
}

function asString(v: string | string[] | undefined): string | undefined {
  if (Array.isArray(v)) return v[0];
  return v;
}
