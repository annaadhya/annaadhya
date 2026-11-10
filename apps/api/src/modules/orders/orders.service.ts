/** Orders — customer self-service + admin operations with server-enforced state machine. */
import { Inject, Injectable } from "@nestjs/common";
import {
  COLLECTIONS,
  ORDER_TRANSITIONS,
  type AuditLogDoc,
  type OrderDoc,
  type OrderNoteDoc,
  type OrderStatus,
  type Page,
  type PaymentAttemptDoc,
} from "@annaadhya/contracts";
import { AppError, badRequest, forbidden, notFound, type DataClient } from "@annaadhya/data-core";
import { newId, nowMillis } from "@annaadhya/utils";
import { DATA_CLIENT } from "../../data/data.module";
import { AuditService } from "../audit/audit.service";
import type { OrderNoteCreateDto, OrderStatusUpdateDto, OrderRefundDto, OrderTrackingUpdateDto } from "@annaadhya/contracts";
import type { AuthPrincipal } from "@annaadhya/contracts";
import type { PaymentProvider } from "../payments/provider.interface";

/**
 * Upper bound for the in-memory admin order-list scan. ANY filtered admin view (search,
 * status, payment status, gateway, date window) is served by ONE index-free Firestore
 * shape: a newest-first scan with no where clauses — the exact shape the unfiltered list
 * already uses in production, so no composite index can ever be missing (the fix for the
 * "filters → Internal server error" 500s, where equality filters combined with ordering
 * required composites that were never deployed — notably paymentProvider). 1000 is
 * Firestore's own max page size and far above this store's realistic order volume; the
 * response stays honest within that bound (total reflects the scanned matches).
 */
const ORDER_LIST_SCAN_LIMIT = 1000;

@Injectable()
export class OrdersService {
  constructor(
    @Inject(DATA_CLIENT) private readonly data: DataClient,
    private readonly audit: AuditService,
    private readonly providers: PaymentProvider[],
  ) {}

  /* ------------------------------- customer ------------------------------- */

  async listForCustomer(uid: string, page = 1, pageSize = 10): Promise<Page<OrderDoc>> {
    // Equality-only Firestore query — NO orderBy, so it is always servable by the
    // automatic single-field index on customerUid, no composite required. Newest-first
    // ordering and pagination happen in memory (a customer's order count is tiny).
    const rows = await this.data.list<OrderDoc>(COLLECTIONS.orders, {
      where: [{ field: "customerUid", op: "==", value: uid }],
      limit: ORDER_LIST_SCAN_LIMIT,
    });
    const sorted = rows.sort((a, b) => b.createdAt - a.createdAt);
    const total = sorted.length;
    const start = (page - 1) * pageSize;
    return {
      items: sorted.slice(start, start + pageSize),
      page,
      pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / pageSize)),
    };
  }

  async getForCustomer(orderId: string, uid: string): Promise<OrderDoc> {
    const order = await this.data.get<OrderDoc>(COLLECTIONS.orders, orderId);
    if (!order || order.customerUid !== uid) throw notFound("Order not found");
    return order;
  }

  async getOrderByNumber(orderNumber: string): Promise<OrderDoc | null> {
    const rows = await this.data.list<OrderDoc>(COLLECTIONS.orders, {
      where: [{ field: "orderNumber", op: "==", value: orderNumber }],
      limit: 1,
    });
    return rows[0] ?? null;
  }

  /* --------------------------------- admin -------------------------------- */

  async listAdmin(filters: {
    search?: string;
    status?: OrderStatus;
    paymentStatus?: OrderDoc["paymentStatus"];
    paymentProvider?: OrderDoc["paymentProvider"];
    gift?: boolean;
    from?: number;
    to?: number;
    page: number;
    pageSize: number;
  }): Promise<Page<OrderDoc>> {
    // Unfiltered view: real count + offset pagination on a plain newest-first query —
    // both shapes Firestore serves from automatic single-field indexes.
    const hasFilters = Boolean(
      filters.search ||
        filters.status ||
        filters.paymentStatus ||
        filters.paymentProvider ||
        filters.gift !== undefined ||
        filters.from !== undefined ||
        filters.to !== undefined,
    );
    if (!hasFilters) return this.paginateOrders([], filters.page, filters.pageSize);

    // ANY filtered view runs ONE index-free Firestore shape: newest-first scan with no
    // where clauses, then match in memory. Rationale: combining equality filters (status,
    // paymentStatus, paymentProvider) with createdAt ordering requires composite indexes
    // that are not guaranteed to exist in the project — a missing one surfaces as an
    // unhandled Firestore error and the admin UI shows "Internal server error" (the
    // reported filters bug; the gateway filter's composite was never even deployed).
    // Search is substring matching Firestore cannot index at all, so it always ran in
    // memory; filtering BEFORE pagination keeps `total` honest (the pre-Task-44 bug was
    // exactly filtering a page slice after the fact).
    const needle = filters.search?.toLowerCase();
    const scanned = await this.data.list<OrderDoc>(COLLECTIONS.orders, {
      orderBy: [{ field: "createdAt", direction: "desc" }],
      limit: ORDER_LIST_SCAN_LIMIT,
    });
    const matched = scanned.filter((o) => {
      if (filters.status && o.status !== filters.status) return false;
      if (filters.paymentStatus && o.paymentStatus !== filters.paymentStatus) return false;
      if (filters.paymentProvider && o.paymentProvider !== filters.paymentProvider) return false;
      if (filters.gift !== undefined && o.isGiftOrder !== filters.gift) return false;
      if (filters.from !== undefined && o.createdAt < filters.from) return false;
      if (filters.to !== undefined && o.createdAt > filters.to) return false;
      if (needle) {
        const haystack = `${o.orderNumber} ${o.customerContact.email ?? ""} ${o.customerContact.phone ?? ""} ${o.customerContact.displayName} ${o.isGiftOrder ? `${o.gift?.recipientName ?? ""} ${o.gift?.recipientPhone ?? ""}` : ""}`.toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      return true;
    });
    const total = matched.length;
    const start = (filters.page - 1) * filters.pageSize;
    return {
      items: matched.slice(start, start + filters.pageSize),
      page: filters.page,
      pageSize: filters.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / filters.pageSize)),
    };
  }

  /**
   * Unfiltered admin/customer pagination — count + one newest-first page. Both shapes are
   * index-free (count with no where; list with orderBy on a single field and no filters).
   * Filtered views intentionally do NOT go through here — they use the in-memory scan in
   * listAdmin so no composite index is ever required.
   */
  private async paginateOrders(
    where: { field: string; op: "==" | ">=" | "<="; value: unknown }[],
    page: number,
    pageSize: number,
  ): Promise<Page<OrderDoc>> {
    const total = await this.data.count(COLLECTIONS.orders, where);
    const items = await this.data.list<OrderDoc>(COLLECTIONS.orders, {
      where,
      orderBy: [{ field: "createdAt", direction: "desc" }],
      limit: pageSize,
      offset: (page - 1) * pageSize,
    });
    return { items, page, pageSize, total, totalPages: Math.max(1, Math.ceil(total / pageSize)) };
  }

  async getAdmin(orderId: string): Promise<OrderDoc> {
    const order = await this.data.get<OrderDoc>(COLLECTIONS.orders, orderId);
    if (!order) throw notFound("Order not found");
    return order;
  }

  /**
   * Chronological audit trail for one order — only events actually recorded in the
   * immutable audit log (order creation via COD, verified payment, status changes,
   * tracking updates, refunds, staff notes). Nothing is synthesised for gaps; a
   * gateway-created order legitimately starts its timeline at payment.succeeded.
   * Sorted in memory (equality-only Firestore query — no composite index needed).
   */
  async listTimeline(orderId: string): Promise<AuditLogDoc[]> {
    await this.getAdmin(orderId); // 404 semantics for unknown orders
    const events = await this.data.list<AuditLogDoc>(COLLECTIONS.auditLogs, {
      where: [
        { field: "targetType", op: "==", value: "order" },
        { field: "targetId", op: "==", value: orderId },
      ],
      limit: 200,
    });
    return events.sort((a, b) => a.createdAt - b.createdAt);
  }

  /** Internal staff notes for one order — never exposed through customer endpoints. */
  async listNotes(orderId: string): Promise<OrderNoteDoc[]> {
    await this.getAdmin(orderId);
    const notes = await this.data.list<OrderNoteDoc>(COLLECTIONS.orderNotes, {
      where: [{ field: "orderId", op: "==", value: orderId }],
      limit: 200,
    });
    return notes.sort((a, b) => b.createdAt - a.createdAt); // newest first, like a ticket thread
  }

  async addNote(orderId: string, dto: OrderNoteCreateDto, actor: AuthPrincipal): Promise<OrderNoteDoc> {
    if (!actor.permissions.includes("orders:write")) {
      throw forbidden("Adding internal notes requires the orders:write permission");
    }
    const order = await this.getAdmin(orderId);
    const now = nowMillis();
    const note: Omit<OrderNoteDoc, "id"> = {
      orderId: order.id,
      orderNumber: order.orderNumber,
      note: dto.note,
      authorUid: actor.uid,
      authorName: actor.displayName ?? actor.email ?? "staff",
      authorRole: actor.role === "customer" ? "system" : actor.role,
      createdAt: now,
      updatedAt: now,
      isDemo: false,
    };
    const created = await this.data.create(
      COLLECTIONS.orderNotes,
      note,
      { id: newId("ordnote") },
    );
    await this.audit.record({
      actor,
      action: "order.note_add",
      targetType: "order",
      targetId: order.id,
      summary: `Internal note on ${order.orderNumber}: ${dto.note.slice(0, 80)}${dto.note.length > 80 ? "…" : ""}`,
    });
    return created;
  }

  /**
   * Payment attempts recorded for one order (provider order id, payment id, status,
   * amounts). Read-only display data for the admin detail page — marking payments
   * paid/failed happens exclusively through verified provider webhooks.
   */
  async listPaymentAttempts(orderId: string): Promise<PaymentAttemptDoc[]> {
    await this.getAdmin(orderId);
    const attempts = await this.data.list<PaymentAttemptDoc>(COLLECTIONS.paymentAttempts, {
      where: [{ field: "orderId", op: "==", value: orderId }],
      limit: 20,
    });
    return attempts.sort((a, b) => b.createdAt - a.createdAt);
  }

  async updateStatus(orderId: string, dto: OrderStatusUpdateDto, actor: AuthPrincipal): Promise<OrderDoc> {
    const order = await this.getAdmin(orderId);

    if (order.paymentStatus !== "succeeded" && dto.status !== "cancelled") {
      // Never allow an unpaid order to be pushed into fulfilment by editing a field.
      throw badRequest(
        "Only paid orders can move into fulfilment states. Payment must be verified by the provider first.",
      );
    }
    if (dto.status === "refunded" && actor.permissions && !actor.permissions.includes("orders:refund")) {
      throw forbidden("Refunds require the orders:refund permission");
    }
    this.assertTransition(order.status, dto.status);

    const patch: Partial<OrderDoc> = { status: dto.status, updatedAt: nowMillis() };
    if (dto.tracking) {
      patch.tracking = {
        carrier: dto.tracking.carrier ?? "",
        trackingNumber: dto.tracking.trackingNumber ?? "",
        updatedAt: nowMillis(),
      };
    }
    if (dto.status === "cancelled") {
      patch.cancelledReason = dto.reason ?? "cancelled_by_admin";
      await this.releaseReservations(orderId);
    }
    if (dto.status === "refunded") {
      throw badRequest("Use the refund endpoint to refund an order — this records provider refunds properly.");
    }

    await this.data.update(COLLECTIONS.orders, orderId, patch);
    await this.audit.record({
      actor,
      action: "order.status_change",
      targetType: "order",
      targetId: orderId,
      summary: `Order ${order.orderNumber}: ${order.status} → ${dto.status}${dto.tracking ? ` (tracking ${dto.tracking.carrier} ${dto.tracking.trackingNumber})` : ""}`,
      metadata: { from: order.status, to: dto.status },
    });
    return this.getAdmin(orderId);
  }

  /**
   * Admin correction of shipment tracking on an already-booked shipment
   * (typo'd AWB, rebooked courier). Only meaningful once the order has
   * actually shipped — earlier states get tracking through the shipped
   * transition, and closed orders (cancelled/refunded) must keep their
   * records stable. Never touches status or payment fields.
   */
  async updateTracking(orderId: string, dto: OrderTrackingUpdateDto, actor: AuthPrincipal): Promise<OrderDoc> {
    if (!actor.permissions.includes("orders:write")) {
      throw forbidden("Tracking corrections require the orders:write permission");
    }
    const order = await this.getAdmin(orderId);
    if (order.status !== "shipped" && order.status !== "delivered") {
      throw badRequest(
        `Tracking can only be corrected on shipped or delivered orders — ${order.orderNumber} is ${order.status}.`,
      );
    }

    const previous = order.tracking;
    const patch: Partial<OrderDoc> = {
      tracking: {
        carrier: dto.carrier,
        trackingNumber: dto.trackingNumber,
        updatedAt: nowMillis(),
      },
      updatedAt: nowMillis(),
    };
    await this.data.update(COLLECTIONS.orders, orderId, patch);
    await this.audit.record({
      actor,
      action: "order.tracking_update",
      targetType: "order",
      targetId: orderId,
      summary: `Order ${order.orderNumber}: tracking ${previous ? `${previous.carrier} ${previous.trackingNumber} → ` : ""}${dto.carrier} ${dto.trackingNumber}`,
      metadata: {
        from: previous ? { carrier: previous.carrier, trackingNumber: previous.trackingNumber } : null,
        to: { carrier: dto.carrier, trackingNumber: dto.trackingNumber },
      },
    });
    return this.getAdmin(orderId);
  }

  async refund(orderId: string, dto: OrderRefundDto, actor: AuthPrincipal): Promise<OrderDoc> {
    const order = await this.getAdmin(orderId);
    if (!actor.permissions.includes("orders:refund")) throw forbidden("Refunds require the orders:refund permission");
    if (order.paymentStatus !== "succeeded") throw badRequest("Only paid orders can be refunded");
    if (dto.amountPaise > order.totalPaise - order.refundPaise) {
      throw badRequest("Refund exceeds the refundable balance");
    }

    // Record the refund through the provider when the provider supports it.
    if (order.paymentProvider !== "cod") {
      const provider = this.providers.find((p) => p.name === order.paymentProvider);
      if (provider?.refund) {
        const attempts = await this.data.list<{ providerPaymentId?: string }>(COLLECTIONS.paymentAttempts, {
          where: [{ field: "orderId", op: "==", value: orderId }],
          limit: 5,
        });
        const paymentId = attempts.find((a) => a.providerPaymentId)?.providerPaymentId;
        await provider.refund({ providerPaymentId: paymentId, amountPaise: dto.amountPaise });
      } else if (!provider) {
        throw new AppError("service_unconfigured", `Provider ${order.paymentProvider} is not available for refunds`, 503);
      }
    }

    const refundedTotal = order.refundPaise + dto.amountPaise;
    const fullRefund = refundedTotal >= order.totalPaise;
    await this.data.update(COLLECTIONS.orders, orderId, {
      refundPaise: refundedTotal,
      refundStatus: fullRefund ? "completed" : "initiated",
      paymentStatus: fullRefund ? "refunded" : order.paymentStatus,
      status: fullRefund ? "refunded" : order.status,
      updatedAt: nowMillis(),
    });
    await this.audit.record({
      actor,
      action: "order.refund",
      targetType: "order",
      targetId: orderId,
      summary: `Refund ₹${(dto.amountPaise / 100).toFixed(2)} on ${order.orderNumber}: ${dto.reason}`,
      metadata: { amountPaise: dto.amountPaise },
    });
    return this.getAdmin(orderId);
  }

  private async releaseReservations(orderId: string): Promise<void> {
    const reservations = await this.data.list<{ id: string; status: string }>(COLLECTIONS.stockReservations, {
      where: [{ field: "orderId", op: "==", value: orderId }],
    });
    for (const r of reservations) {
      if (r.status === "active") {
        await this.data.update(COLLECTIONS.stockReservations, r.id, { status: "released" });
      }
    }
  }

  assertTransition(from: OrderStatus, to: OrderStatus): void {
    const allowed = ORDER_TRANSITIONS[from] ?? [];
    if (!allowed.includes(to)) throw badRequest(`Illegal order transition: ${from} → ${to}`);
  }
}
