/**
 * RazorpayAdapter — Razorpay Standard Checkout integration.
 *
 * Activation contract: the gateway is LIVE as soon as RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET
 * exist in the environment — exactly the credential pair the official integration guide
 * requires. RAZORPAY_WEBHOOK_SECRET is OPTIONAL: it is only needed for the push webhook
 * endpoint (payment.captured / payment.failed / refund.processed); the standard checkout
 * handshake verifies every payment server-side without it (HMAC of order_id|payment_id).
 *
 * Implements:
 *  - provider order creation via the Razorpay Orders API
 *  - webhook signature verification (X-Razorpay-Signature, HMAC-SHA256 of the raw body)
 *  - standard checkout handshake verification (order_id|payment_id with the key secret)
 *  - refund recording via the Payments API
 */
import { Injectable } from "@nestjs/common";
import { createHmac, timingSafeEqual } from "node:crypto";
import type { VerifiedEvent, PaymentProvider, ProviderPaymentInput } from "./provider.interface";
import { AppError, serviceUnconfigured, unprocessable } from "@annaadhya/data-core";
import { Inject } from "@nestjs/common";
import type { ApiEnv } from "../../config/env";
import { API_ENV } from "../../data/data.module";

const RAZORPAY_API = "https://api.razorpay.com/v1";

@Injectable()
export class RazorpayProvider implements PaymentProvider {
  readonly name = "razorpay" as const;

  constructor(@Inject(API_ENV) private readonly env: ApiEnv) {}

  /** Live when the credential pair from the integration guide exists. The webhook secret
   *  is deliberately NOT part of this gate: it only enables the push webhook endpoint, and
   *  requiring it here blocked standard checkout on correctly-keyed deployments. */
  get configured(): boolean {
    return this.env.razorpayConfigured;
  }

  private get keyId(): string {
    return this.env.RAZORPAY_KEY_ID!;
  }
  private get keySecret(): string {
    return this.env.RAZORPAY_KEY_SECRET!;
  }
  private get webhookSecret(): string {
    return this.env.RAZORPAY_WEBHOOK_SECRET!;
  }

  async createPayment(input: ProviderPaymentInput) {
    if (!this.configured) {
      throw serviceUnconfigured(
        "Razorpay is not configured (RAZORPAY_KEY_ID / RAZORPAY_KEY_SECRET).",
      );
    }
    // Razorpay refuses order amounts below ₹1 — fail with a clear message instead of a
    // cryptic gateway 400.
    if (input.attempt.amountPaise < 100) {
      throw unprocessable("Razorpay requires a minimum order amount of ₹1.");
    }
    const res = await fetch(`${RAZORPAY_API}/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({
        amount: input.attempt.amountPaise, // integer paise
        currency: "INR",
        receipt: input.order.orderNumber,
        notes: { orderId: input.order.id, orderNumber: input.order.orderNumber, attemptId: input.attempt.id },
      }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new AppError("internal", `Razorpay order creation failed (${res.status})`, 500, text.slice(0, 300));
    }
    const data = (await res.json()) as { id: string };
    return {
      providerOrderId: data.id,
      clientPayload: {
        provider: "razorpay",
        keyId: this.keyId,
        providerOrderId: data.id,
        attemptId: input.attempt.id,
        amountPaise: input.attempt.amountPaise,
        currency: "INR",
      },
    };
  }

  verifyWebhook({ headers, rawBody }: { headers: Record<string, string | string[] | undefined>; rawBody: Buffer }): VerifiedEvent {
    if (!this.webhookSecret) {
      throw serviceUnconfigured(
        "Razorpay webhook secret is not configured (RAZORPAY_WEBHOOK_SECRET) — webhooks stay off until it is set.",
      );
    }
    const signature = header(headers, "x-razorpay-signature");
    if (!signature) throw new AppError("bad_request", "Missing Razorpay signature header", 400);
    const expected = createHmac("sha256", this.webhookSecret).update(rawBody).digest("hex");
    if (!safeEqual(signature, expected)) {
      throw new AppError("unauthenticated", "Invalid Razorpay webhook signature", 401);
    }

    const payload = JSON.parse(rawBody.toString("utf8")) as {
      event: string;
      payload?: {
        payment?: { entity?: { id?: string; order_id?: string; amount?: number; notes?: Record<string, string> } };
        refund?: { entity?: { id?: string; payment_id?: string; amount?: number } };
      };
    };

    const payment = payload.payload?.payment?.entity;
    const refund = payload.payload?.refund?.entity;

    let outcome: VerifiedEvent["outcome"];
    switch (payload.event) {
      case "payment.captured":
        outcome = "succeeded";
        break;
      case "payment.failed":
        outcome = "failed";
        break;
      case "refund.processed":
        outcome = "refunded";
        break;
      default:
        outcome = "pending";
    }

    const eventId = header(headers, "x-razorpay-event-id") ?? `${payload.event}:${payment?.id ?? refund?.id ?? "unknown"}`;
    return {
      eventId,
      eventType: payload.event,
      providerOrderId: payment?.order_id,
      providerPaymentId: payment?.id ?? refund?.payment_id,
      outcome,
      amountPaise: payment?.amount ?? refund?.amount,
    };
  }

  verifyClientCallback(input: Record<string, unknown>): VerifiedEvent {
    if (!this.configured) {
      throw serviceUnconfigured("Razorpay is not configured on this server.");
    }
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, attemptId } = input as Record<string, string>;
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !attemptId) {
      throw new AppError("bad_request", "Missing Razorpay callback fields", 400);
    }
    const expected = createHmac("sha256", this.keySecret)
      .update(`${razorpay_order_id}|${razorpay_payment_id}`)
      .digest("hex");
    if (!safeEqual(razorpay_signature, expected)) {
      throw new AppError("unauthenticated", "Invalid Razorpay callback signature", 401);
    }
    return {
      eventId: `checkout:${razorpay_order_id}:${razorpay_payment_id}`,
      eventType: "checkout.verified",
      providerOrderId: razorpay_order_id,
      providerPaymentId: razorpay_payment_id,
      outcome: "succeeded",
    };
  }

  async refund(input: { providerOrderId?: string; providerPaymentId?: string; amountPaise: number }) {
    if (!this.configured) throw serviceUnconfigured("Razorpay is not configured.");
    const paymentId = input.providerPaymentId;
    if (!paymentId) throw new AppError("unprocessable", "Refund requires the Razorpay payment id", 422);
    const res = await fetch(`${RAZORPAY_API}/payments/${paymentId}/refund`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Basic ${Buffer.from(`${this.keyId}:${this.keySecret}`).toString("base64")}`,
      },
      body: JSON.stringify({ amount: input.amountPaise }),
    });
    if (!res.ok) {
      const text = await res.text();
      throw new AppError("internal", `Razorpay refund failed (${res.status})`, 500, text.slice(0, 300));
    }
    const data = (await res.json()) as { id?: string };
    return { refundId: data.id };
  }
}

function header(h: Record<string, string | string[] | undefined>, key: string): string | undefined {
  const v = h[key];
  return Array.isArray(v) ? v[0] : v;
}

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  return ab.length === bb.length && timingSafeEqual(ab, bb);
}
