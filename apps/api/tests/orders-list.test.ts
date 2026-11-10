/**
 * Admin orders-list tests — the Orders console page contract.
 *
 * Covers the listing semantics the redesigned Orders page depends on:
 *  - search matches across the WHOLE filtered set (not just one page slice) and
 *    paginates the matches honestly (total reflects every match);
 *  - search reaches order number, email, phone and display name;
 *  - paymentProvider narrows the list (real gateway field, no invented values);
 *  - date range (from/to) bounds the window by createdAt;
 *  - filters combine without contradicting the pagination.
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

function principal(uid: string, email: string): AuthPrincipal {
  return { uid, email, provider: "password", role: "customer", permissions: [], isStaff: false };
}

const customerA = principal("cust-a", "alpha@test.dev");
const customerB = principal("cust-b", "bravo@test.dev");
const customerC = principal("cust-c", "charlie@other.dev");

/** SKUs reserved by other test files — never touch them here. */
const RESERVED_SKU_SUFFIXES = [
  "AN-HNY-001-250G", "AN-HNY-001-1KG", "AN-HNY-002-100G", "AN-HNY-003-500G", "AN-HNY-004-500G",
  "AN-HNY-005-250G", "AN-HNY-006-100G", "AN-HNY-007-100G", "AN-HNY-008-100G", "AN-HNY-009-100G",
  "AN-DRY-001-250G", "AN-DRY-002-100G", "AN-DRY-003-100G", "AN-DRY-004-100G", "AN-DRY-005-250G",
  "AN-DRY-006-100G", "AN-DRY-007-100G", "AN-DRY-008-100G",
  // reserved by orders-shipment.test.ts
  "AN-KES-001-1G", "AN-KES-002-5G", "AN-SAF-001-1G", "AN-GHE-001-500G", "AN-TEA-001-250G", "AN-TEA-001-500G",
];

function pickVariant(index: number): ProductVariantDoc {
  const usable = variants.filter(
    (v) => !RESERVED_SKU_SUFFIXES.some((s) => v.sku.endsWith(s)) && v.stockOnHand >= 5 && v.status === "published",
  );
  const v = usable[index % usable.length];
  if (!v) throw new Error("no usable variant found");
  return v;
}

function address(email: string) {
  return {
    label: "Home",
    fullName: `Buyer ${email.split("@")[0]}`,
    phone: "9820144520",
    line1: "Flat 402, Nilgiri Heights, 14th Cross",
    line2: "Indiranagar, Stage II",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560038",
    country: "India",
  };
}

async function paidOrder(index: number, buyer: AuthPrincipal): Promise<OrderDoc> {
  const v = pickVariant(index);
  const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "560038" } satisfies CheckoutQuoteDto);
  const res = await checkout.createOrder(
    {
      quoteId: quote.quoteId,
      paymentMethod: "gateway",
      customer: { displayName: `Buyer ${buyer.uid}`, email: buyer.email!, phone: "9820144520" },
      address: address(buyer.email!),
      acceptTerms: true,
      deliverToSomeoneElse: false,
    },
    buyer,
  );
  const order = res as OrderDoc & { clientPaymentPayload?: Record<string, unknown> };
  const attemptId = (order.clientPaymentPayload?.attemptId as string) ?? "";
  const attempt = await db.get<PaymentAttemptDoc>(COLLECTIONS.paymentAttempts, attemptId);
  await checkout.applyVerifiedEvent(
    {
      eventId: `evt_list_${order.id}`,
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
});

describe("admin orders list (Orders console contract)", () => {
  let alpha: OrderDoc;
  let bravo: OrderDoc;
  let charlie: OrderDoc;

  beforeAll(async () => {
    // Three paid orders from three distinct customers; unique emails make search
    // assertions deterministic without depending on same-millis createdAt ordering.
    alpha = await paidOrder(0, customerA);
    bravo = await paidOrder(1, customerB);
    charlie = await paidOrder(2, customerC);
  });

  it("returns the seeded paid orders with honest pagination metadata", async () => {
    const page = await orders.listAdmin({ paymentStatus: "succeeded", page: 1, pageSize: 2 });
    expect(page.total).toBeGreaterThanOrEqual(3);
    expect(page.items.length).toBe(2);
    expect(page.totalPages).toBe(Math.ceil(page.total / 2));
  });

  it("continues the order-number sequence past the demo block — no collision with seeded orders", async () => {
    // Regression: the seed writes AN-<year>-000001..000012 but used to leave the
    // checkout counter at zero, so the first real order duplicated a demo number.
    const numbers = [alpha.orderNumber, bravo.orderNumber, charlie.orderNumber];
    expect(new Set(numbers).size).toBe(numbers.length);
    const minSeq = Math.min(...numbers.map((n) => Number(n.split("-")[2])));
    expect(minSeq).toBeGreaterThan(12);
  });

  it("search matches across the whole set, not one page slice — every match is reachable via pagination", async () => {
    // "test.dev" matches alpha + bravo (both @test.dev) regardless of page size.
    const seen: string[] = [];
    let page = 1;
    for (;;) {
      const p = await orders.listAdmin({ search: "test.dev", page, pageSize: 1 });
      expect(p.total).toBe(2);
      expect(p.totalPages).toBe(2);
      seen.push(...p.items.map((o) => o.id));
      if (page >= p.totalPages) break;
      page++;
    }
    expect(new Set(seen)).toEqual(new Set([alpha.id, bravo.id]));
  });

  it("search reaches order number, display name and phone — not just email", async () => {
    const byNumber = await orders.listAdmin({ search: alpha.orderNumber, page: 1, pageSize: 10 });
    expect(byNumber.total).toBe(1);
    expect(byNumber.items[0]?.id).toBe(alpha.id);

    const byName = await orders.listAdmin({ search: "Buyer cust-c", page: 1, pageSize: 10 });
    expect(byName.total).toBe(1);
    expect(byName.items[0]?.id).toBe(charlie.id);

    const byPhone = await orders.listAdmin({ search: "9820144520", page: 1, pageSize: 10 });
    expect(byPhone.total).toBeGreaterThanOrEqual(3); // every seeded order shares the test phone
  });

  it("search with no hits reports an honest empty page", async () => {
    const p = await orders.listAdmin({ search: "nobody-matches-this", page: 1, pageSize: 10 });
    expect(p.total).toBe(0);
    expect(p.items).toEqual([]);
    expect(p.totalPages).toBe(1);
  });

  it("paymentProvider narrows the list using the real gateway field", async () => {
    const mock = await orders.listAdmin({ paymentProvider: "mock", page: 1, pageSize: 50 });
    expect(mock.total).toBeGreaterThanOrEqual(3);
    expect(mock.items.every((o) => o.paymentProvider === "mock")).toBe(true);

    const razorpay = await orders.listAdmin({ paymentProvider: "razorpay", page: 1, pageSize: 50 });
    expect(razorpay.total).toBe(0);
  });

  it("date range bounds the window by createdAt and composes with other filters", async () => {
    const future = await orders.listAdmin({
      from: Date.now() + 24 * 60 * 60 * 1000,
      page: 1,
      pageSize: 10,
    });
    expect(future.total).toBe(0);

    const everything = await orders.listAdmin({ from: 1, page: 1, pageSize: 100 });
    expect(everything.total).toBeGreaterThanOrEqual(3);

    const bounded = await orders.listAdmin({
      from: Date.now() - 60_000,
      to: Date.now() + 60_000,
      paymentProvider: "mock",
      page: 1,
      pageSize: 10,
    });
    expect(bounded.total).toBeGreaterThanOrEqual(3);
    expect(bounded.items.every((o) => o.paymentProvider === "mock")).toBe(true);
  });

  it("without search, standard pagination still reports the full unfiltered total", async () => {
    const p1 = await orders.listAdmin({ page: 1, pageSize: 2 });
    const p2 = await orders.listAdmin({ page: 2, pageSize: 2 });
    expect(p1.total).toBe(p2.total);
    expect(p1.items[0]?.id).not.toBe(p2.items[0]?.id);
  });
});
