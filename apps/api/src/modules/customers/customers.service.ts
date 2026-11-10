/**
 * Customers — profile self-service (owner-only access) + admin support views with
 * restricted personal-data exposure. Customers can only ever read/update their own record,
 * derived from the verified token (never a client-supplied id).
 *
 * Admin directory notes:
 *  - every filtered query is served by ONE index-free Firestore shape (a plain
 *    newest-first scan matched in memory) — combining equality filters with createdAt
 *    ordering would need composite indexes that are not guaranteed to exist, which was
 *    the root cause of the historical admin "filters not working" bug (see orders.service);
 *  - metric definitions live on CustomerDirectoryRow in @annaadhya/contracts; the pure
 *    helpers below (isRealOrder / isCompletedSpendOrder / aggregateOrdersByCustomer /
 *    matchesDirectoryFilters / sortDirectoryRows) are shared verbatim with the reports
 *    XLSX export so the screen and the export can never disagree;
 *  - storefront-facing responses pass through forSelf(), which strips internal staff
 *    notes — private support content must never reach a customer-facing payload.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  COLLECTIONS,
  type CustomerActivityFilter,
  type CustomerDirectoryPage,
  type CustomerDirectoryRow,
  type CustomerDirectorySort,
  type CustomerDirectorySummary,
  type CustomerDoc,
  type CustomerListQueryDto,
  type OrderDoc,
  type Page,
  type ProfileUpdateDto,
  type AuthPrincipal,
} from "@annaadhya/contracts";
import { forbidden, notFound, type DataClient } from "@annaadhya/data-core";
import { newId } from "@annaadhya/utils";
import { DATA_CLIENT } from "../../data/data.module";
import { AuditService } from "../audit/audit.service";

/** Customers scan ceiling for the directory — matches the reports export ceiling. */
const CUSTOMER_DIRECTORY_SCAN_LIMIT = 5000;
/** Orders scan ceiling for metrics/history — same trade-off as the Orders console. */
const CUSTOMER_ORDER_SCAN_LIMIT = 1000;

/* ------------------------- pure metric helpers (shared) ------------------------- */

export interface CustomerOrderAggregate {
  orderCount: number;
  completedOrderCount: number;
  totalSpendPaise: number;
  lastOrderAt?: number;
  lastOrderId?: string;
  lastOrderNumber?: string;
}

/** A "real" order entered the fulfilment lifecycle — ghost checkouts never count. */
export function isRealOrder(order: OrderDoc): boolean {
  return order.status !== "pending_payment" || order.paymentStatus === "succeeded";
}

/**
 * A completed order contributes to customer spend: online orders whose payment
 * succeeded and that were not cancelled/refunded, plus COD orders that reached
 * "delivered" (the only point where COD money is actually collected).
 */
export function isCompletedSpendOrder(order: OrderDoc): boolean {
  if (!isRealOrder(order)) return false;
  if (order.status === "cancelled" || order.status === "refunded") return false;
  if (order.paymentProvider === "cod") {
    return order.status === "delivered" && order.paymentStatus !== "failed" && order.paymentStatus !== "cancelled";
  }
  return order.paymentStatus === "succeeded";
}

/** Aggregate real orders per customerUid — guest checkouts (no uid) never join. */
export function aggregateOrdersByCustomer(orders: OrderDoc[]): Map<string, CustomerOrderAggregate> {
  const byUid = new Map<string, CustomerOrderAggregate>();
  for (const order of orders) {
    const uid = order.customerUid;
    if (!uid) continue;
    const agg = byUid.get(uid) ?? { orderCount: 0, completedOrderCount: 0, totalSpendPaise: 0 };
    if (isRealOrder(order)) {
      agg.orderCount += 1;
      if (!agg.lastOrderAt || order.createdAt > agg.lastOrderAt) {
        agg.lastOrderAt = order.createdAt;
        agg.lastOrderId = order.id;
        agg.lastOrderNumber = order.orderNumber;
      }
      if (isCompletedSpendOrder(order)) {
        agg.completedOrderCount += 1;
        // Net of any refund recorded on the order — refunds are never counted as spend.
        agg.totalSpendPaise += Math.max(0, order.totalPaise - (order.refundPaise ?? 0));
      }
    }
    byUid.set(uid, agg);
  }
  return byUid;
}

export interface DirectoryFilters {
  search?: string;
  activity: CustomerActivityFilter;
  status: "all" | "active" | "suspended";
  registeredFrom?: number;
  registeredTo?: number;
}

/** Directory row filter — pure, shared with the reports XLSX export. */
export function matchesDirectoryFilters(
  customer: CustomerDoc,
  agg: CustomerOrderAggregate,
  filters: DirectoryFilters,
): boolean {
  if (filters.status !== "all" && customer.accountStatus !== filters.status) return false;
  if (filters.registeredFrom !== undefined && customer.createdAt < filters.registeredFrom) return false;
  if (filters.registeredTo !== undefined && customer.createdAt > filters.registeredTo) return false;
  if (filters.activity === "with_orders" && agg.orderCount < 1) return false;
  if (filters.activity === "no_orders" && agg.orderCount !== 0) return false;
  if (filters.activity === "repeat" && agg.orderCount < 2) return false;
  const needle = filters.search?.toLowerCase();
  if (needle) {
    const haystack = [customer.displayName, customer.email, customer.phone, customer.uid, customer.id]
      .filter(Boolean)
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

/** Directory sort — pure, shared with the reports XLSX export. */
export function sortDirectoryRows(rows: CustomerDirectoryRow[], sort: CustomerDirectorySort): CustomerDirectoryRow[] {
  const sorted = [...rows];
  switch (sort) {
    case "spend_desc":
      sorted.sort((a, b) => b.totalSpendPaise - a.totalSpendPaise || b.orderCount - a.orderCount);
      break;
    case "orders_desc":
      sorted.sort((a, b) => b.orderCount - a.orderCount || b.totalSpendPaise - a.totalSpendPaise);
      break;
    case "recent_order":
      sorted.sort((a, b) => (b.lastOrderAt ?? 0) - (a.lastOrderAt ?? 0));
      break;
    case "recent_registered":
      sorted.sort((a, b) => b.createdAt - a.createdAt);
      break;
    case "name_asc":
      sorted.sort((a, b) => a.displayName.localeCompare(b.displayName));
      break;
  }
  return sorted;
}

const IST_OFFSET_MINUTES = 330;

/** [start, end] of the IST calendar month containing `millis` — the "New Customers" window. */
export function istMonthWindow(millis: number): { from: number; to: number } {
  const shifted = new Date(millis + IST_OFFSET_MINUTES * 60_000);
  const startUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1);
  const endUtc = Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth() + 1, 1);
  return { from: startUtc - IST_OFFSET_MINUTES * 60_000, to: endUtc - IST_OFFSET_MINUTES * 60_000 };
}

@Injectable()
export class CustomersService {
  constructor(
    @Inject(DATA_CLIENT) private readonly data: DataClient,
    private readonly audit: AuditService,
  ) {}

  async me(principal: AuthPrincipal): Promise<CustomerDoc> {
    const rows = await this.data.list<CustomerDoc>(COLLECTIONS.customers, {
      where: [{ field: "uid", op: "==", value: principal.uid }],
      limit: 1,
    });
    if (rows[0]) return rows[0];
    // Lazily provision the customer profile on first authenticated call
    const created = await this.data.create<CustomerDoc>(
      COLLECTIONS.customers,
      {
        uid: principal.uid,
        displayName: principal.displayName ?? principal.email?.split("@")[0] ?? "Customer",
        email: principal.email,
        phone: principal.phone,
        providers: [principal.provider],
        accountStatus: "active",
        addresses: [],
        marketingOptIn: false,
      } as object as CustomerDoc,
      { id: `cust_${principal.uid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28)}` },
    );
    return created;
  }

  async updateMe(principal: AuthPrincipal, dto: ProfileUpdateDto): Promise<CustomerDoc> {
    const me = await this.me(principal);
    return this.data.update(COLLECTIONS.customers, me.id, {
      displayName: dto.displayName ?? me.displayName,
      phone: dto.phone === "" ? undefined : (dto.phone ?? me.phone),
      marketingOptIn: dto.marketingOptIn ?? me.marketingOptIn,
      updatedAt: Date.now(),
    } as Partial<CustomerDoc>);
  }

  async addAddress(principal: AuthPrincipal, address: Omit<CustomerDoc["addresses"][number], "id">): Promise<CustomerDoc> {
    const me = await this.me(principal);
    const addresses = [...me.addresses];
    // newId() is monotonic-ish and collision-safe — the previous Date.now-based id made
    // two addresses saved within the same millisecond share an id (data corruption).
    const id = newId("addr");
    // The first saved address becomes the default automatically; an explicit isDefault
    // request demotes every other address so exactly one default exists at any time.
    const shouldBeDefault = address.isDefault || addresses.length === 0;
    addresses.push({ ...address, id, isDefault: shouldBeDefault });
    if (shouldBeDefault) {
      for (const a of addresses) a.isDefault = a.id === id;
    }
    const patch: Partial<CustomerDoc> = { addresses, updatedAt: Date.now() };
    if (shouldBeDefault) patch.defaultAddressId = id;
    return this.data.update(COLLECTIONS.customers, me.id, patch);
  }

  async removeAddress(principal: AuthPrincipal, addressId: string): Promise<CustomerDoc> {
    const me = await this.me(principal);
    const removed = me.addresses.find((a) => a.id === addressId);
    const addresses = me.addresses.filter((a) => a.id !== addressId);
    const patch: Partial<CustomerDoc> = { addresses, updatedAt: Date.now() };
    // Removing the default must not leave the book defaultless — promote the first survivor.
    if (removed?.isDefault && addresses.length > 0) {
      addresses[0] = { ...addresses[0], isDefault: true };
      patch.defaultAddressId = addresses[0].id;
    }
    return this.data.update(COLLECTIONS.customers, me.id, patch);
  }

  /** Edit an existing address (full replacement of its fields) and/or make it the default.
   *  Default invariant mirrors addAddress: exactly one isDefault address at any time, and
   *  demoting the current default promotes the first survivor so the book never loses its
   *  default (checkout prefill depends on one existing). */
  async updateAddress(
    principal: AuthPrincipal,
    addressId: string,
    dto: Omit<CustomerDoc["addresses"][number], "id">,
  ): Promise<CustomerDoc> {
    const me = await this.me(principal);
    const existing = me.addresses.find((a) => a.id === addressId);
    if (!existing) throw notFound("Address not found");
    const addresses = me.addresses.map((a) => ({ ...a }));
    if (dto.isDefault) {
      for (const a of addresses) a.isDefault = a.id === addressId;
    } else if (existing.isDefault && addresses.length > 1) {
      // Demoting the default: promote the first other address so a default always exists.
      const survivor = addresses.find((a) => a.id !== addressId)!;
      survivor.isDefault = true;
    }
    const target = addresses.find((a) => a.id === addressId)!;
    target.label = dto.label;
    target.fullName = dto.fullName;
    target.phone = dto.phone;
    target.line1 = dto.line1;
    target.line2 = dto.line2;
    target.landmark = dto.landmark;
    target.city = dto.city;
    target.state = dto.state;
    target.pincode = dto.pincode;
    // Normalized by the DTO schema — always "India" (India-only delivery).
    target.country = dto.country;
    target.isDefault = dto.isDefault || (existing.isDefault && addresses.length === 1);
    const patch: Partial<CustomerDoc> = { addresses, updatedAt: Date.now() };
    const newDefault = addresses.find((a) => a.isDefault);
    if (newDefault) patch.defaultAddressId = newDefault.id;
    return this.data.update(COLLECTIONS.customers, me.id, patch);
  }

  /** Request account deletion — records the request; execution is a documented manual GDPR-style process. */
  async requestDeletion(principal: AuthPrincipal): Promise<{ received: true }> {
    const me = await this.me(principal);
    await this.data.update(COLLECTIONS.customers, me.id, {
      accountStatus: "suspended",
      notes: `${me.notes ? `${me.notes}\n` : ""}[${new Date().toISOString()}] Account deletion requested by customer.`,
      updatedAt: Date.now(),
    } as Partial<CustomerDoc>);
    return { received: true };
  }

  /* --------------------------------- admin -------------------------------- */

  /**
   * Admin customer directory — search / activity / status / registration window /
   * sort / pagination + a summary computed over the SAME filtered cohort the table
   * lists (the Orders-console convention so cards and rows never disagree).
   * List rows carry metrics but NOT addresses or note content — the detail endpoint
   * is the only surface that returns those, keeping list payloads minimal.
   */
  async directory(q: CustomerListQueryDto): Promise<CustomerDirectoryPage> {
    const [customers, orders] = await Promise.all([
      this.data.list<CustomerDoc>(COLLECTIONS.customers, {
        orderBy: [{ field: "createdAt", direction: "desc" }],
        limit: CUSTOMER_DIRECTORY_SCAN_LIMIT,
      }),
      this.data.list<OrderDoc>(COLLECTIONS.orders, {
        orderBy: [{ field: "createdAt", direction: "desc" }],
        limit: CUSTOMER_ORDER_SCAN_LIMIT,
      }),
    ]);
    const aggregates = aggregateOrdersByCustomer(orders);

    const rows: CustomerDirectoryRow[] = customers.map((c) => ({
      ...c,
      ...(aggregates.get(c.uid) ?? { orderCount: 0, completedOrderCount: 0, totalSpendPaise: 0 }),
    }));

    const filters: DirectoryFilters = {
      search: q.search,
      activity: q.activity,
      status: q.status,
      registeredFrom: q.registeredFrom,
      registeredTo: q.registeredTo,
    };
    const matched = rows.filter((row) => matchesDirectoryFilters(row, row, filters));
    const sorted = sortDirectoryRows(matched, q.sort);

    // "New Customers" window: an explicit registration range when set, otherwise the
    // current IST calendar month (the reporting timezone used across the console).
    const newWindow =
      q.registeredFrom !== undefined && q.registeredTo !== undefined
        ? { from: q.registeredFrom, to: q.registeredTo, label: "in the selected range" }
        : { ...istMonthWindow(Date.now()), label: "this month" };
    const repeatCount = matched.filter((c) => c.orderCount >= 2).length;
    const repeatOrders = matched.reduce((sum, c) => (c.orderCount >= 2 ? sum + c.orderCount : sum), 0);
    const summary: CustomerDirectorySummary = {
      totalCustomers: matched.length,
      newCustomers: matched.filter((c) => c.createdAt >= newWindow.from && c.createdAt <= newWindow.to).length,
      newCustomersWindow: newWindow.label,
      customersWithOrders: matched.filter((c) => c.orderCount >= 1).length,
      repeatCustomers: repeatCount,
      lifetimeSpendPaise: matched.reduce((sum, c) => sum + c.totalSpendPaise, 0),
      avgOrdersPerRepeat: repeatCount > 0 ? Math.round((repeatOrders / repeatCount) * 10) / 10 : null,
    };

    const total = matched.length;
    const start = (q.page - 1) * q.pageSize;
    return {
      // List rows: metrics stay, private bulk content (addresses, note text) does not ride.
      items: sorted.slice(start, start + q.pageSize).map((row) => ({
        ...row,
        addresses: [],
        notes: undefined,
      })),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      summary,
    };
  }

  /**
   * Paginated real order history for one customer. Equality-only Firestore query
   * (automatic single-field index) sorted in memory — no composite index required.
   */
  async customerOrders(id: string, page: number, pageSize: number): Promise<Page<OrderDoc>> {
    const customer = await this.getAdmin(id);
    const scanned = await this.data.list<OrderDoc>(COLLECTIONS.orders, {
      where: [{ field: "customerUid", op: "==", value: customer.uid }],
      limit: CUSTOMER_ORDER_SCAN_LIMIT,
    });
    const sorted = [...scanned].sort((a, b) => b.createdAt - a.createdAt);
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

  /** Replace the internal support notes on a customer profile (admin-only, audited). */
  async updateNotes(id: string, note: string, actor: AuthPrincipal): Promise<CustomerDoc> {
    const doc = await this.getAdmin(id);
    const updated = await this.data.update(COLLECTIONS.customers, id, {
      notes: note,
      updatedAt: Date.now(),
    } as Partial<CustomerDoc>);
    await this.audit.record({
      actor,
      action: "customer.notes_updated",
      targetType: "customer",
      targetId: doc.id,
      summary: note ? `Internal note updated for ${doc.displayName}` : `Internal note cleared for ${doc.displayName}`,
    });
    return updated;
  }

  /** Admin view with PII minimisation: masks phone/email for roles without customers:write. */
  maskForRole(doc: CustomerDoc, permissions: string[]): CustomerDoc {
    if (permissions.includes("customers:write")) return doc;
    return {
      ...doc,
      email: doc.email ? maskEmail(doc.email) : undefined,
      phone: doc.phone ? `${doc.phone.slice(0, 3)}xxxxx${doc.phone.slice(-2)}` : undefined,
      addresses: [],
    };
  }

  async getAdmin(id: string): Promise<CustomerDoc> {
    const doc = await this.data.get<CustomerDoc>(COLLECTIONS.customers, id);
    if (!doc) throw notFound("Customer not found");
    return doc;
  }

  async setStatus(
    id: string,
    status: CustomerDoc["accountStatus"],
    actor?: AuthPrincipal,
  ): Promise<CustomerDoc> {
    const doc = await this.getAdmin(id);
    // NOTE: the persisted field is `accountStatus` — an earlier revision wrote a stray
    // `status` key instead, which made Suspend/Activate silently do nothing.
    const updated = await this.data.update(COLLECTIONS.customers, id, {
      accountStatus: status,
      updatedAt: Date.now(),
    } as Partial<CustomerDoc>);
    if (actor) {
      await this.audit.record({
        actor,
        action: "customer.status_changed",
        targetType: "customer",
        targetId: doc.id,
        summary: `${doc.displayName} account ${status === "active" ? "activated" : "suspended"}`,
      });
    }
    return updated;
  }

  /** Storefront-safe projection: internal staff notes never reach customer-facing payloads. */
  forSelf(doc: CustomerDoc): CustomerDoc {
    const safe = { ...doc };
    delete safe.notes;
    return safe;
  }

  assertNotSelf(action: string, actor: AuthPrincipal, targetUid: string): void {
    if (actor.uid === targetUid) throw forbidden(`Cannot ${action} your own account through this endpoint`);
  }
}

function maskEmail(email: string): string {
  const [name, domain] = email.split("@");
  if (!domain) return "***";
  const visible = name.slice(0, 2);
  return `${visible}${"*".repeat(Math.max(1, name.length - 2))}@${domain}`;
}
