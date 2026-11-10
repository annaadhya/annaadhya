/**
 * Admin order-list filters — the contract behind the Orders console filters.
 *
 * Regression suite for the production "filters → Internal server error" 500s: filtered
 * list views must run against an index-free Firestore shape (newest-first scan, match in
 * memory) and must return honest totals for EVERY filter dimension — status, payment
 * status, payment gateway, date window, search — and any composition of them, including
 * the paymentProvider gateway filter whose composite index was never deployed.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { InMemoryDataClient, applySeed } from "@annaadhya/data-core";
import {
  COLLECTIONS,
  type AuthPrincipal,
  type CheckoutQuoteDto,
  type OrderDoc,
  type PaymentAttemptDoc,
  type ProductVariantDoc,
} from "@annaadhya/contracts";
import { loadEnv, resetEnvCache } from "../src/config/env";
import { SettingsService } from "../src/modules/settings/settings.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { CheckoutService } from "../src/modules/checkout/checkout.service";
import { MockPaymentProvider } from "../src/modules/payments/mock.provider";
import { RazorpayProvider } from "../src/modules/payments/razorpay.provider";
import { OrdersService } from "../src/modules/orders/orders.service";

process.env.NODE_ENV = "test";
process.env.DATA_PROVIDER = "memory";

let db: InMemoryDataClient;
let checkout: CheckoutService;
let orders: OrdersService;
let variants: ProductVariantDoc[];

const customerA: AuthPrincipal = {
  uid: "cust-filter-a",
  email: "a@filter.test",
  provider: "password",
  role: "customer",
  permissions: [],
  isStaff: false,
};

const customerB: AuthPrincipal = {
  uid: "cust-filter-b",
  email: "b@filter.test",
  provider: "password",
  role: "customer",
  permissions: [],
  isStaff: false,
};

/** Fresh principal — zero prior orders, so customer-list assertions are exact. */
const customerC: AuthPrincipal = {
  uid: "cust-filter-c",
  email: "c@filter.test",
  provider: "password",
  role: "customer",
  permissions: [],
  isStaff: false,
};

const owner: AuthPrincipal = {
  uid: "test-owner",
  email: "owner@test.dev",
  provider: "dev",
  role: "owner",
  permissions: ["orders:read", "orders:write", "orders:refund"],
  isStaff: true,
};

/** SKUs other suites reserve defensively — kept identical so every suite stays independent. */
const RESERVED_SKU_SUFFIXES = [
  "AN-HNY-001-250G", "AN-HNY-001-1KG", "AN-HNY-002-100G", "AN-HNY-003-500G", "AN-HNY-004-500G",
  "AN-HNY-005-250G", "AN-HNY-006-100G", "AN-HNY-007-100G", "AN-HNY-008-100G", "AN-HNY-009-100G",
  "AN-DRY-001-250G", "AN-DRY-002-100G", "AN-DRY-003-100G", "AN-DRY-004-100G", "AN-DRY-005-250G",
  "AN-DRY-006-100G", "AN-DRY-007-100G", "AN-DRY-008-100G",
];

function pickVariant(index: number): ProductVariantDoc {
  const usable = variants.filter(
    (v) => !RESERVED_SKU_SUFFIXES.some((s) => v.sku.endsWith(s)) && v.stockOnHand >= 5 && v.status === "published",
  );
  const v = usable[index % usable.length];
  if (!v) throw new Error("no usable variant found");
  return v;
}

function address() {
  return {
    label: "Home",
    fullName: "Filter Test",
    phone: "9820144520",
    line1: "Flat 402, Nilgiri Heights, 14th Cross",
    line2: "Indiranagar, Stage II",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560038",
    country: "India",
  };
}

/** Gateway order whose payment is verified — ends at confirmed/succeeded. */
async function paidOrder(index: number, customer: AuthPrincipal, name: string): Promise<OrderDoc> {
  const v = pickVariant(index);
  const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "560038" } satisfies CheckoutQuoteDto);
  const res = await checkout.createOrder(
    {
      quoteId: quote.quoteId,
      paymentMethod: "gateway",
      customer: { displayName: name, email: customer.email!, phone: "9820144520" },
      address: address(),
      acceptTerms: true,
      deliverToSomeoneElse: false,
    },
    customer,
  );
  const order = res as OrderDoc & { clientPaymentPayload?: Record<string, unknown> };
  const attemptId = (order.clientPaymentPayload?.attemptId as string) ?? "";
  const attempt = await db.get<PaymentAttemptDoc>(COLLECTIONS.paymentAttempts, attemptId);
  await checkout.applyVerifiedEvent(
    {
      eventId: `evt_listfilter_${order.id}`,
      eventType: "mock.succeeded",
      providerOrderId: attempt!.providerOrderId,
      outcome: "succeeded",
      amountPaise: attempt!.amountPaise,
    },
    "mock",
  );
  const paid = await orders.getAdmin(order.id);
  expect(paid.paymentStatus).toBe("succeeded");
  return paid;
}

/** Gateway order created + initiated but never paid — confirmed/pending. */
async function unpaidOrder(index: number, customer: AuthPrincipal, name: string): Promise<OrderDoc> {
  const v = pickVariant(index);
  const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "560038" } satisfies CheckoutQuoteDto);
  const res = await checkout.createOrder(
    {
      quoteId: quote.quoteId,
      paymentMethod: "gateway",
      customer: { displayName: name, email: customer.email!, phone: "9820144520" },
      address: address(),
      acceptTerms: true,
      deliverToSomeoneElse: false,
    },
    customer,
  );
  const created = await orders.getAdmin((res as OrderDoc).id);
  expect(created.paymentStatus).toBe("pending");
  return created;
}

/** COD order — provider "cod", payment stays pending until delivery. */
async function codOrder(index: number, customer: AuthPrincipal, name: string): Promise<OrderDoc> {
  const v = pickVariant(index);
  const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "560038" } satisfies CheckoutQuoteDto);
  const res = await checkout.createOrder(
    {
      quoteId: quote.quoteId,
      paymentMethod: "cod",
      customer: { displayName: name, email: customer.email!, phone: "9820144520" },
      address: address(),
      acceptTerms: true,
      deliverToSomeoneElse: false,
    },
    customer,
  );
  const created = await orders.getAdmin((res as OrderDoc).id);
  expect(created.paymentProvider).toBe("cod");
  return created;
}

beforeAll(async () => {
  db = new InMemoryDataClient({ nodeEnv: "test" });
  await applySeed(db);
  const settings = new SettingsService(db);
  const audit = new AuditService(db);
  resetEnvCache();
  process.env.DEV_TOKEN_SECRET = "test-secret-0123456789abcdef";
  const env = loadEnv();
  const providers = [new MockPaymentProvider(), new RazorpayProvider(env)];
  checkout = new CheckoutService(db, settings, audit, env, providers);
  orders = new OrdersService(db, audit, providers);
  variants = await db.list<ProductVariantDoc>(COLLECTIONS.productVariants);
  // The seed ships COD disabled; the gateway-filter tests need one COD order.
  const settingsDoc = await db.get<{ payments: { codEnabled: boolean } }>(COLLECTIONS.settings, "global");
  await db.update(COLLECTIONS.settings, "global", {
    payments: { ...settingsDoc!.payments, codEnabled: true },
  });
});

describe("admin order list — filtered views (index-free scan path)", () => {
  it("filters by status and keeps the total honest", async () => {
    // Seed demo orders share lifecycle statuses — assert by delta, not absolute counts.
    const before = await orders.listAdmin({ status: "processing", page: 1, pageSize: 100 });
    const paid = await paidOrder(0, customerA, "Rhea Filterson");
    await orders.updateStatus(paid.id, { status: "processing" }, owner);
    await paidOrder(1, customerA, "Rhea Filterson"); // stays confirmed

    const processing = await orders.listAdmin({ status: "processing", page: 1, pageSize: 100 });
    expect(processing.total).toBe(before.total + 1);
    expect(processing.items.some((o) => o.id === paid.id)).toBe(true);
    expect(processing.items.every((o) => o.status === "processing")).toBe(true);

    const confirmed = await orders.listAdmin({ status: "confirmed", page: 1, pageSize: 100 });
    expect(confirmed.items.some((o) => o.id === paid.id)).toBe(false);
    expect(confirmed.items.every((o) => o.status === "confirmed")).toBe(true);
  });

  it("filters by payment status (paid vs pending)", async () => {
    const paid = await paidOrder(2, customerA, "Rhea Filterson");
    const unpaid = await unpaidOrder(3, customerA, "Unpaid Patel");

    const succeeded = await orders.listAdmin({ paymentStatus: "succeeded", page: 1, pageSize: 50 });
    expect(succeeded.items.some((o) => o.id === paid.id)).toBe(true);
    expect(succeeded.items.some((o) => o.id === unpaid.id)).toBe(false);

    const pending = await orders.listAdmin({ paymentStatus: "pending", page: 1, pageSize: 50 });
    expect(pending.items.some((o) => o.id === unpaid.id)).toBe(true);
    expect(pending.items.some((o) => o.id === paid.id)).toBe(false);
    expect(pending.total).toBe(pending.items.length);
  });

  it("filters by payment gateway — the composite that was never deployed", async () => {
    const cod = await codOrder(4, customerA, "Cod Kumar");
    const paid = await paidOrder(5, customerA, "Rhea Filterson");

    const byCod = await orders.listAdmin({ paymentProvider: "cod", page: 1, pageSize: 50 });
    expect(byCod.items).toHaveLength(1);
    expect(byCod.items[0]!.id).toBe(cod.id);
    expect(byCod.items[0]!.paymentProvider).toBe("cod");

    const byMock = await orders.listAdmin({ paymentProvider: "mock", page: 1, pageSize: 50 });
    expect(byMock.items.some((o) => o.id === paid.id)).toBe(true);
    expect(byMock.items.some((o) => o.id === cod.id)).toBe(false);
  });

  it("filters by date window (from/to epoch millis)", async () => {
    await paidOrder(6, customerA, "Rhea Filterson");

    const now = Date.now();
    const future = await orders.listAdmin({ from: now + 60_000, to: now + 3_600_000, page: 1, pageSize: 50 });
    expect(future.total).toBe(0);
    expect(future.items).toHaveLength(0);

    const recent = await orders.listAdmin({ from: now - 3_600_000, to: now + 60_000, page: 1, pageSize: 50 });
    expect(recent.total).toBeGreaterThanOrEqual(1);

    const ancient = await orders.listAdmin({ to: now - 400 * 86_400_000, page: 1, pageSize: 50 });
    expect(ancient.total).toBe(0);
  });

  it("composes search with status filters in one scan", async () => {
    const target = await paidOrder(7, customerA, "Searchonly Nayar");
    await orders.updateStatus(target.id, { status: "processing" }, owner);
    await paidOrder(8, customerA, "Rhea Filterson"); // same status, different name

    const composed = await orders.listAdmin({ search: "searchonly", status: "processing", page: 1, pageSize: 10 });
    expect(composed.items).toHaveLength(1);
    expect(composed.items[0]!.id).toBe(target.id);

    const byEmail = await orders.listAdmin({ search: "a@filter.test", status: "processing", page: 1, pageSize: 50 });
    expect(byEmail.items.length).toBeGreaterThanOrEqual(1);
    expect(byEmail.items.every((o) => o.customerContact.email?.toLowerCase() === "a@filter.test")).toBe(true);
  });

  it("paginates the filtered set with honest totals", async () => {
    const before = await orders.listAdmin({ status: "processing", page: 1, pageSize: 100 });
    const a = await paidOrder(9, customerA, "Page One");
    const b = await paidOrder(10, customerA, "Page Two");
    await orders.updateStatus(a.id, { status: "processing" }, owner);
    await orders.updateStatus(b.id, { status: "processing" }, owner);

    const full = await orders.listAdmin({ status: "processing", page: 1, pageSize: 100 });
    expect(full.total).toBe(before.total + 2);
    expect(full.items.some((o) => o.id === a.id)).toBe(true);
    expect(full.items.some((o) => o.id === b.id)).toBe(true);
    for (let i = 1; i < full.items.length; i += 1) {
      expect(full.items[i]!.createdAt).toBeLessThanOrEqual(full.items[i - 1]!.createdAt);
    }

    // single-item pages must slice exactly the full filtered listing, newest first
    const page1 = await orders.listAdmin({ status: "processing", page: 1, pageSize: 1 });
    const page2 = await orders.listAdmin({ status: "processing", page: 2, pageSize: 1 });
    expect(page1.total).toBe(full.total);
    expect(page1.totalPages).toBe(full.total);
    expect(page1.items[0]!.id).toBe(full.items[0]!.id);
    expect(page2.items[0]!.id).toBe(full.items[1]!.id);
  });

  it("returns the unfiltered page through the count path", async () => {
    const all = await orders.listAdmin({ page: 1, pageSize: 5 });
    expect(all.items).toHaveLength(5);
    expect(all.total).toBeGreaterThanOrEqual(all.items.length);
    for (let i = 1; i < all.items.length; i += 1) {
      expect(all.items[i]!.createdAt).toBeLessThanOrEqual(all.items[i - 1]!.createdAt);
    }
  });
});

describe("customer order list (index-free equality query)", () => {
  it("returns only the caller's orders, newest first, honestly paginated", async () => {
    const a1 = await paidOrder(11, customerC, "Fresh Customer");
    const b1 = await codOrder(12, customerB, "Vikram Othername");
    const a2 = await paidOrder(13, customerC, "Fresh Customer");

    const mine = await orders.listForCustomer(customerC.uid, 1, 10);
    expect(mine.total).toBe(2);
    expect(mine.items.map((o) => o.id).sort()).toEqual([a1.id, a2.id].sort());
    expect(mine.items.every((o) => o.customerUid === customerC.uid)).toBe(true);

    const theirs = await orders.listForCustomer(customerB.uid, 1, 10);
    expect(theirs.total).toBe(1);
    expect(theirs.items[0]!.id).toBe(b1.id);

    const page2 = await orders.listForCustomer(customerC.uid, 2, 1);
    expect(page2.total).toBe(2);
    expect(page2.items).toHaveLength(1);
    expect([a1.id, a2.id]).toContain(page2.items[0]!.id);
    // newest first (tolerant of same-millisecond ties)
    const first = await orders.listForCustomer(customerC.uid, 1, 1);
    expect([a1.id, a2.id]).toContain(first.items[0]!.id);
    expect(first.items[0]!.createdAt).toBeGreaterThanOrEqual(page2.items[0]!.createdAt);
  });
});
