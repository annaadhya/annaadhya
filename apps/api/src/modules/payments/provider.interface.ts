/**
 * PaymentProvider abstraction — checkout business logic depends on this interface only,
 * so the gateway can be changed without rewriting order workflows.
 *
 * RULES enforced by all adapters:
 *  - the browser NEVER decides payment success; only verified provider callbacks/webhooks do
 *  - no external network calls from inside data transactions
 *  - idempotent event processing (webhookEvents keyed by provider event id)
 */
import type {
  OrderDoc,
  PaymentAttemptDoc,
  PaymentProviderName,
} from "@annaadhya/contracts";

export interface VerifiedEvent {
  eventId: string;
  eventType: string;
  providerOrderId?: string;
  providerPaymentId?: string;
  outcome: "succeeded" | "failed" | "refunded" | "pending";
  amountPaise?: number;
}

export interface ProviderPaymentInput {
  order: OrderDoc;
  attempt: PaymentAttemptDoc;
}

export interface PaymentProvider {
  readonly name: PaymentProviderName;
  readonly configured: boolean;
  /** Create the provider-side payment/order object. Never called inside a transaction. */
  createPayment(input: ProviderPaymentInput): Promise<{ providerOrderId?: string; clientPayload: Record<string, unknown> }>;
  /** Verify a raw webhook request and reduce it to a typed event. Throws on invalid signatures. */
  verifyWebhook(input: { headers: Record<string, string | string[] | undefined>; rawBody: Buffer }): VerifiedEvent;
  /** Optional client handshake verification (e.g. Razorpay checkout signature). */
  verifyClientCallback?(input: Record<string, unknown>): VerifiedEvent;
  /** Record a refund with the provider (when supported). */
  refund?(input: { providerOrderId?: string; providerPaymentId?: string; amountPaise: number }): Promise<{ refundId?: string }>;
}
