/**
 * CheckoutService — server-authoritative cart pricing, order creation, stock reservations
 * and verified payment confirmation.
 *
 * Invariants enforced here (also covered by tests):
 *  - every rupee is computed from database prices in integer paise; client totals are ignored
 *  - checkout quotes are server-stored with a TTL and can be consumed exactly once
 *  - stock is reserved inside a transaction; overselling through concurrent checkouts is refused
 *    — except where the product opts out: trackInventory=false sells without stock limits, and an
 *    allow/notify backorder policy sells past stock (the uncovered qty is recorded on the order)
 *  - payment success is accepted ONLY from verified provider events, processed idempotently
 *  - reservation expiry releases stock and cancels still-pending orders
 */
import { Inject, Injectable } from "@nestjs/common";
import { API_ENV } from "../../data/data.module";
import {
  COLLECTIONS,
  ORDER_TRANSITIONS,
  availableQty,
  backorderPolicyOf,
  trackInventoryOf,
  type CheckoutQuoteDoc,
  type CustomerAddress,
  type InventoryMovementDoc,
  type OrderDoc,
  type PaymentAttemptDoc,
  type ProductDoc,
  type ProductVariantDoc,
  type StockReservationDoc,
  type CreateOrderDto,
  type CheckoutQuoteDto,
  type AuthPrincipal,
} from "@annaadhya/contracts";
import { AppError, badRequest, conflict, gone, notFound, unauthenticated, unprocessable, type DataClient } from "@annaadhya/data-core";
import { newId, sumPaise } from "@annaadhya/utils";
import type { ApiEnv } from "../../config/env";
import { DATA_CLIENT } from "../../data/data.module";
import { SettingsService } from "../settings/settings.service";
import { AuditService } from "../audit/audit.service";
import type { PaymentProvider, VerifiedEvent } from "../payments/provider.interface";

@Injectable()
export class CheckoutService {
  constructor(
    @Inject(DATA_CLIENT) private readonly data: DataClient,
    private readonly settings: SettingsService,
    private readonly audit: AuditService,
    @Inject(API_ENV) private readonly env: ApiEnv,
    private readonly providers: PaymentProvider[],
  ) {}

  private provider(name: string): PaymentProvider {
    const p = this.providers.find((x) => x.name === name);
    if (!p) throw new AppError("service_unconfigured", `Payment provider "${name}" is not available`, 503);
    return p;
  }

  /* --------------------------------- quote --------------------------------- */

  async quote(dto: CheckoutQuoteDto): Promise<CheckoutQuoteDoc> {
    const settings = await this.settings.get();
    const variantIds = dto.items.map((i) => i.variantId);
    const variants = await this.data.getMany<ProductVariantDoc>(COLLECTIONS.productVariants, variantIds);
    const products = await this.data.getMany<ProductDoc>(
      COLLECTIONS.products,
      [...new Set([...variants.values()].map((v) => v.productId))],
    );

    const unavailable: { variantId: string; reason: string }[] = [];
    const lines: CheckoutQuoteDoc["items"] = [];

    for (const item of dto.items) {
      const v = variants.get(item.variantId);
      if (!v || v.status !== "published") {
        unavailable.push({ variantId: item.variantId, reason: "Item is no longer available" });
        continue;
      }
      const product = products.get(v.productId);
      const tracked = product ? trackInventoryOf(product) : true;
      const policy = product ? backorderPolicyOf(product) : "deny";
      const qtyAvailable = availableQty(v);
      const shortfall = tracked ? Math.max(0, item.qty - qtyAvailable) : 0;
      if (shortfall > 0 && policy === "deny") {
        unavailable.push({
          variantId: item.variantId,
          reason: qtyAvailable === 0 ? "Out of stock" : `Only ${qtyAvailable} left in stock`,
        });
        continue;
      }
      lines.push({
        variantId: v.id,
        qty: item.qty,
        unitPricePaise: v.pricePaise,
        lineTotalPaise: v.pricePaise * item.qty,
        backorderedQty: shortfall > 0 ? shortfall : undefined,
      });
    }

    const subtotal = sumPaise(lines.map((l) => l.lineTotalPaise));
    const discountTotal = 0; // product-level discounts are expressed via variant pricing; campaign discounts come later
    let shipping = 0;
    if (settings.shipping.mode === "flat_rate") {
      shipping = subtotal >= (settings.shipping.freeAbovePaise ?? Infinity) ? 0 : settings.shipping.flatRatePaise;
    } else if (settings.shipping.mode === "disabled") {
      shipping = 0;
    }
    const total = subtotal - discountTotal + shipping;

    const quoteId = newId("qte");
    const quote: CheckoutQuoteDoc = {
      id: quoteId,
      quoteId,
      items: lines,
      subtotalPaise: subtotal,
      discountTotalPaise: discountTotal,
      shippingPaise: shipping,
      totalPaise: total,
      pincode: dto.pincode,
      expiresAt: Date.now() + this.env.CHECKOUT_QUOTE_TTL_MINUTES * 60 * 1000,
      consumed: false,
      unavailable,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDemo: false,
    };
    await this.data.set(COLLECTIONS.checkoutQuotes, quote.id, quote);
    return quote;
  }

  /* ------------------------------ order create ----------------------------- */

  async createOrder(dto: CreateOrderDto, principal: AuthPrincipal): Promise<OrderDoc> {
    // No guest checkout: every order belongs to a signed-in account. The route guard
    // already enforces the bearer token; this re-check is defence in depth.
    if (!principal) throw unauthenticated("Sign in to place an order");

    // Gift-mode shape check before ANY side effect (quote consumption, stock reservation):
    // zod superRefine already enforces this for HTTP traffic; the service re-checks so direct
    // callers can never create a half-specified gift or address-less order.
    const isGift = dto.deliverToSomeoneElse === true;
    if (isGift && (!dto.recipient || !dto.recipientAddress)) {
      throw badRequest("Recipient name, phone and address are required when delivering to someone else");
    }
    if (!isGift && !dto.address) {
      throw badRequest("Delivery address is required");
    }

    const settings = await this.settings.get();
    const quote = await this.data.get<CheckoutQuoteDoc>(COLLECTIONS.checkoutQuotes, dto.quoteId);
    if (!quote) throw notFound("Checkout quote not found — refresh your cart and try again");
    if (quote.consumed) throw conflict("This checkout quote was already used");
    if (quote.expiresAt < Date.now()) throw gone("Checkout quote expired — refresh your cart to re-price items");
    if (quote.unavailable.length > 0) {
      throw unprocessable("Some items in your cart are unavailable", quote.unavailable);
    }
    if (quote.items.length === 0) throw badRequest("Cart is empty");

    if (dto.paymentMethod === "cod" && !settings.payments.codEnabled) {
      throw badRequest("Cash on delivery is not enabled");
    }
    // Provider selection is fail-closed AND environment-driven: Razorpay is the checkout
    // gateway as soon as its API credentials exist in the deployment environment (the owner
    // sets RAZORPAY_KEY_ID + RAZORPAY_KEY_SECRET in Vercel — exactly the pair the official
    // integration guide requires). The settings document's seeded default ("mock") is not an
    // owner veto: treating it as one kept correctly-keyed deployments stuck on "payments not
    // configured". The mock adapter ONLY runs in explicit mock-mode development (no Firebase,
    // non-production); a production or Firebase-backed deployment without Razorpay credentials
    // refuses the order outright — never silently create a pending order doomed to expire on
    // a dead adapter.
    let providerName: "cod" | "razorpay" | "mock";
    if (dto.paymentMethod === "cod") {
      providerName = "cod";
    } else if (this.providers.some((p) => p.name === "razorpay") && this.provider("razorpay").configured) {
      providerName = "razorpay";
    } else if (!this.env.isProduction && !this.env.firebaseConfigured) {
      providerName = "mock";
    } else {
      throw new AppError(
        "service_unconfigured",
        "Online payments are not configured yet — please contact support or try again later.",
        503,
      );
    }

    // Authoritative re-check of stock + prices at order time (quote may be minutes old)
    const variants = await this.data.getMany<ProductVariantDoc>(
      COLLECTIONS.productVariants,
      quote.items.map((i) => i.variantId),
    );
    const products = await this.data.getMany<ProductDoc>(
      COLLECTIONS.products,
      [...new Set([...variants.values()].map((v) => v.productId))],
    );
    for (const line of quote.items) {
      const v = variants.get(line.variantId);
      if (!v || v.status !== "published") {
        throw unprocessable(`An item is no longer available (${v?.sku ?? line.variantId})`);
      }
      if (v.pricePaise !== line.unitPricePaise) {
        throw gone("Prices have changed — refresh your cart to get the updated total");
      }
      const product = products.get(v.productId);
      const tracked = product ? trackInventoryOf(product) : true;
      const policy = product ? backorderPolicyOf(product) : "deny";
      if (tracked && policy === "deny" && availableQty(v) < line.qty) {
        throw unprocessable(`Insufficient stock for ${v.sku} — only ${availableQty(v)} left`);
      }
    }

    const orderNumber = await this.nextOrderNumber();

    // Consume the quote exactly once (guarded by re-read inside a transaction)
    await this.data.runTransaction(async (tx) => {
      const fresh = await tx.get<CheckoutQuoteDoc>(COLLECTIONS.checkoutQuotes, quote.id);
      if (!fresh) throw gone("Checkout quote expired — refresh your cart to re-price items");
      if (fresh.consumed) throw conflict("This checkout quote was already used");
      tx.update(COLLECTIONS.checkoutQuotes, quote.id, { consumed: true, updatedAt: Date.now() });
    });

    // Create order + reservations + payment attempt atomically where stock is concerned.
    // The provider call happens OUTSIDE the transaction (no network calls inside transactions).
    const orderId = newId("ord");
    const now = Date.now();

    // Gift delivery: when the purchaser chose "Deliver to someone else", the recipient's
    // address becomes the shipping snapshot and the recipient's identity is recorded in
    // `gift`. The purchaser keeps order ownership + payment contact; the recipient never
    // needs an account. Validated above before any side effect — and the purchaser's
    // saved address book is never touched by a gift order.
    const shippingAddress: CustomerAddress = isGift
      ? {
          id: newId("addr"),
          label: dto.recipientAddress!.label?.trim() || "Gift delivery",
          fullName: dto.recipient!.fullName,
          phone: dto.recipient!.phone,
          line1: dto.recipientAddress!.line1,
          line2: dto.recipientAddress!.line2 || "",
          landmark: dto.recipientAddress!.landmark || "",
          city: dto.recipientAddress!.city,
          state: dto.recipientAddress!.state,
          pincode: dto.recipientAddress!.pincode,
          // Normalized by the DTO schema — always "India" (India-only delivery).
          country: dto.recipientAddress!.country,
          isDefault: false,
        }
      : ({ id: newId("addr"), ...dto.address! } as CustomerAddress);
    const gift = isGift
      ? {
          recipientName: dto.recipient!.fullName,
          recipientPhone: dto.recipient!.phone,
          ...(dto.giftMessage && dto.giftMessage.trim().length > 0 ? { message: dto.giftMessage.trim() } : {}),
        }
      : undefined;

    const order: OrderDoc = {
      id: orderId,
      orderNumber,
      customerUid: principal.uid,
      // Explicit construction (validated non-empty by zod) so the OrderDoc
      // contract holds under both strict and non-strict type-checking.
      customerContact: {
        displayName: dto.customer.displayName ?? "",
        email: dto.customer.email ?? "",
        phone: dto.customer.phone ?? "",
      },
      shippingAddress,
      items: [],
      subtotalPaise: quote.subtotalPaise,
      discountTotalPaise: quote.discountTotalPaise,
      shippingPaise: quote.shippingPaise,
      taxLabel: undefined, // GST presentation configured with the business before launch
      taxPaise: 0,
      totalPaise: quote.totalPaise,
      status: "pending_payment",
      paymentStatus: "created",
      paymentProvider: providerName,
      refundStatus: "none",
      refundPaise: 0,
      isGiftOrder: isGift,
      ...(gift ? { gift } : {}),
      createdAt: now,
      updatedAt: now,
      isDemo: false,
    };

    // Item snapshots are built from live variant + product docs. Lines sold past
    // stock under an allow/notify backorder policy carry the uncovered qty.
    order.items = quote.items.map((line) => {
      const v = variants.get(line.variantId)!;
      const p = products.get(v.productId);
      return {
        variantId: v.id,
        productId: v.productId,
        sku: v.sku,
        name: p?.name ?? v.sku,
        variantLabel: v.packLabel,
        image: p?.images?.[0]?.url,
        unitPricePaise: line.unitPricePaise,
        mrpPaise: v.mrpPaise,
        qty: line.qty,
        lineTotalPaise: line.lineTotalPaise,
        backorderedQty: (() => {
          const tracked = p ? trackInventoryOf(p) : true;
          const covered = tracked ? Math.min(availableQty(v), line.qty) : line.qty;
          const short = tracked && covered < line.qty ? line.qty - covered : 0;
          return short > 0 ? short : undefined;
        })(),
      };
    });

    await this.data.set(COLLECTIONS.orders, order.id, order);

    // Reserve stock in a transaction (guards against concurrent oversell).
    // Untracked products reserve nothing; backordered lines reserve only the covered qty.
    const reservationTtl = Date.now() + this.env.STOCK_RESERVATION_TTL_MINUTES * 60 * 1000;
    for (const line of quote.items) {
      const v = variants.get(line.variantId)!;
      const product = products.get(v.productId);
      if (product && !trackInventoryOf(product)) continue; // untracked — unlimited, nothing to reserve
      await this.data.runTransaction(async (tx) => {
        const current = await tx.get<ProductVariantDoc>(COLLECTIONS.productVariants, v.id);
        if (!current) throw unprocessable(`Item ${v.sku} disappeared from stock`);
        const policy = product ? backorderPolicyOf(product) : "deny";
        const open = availableQty(current);
        if (policy === "deny" && open < line.qty) {
          throw unprocessable(`Insufficient stock for ${v.sku} — only ${open} left`);
        }
        const covered = Math.min(open, line.qty);
        if (covered <= 0) return; // fully backordered — nothing to reserve until restock
        tx.update(COLLECTIONS.productVariants, v.id, { reservedQty: current.reservedQty + covered });
        const reservation: StockReservationDoc = {
          id: newId("res"),
          orderId: order.id,
          variantId: v.id,
          qty: covered,
          status: "active",
          expiresAt: reservationTtl,
          createdAt: now,
          updatedAt: now,
          isDemo: false,
        };
        tx.set(COLLECTIONS.stockReservations, reservation.id, reservation as object);
      });
    }

    // Payment attempt + provider order creation
    if (providerName === "cod") {
      await this.data.update(COLLECTIONS.orders, order.id, { status: "confirmed", paymentStatus: "pending" });
      await this.audit.record({
        actor: { uid: principal?.uid ?? "guest", role: "customer", displayName: dto.customer.displayName },
        action: "order.create_cod",
        targetType: "order",
        targetId: order.id,
        summary: `COD order ${orderNumber} created${isGift ? ` — gift for ${gift?.recipientName}` : ""}`,
      });
      const updated = await this.data.get<OrderDoc>(COLLECTIONS.orders, order.id);
      return updated ?? order;
    }

    const attempt: PaymentAttemptDoc = {
      id: newId("pay"),
      orderId: order.id,
      orderNumber,
      provider: providerName,
      status: "created",
      amountPaise: quote.totalPaise,
      attempts: 1,
      refundPaise: 0,
      createdAt: now,
      updatedAt: now,
      isDemo: false,
    };
    await this.data.set(COLLECTIONS.paymentAttempts, attempt.id, attempt);

    try {
      const provider = this.provider(providerName);
      const { providerOrderId, clientPayload } = await provider.createPayment({ order, attempt });
      await this.data.update(COLLECTIONS.paymentAttempts, attempt.id, {
        providerOrderId,
        status: "pending",
      } as Partial<PaymentAttemptDoc>);
      await this.data.update(COLLECTIONS.orders, order.id, { paymentStatus: "pending" });
      return { ...(await this.data.get<OrderDoc>(COLLECTIONS.orders, order.id))!, clientPaymentPayload: clientPayload } as OrderDoc;
    } catch (err) {
      // Provider creation failed: release reservations and cancel the pending order.
      await this.releaseReservationsForOrder(order.id, `payment provider failure: ${err instanceof Error ? err.message : "unknown"}`);
      await this.data.update(COLLECTIONS.paymentAttempts, attempt.id, {
        status: "failed",
        lastError: err instanceof Error ? err.message : "provider failure",
      } as Partial<PaymentAttemptDoc>);
      await this.data.update(COLLECTIONS.orders, order.id, { status: "cancelled", cancelledReason: "payment_initiation_failed" });
      throw err;
    }
  }

  /* --------------------------- payment confirmation ------------------------ */

  /**
   * Applies a verified provider event. Idempotent per eventId; duplicate callbacks and
   * out-of-order events (e.g. failed after captured) are safely ignored/recorded.
   */
  async applyVerifiedEvent(event: VerifiedEvent, providerName: string): Promise<{ applied: boolean; orderId?: string; note?: string }> {
    // Webhook idempotency
    const existing = await this.data.list<{ id: string; result?: string }>(COLLECTIONS.webhookEvents, {
      where: [{ field: "eventId", op: "==", value: event.eventId }],
      limit: 1,
    });
    if (existing[0]?.result === "applied") {
      return { applied: false, note: "duplicate event" };
    }
    await this.data.set(
      COLLECTIONS.webhookEvents,
      newId("whe"),
      {
        eventId: event.eventId,
        provider: providerName,
        eventType: event.eventType,
        payloadDigest: event.eventId,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDemo: false,
      } as object,
    );

    // Resolve the attempt
    let attempt: PaymentAttemptDoc | null = null;
    if (event.providerOrderId) {
      const rows = await this.data.list<PaymentAttemptDoc>(COLLECTIONS.paymentAttempts, {
        where: [{ field: "providerOrderId", op: "==", value: event.providerOrderId }],
        limit: 1,
      });
      attempt = rows[0] ?? null;
    }
    if (!attempt) throw notFound(`Payment attempt not found for provider order ${event.providerOrderId ?? "?"}`);

    const order = await this.data.get<OrderDoc>(COLLECTIONS.orders, attempt.orderId);
    if (!order) throw notFound(`Order ${attempt.orderId} not found`);

    switch (event.outcome) {
      case "succeeded":
        return this.markSucceeded(order, attempt, event, providerName);
      case "failed":
        return this.markFailed(order, attempt, event);
      case "refunded":
        return { applied: true, orderId: order.id, note: "refund recorded by provider webhook" };
      default:
        await this.data.update(COLLECTIONS.paymentAttempts, attempt.id, { status: "pending" } as Partial<PaymentAttemptDoc>);
        return { applied: true, orderId: order.id, note: "payment pending" };
    }
  }

  private async markSucceeded(
    order: OrderDoc,
    attempt: PaymentAttemptDoc,
    event: VerifiedEvent,
    providerName: string,
  ): Promise<{ applied: boolean; orderId?: string; note?: string }> {
    if (order.paymentStatus === "succeeded") {
      return { applied: false, orderId: order.id, note: "order already paid — duplicate callback ignored" };
    }
    if (attempt.status === "succeeded") {
      return { applied: false, orderId: order.id, note: "attempt already succeeded" };
    }
    // Amount verification: mismatched captured amounts are recorded but never marked paid.
    if (event.amountPaise !== undefined && event.amountPaise !== attempt.amountPaise) {
      await this.audit.record({
        actor: { uid: "system", role: "system" },
        action: "payment.amount_mismatch",
        targetType: "order",
        targetId: order.id,
        summary: `Provider captured ${event.amountPaise} vs expected ${attempt.amountPaise}`,
      });
      throw conflict("Captured amount does not match the order total — payment held for review");
    }

    const now = Date.now();
    // Commit reservations → sold, decrement stock, confirm order (all transactional)
    await this.data.runTransaction(async (tx) => {
      const reservations = await this.data.list<StockReservationDoc>(COLLECTIONS.stockReservations, {
        where: [{ field: "orderId", op: "==", value: order.id }],
      });
      for (const r of reservations) {
        if (r.status !== "active") continue;
        const variant = await tx.get<ProductVariantDoc>(COLLECTIONS.productVariants, r.variantId);
        if (!variant) continue;
        const newStock = variant.stockOnHand - r.qty;
        const newReserved = Math.max(0, variant.reservedQty - r.qty);
        tx.update(COLLECTIONS.productVariants, r.variantId, { stockOnHand: newStock, reservedQty: newReserved });
        tx.update(COLLECTIONS.stockReservations, r.id, { status: "committed", updatedAt: now });
        const movement: InventoryMovementDoc = {
          id: newId("mv"),
          variantId: r.variantId,
          variantSku: variant.sku,
          type: "sold",
          qtyDelta: -r.qty,
          reservedDelta: -(variant.reservedQty - newReserved),
          resultingStockOnHand: newStock,
          resultingReservedQty: newReserved,
          reason: `Order ${order.orderNumber} paid via ${providerName}`,
          referenceType: "order",
          referenceId: order.id,
          createdAt: now,
          updatedAt: now,
          isDemo: false,
        };
        tx.set(COLLECTIONS.inventoryMovements, movement.id, movement as object);
      }
      tx.update(COLLECTIONS.paymentAttempts, attempt.id, {
        status: "succeeded",
        providerPaymentId: event.providerPaymentId,
        updatedAt: now,
      } as Partial<PaymentAttemptDoc>);
      tx.update(COLLECTIONS.orders, order.id, {
        status: "confirmed",
        paymentStatus: "succeeded",
        updatedAt: now,
      });
    });

    await this.audit.record({
      actor: { uid: "system", role: "system" },
      action: "payment.succeeded",
      targetType: "order",
      targetId: order.id,
      summary: `Order ${order.orderNumber} paid via ${providerName} (${event.eventType})`,
      metadata: { eventId: event.eventId, providerPaymentId: event.providerPaymentId },
    });
    return { applied: true, orderId: order.id };
  }

  private async markFailed(
    order: OrderDoc,
    attempt: PaymentAttemptDoc,
    event: VerifiedEvent,
  ): Promise<{ applied: boolean; orderId?: string; note?: string }> {
    if (order.paymentStatus === "succeeded") {
      return { applied: false, orderId: order.id, note: "ignored failure after success" };
    }
    const now = Date.now();
    await this.data.update(COLLECTIONS.paymentAttempts, attempt.id, {
      status: "failed",
      lastError: event.eventType,
      updatedAt: now,
    } as Partial<PaymentAttemptDoc>);
    await this.releaseReservationsForOrder(order.id, `payment failed (${event.eventType})`);
    if (order.status === "pending_payment") {
      await this.data.update(COLLECTIONS.orders, order.id, {
        status: "cancelled",
        cancelledReason: "payment_failed",
        paymentStatus: "failed",
        updatedAt: now,
      });
    }
    return { applied: true, orderId: order.id };
  }

  /* --------------------------- reservation expiry -------------------------- */

  async releaseExpiredReservations(): Promise<{ released: number; ordersCancelled: number }> {
    const now = Date.now();
    const stale = await this.data.list<StockReservationDoc>(COLLECTIONS.stockReservations, {
      where: [{ field: "status", op: "==", value: "active" }],
      limit: 500,
    });
    const expired = stale.filter((r) => r.expiresAt < now);
    let ordersCancelled = 0;
    const touchedOrders = new Set<string>();
    for (const r of expired) {
      await this.releaseReservation(r.id, "reservation expired");
      touchedOrders.add(r.orderId);
    }
    for (const orderId of touchedOrders) {
      const order = await this.data.get<OrderDoc>(COLLECTIONS.orders, orderId);
      if (order && order.status === "pending_payment" && order.paymentStatus !== "succeeded") {
        await this.data.update(COLLECTIONS.orders, orderId, {
          status: "cancelled",
          cancelledReason: "reservation_expired",
          paymentStatus: "cancelled",
        });
        ordersCancelled += 1;
      }
    }
    return { released: expired.length, ordersCancelled };
  }

  private async releaseReservationsForOrder(orderId: string, reason: string): Promise<void> {
    const reservations = await this.data.list<StockReservationDoc>(COLLECTIONS.stockReservations, {
      where: [{ field: "orderId", op: "==", value: orderId }],
    });
    for (const r of reservations) {
      if (r.status === "active") await this.releaseReservation(r.id, reason);
    }
  }

  private async releaseReservation(reservationId: string, reason: string): Promise<void> {
    await this.data.runTransaction(async (tx) => {
      const r = await tx.get<StockReservationDoc>(COLLECTIONS.stockReservations, reservationId);
      if (!r || r.status !== "active") return;
      const variant = await tx.get<ProductVariantDoc>(COLLECTIONS.productVariants, r.variantId);
      if (variant) {
        const newReserved = Math.max(0, variant.reservedQty - r.qty);
        tx.update(COLLECTIONS.productVariants, r.variantId, { reservedQty: newReserved });
        const movement: InventoryMovementDoc = {
          id: newId("mv"),
          variantId: r.variantId,
          variantSku: variant.sku,
          type: "released",
          qtyDelta: 0,
          reservedDelta: -(variant.reservedQty - newReserved),
          resultingStockOnHand: variant.stockOnHand,
          resultingReservedQty: newReserved,
          reason,
          referenceType: "reservation",
          referenceId: r.id,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isDemo: false,
        };
        tx.set(COLLECTIONS.inventoryMovements, movement.id, movement as object);
      }
      tx.update(COLLECTIONS.stockReservations, r.id, { status: "released", updatedAt: Date.now() });
    });
  }

  /* ------------------------------ order numbers ---------------------------- */

  private async nextOrderNumber(): Promise<string> {
    const year = new Date().getFullYear();
    const counterId = `order_number_${year}`;
    return this.data.runTransaction(async (tx) => {
      const counter = await tx.get<{ value: number }>(COLLECTIONS.counters, counterId);
      const next = (counter?.value ?? 0) + 1;
      tx.set(COLLECTIONS.counters, counterId, { value: next } as object);
      return `AN-${year}-${String(next).padStart(6, "0")}`;
    });
  }

  /* ------------------------------ admin helpers ---------------------------- */

  /** Server-side state machine guard used by the admin orders controller. */
  assertTransition(from: OrderDoc["status"], to: OrderDoc["status"]): void {
    const allowed = ORDER_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) {
      throw badRequest(`Illegal order transition: ${from} → ${to}`);
    }
  }
}
