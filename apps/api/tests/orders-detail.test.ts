/**
 * Order-detail support endpoints — the contract the admin Order Detail page relies on.
 *
 * Covers the read models that back the redesigned page: the chronological audit
 * timeline (real recorded events only), internal staff notes (permission-checked,
 * never customer-visible) and provider payment attempts (display-only references).
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
  uid: "cust-a",
  email: "a@test.dev",
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

const readOnlySupport: AuthPrincipal = {
  uid: "support-readonly",
  email: "support@test.dev",
  provider: "dev",
  role: "reports",
  permissions: ["orders:read"],
  isStaff: true,
};

/** SKUs consumed by checkout.test.ts — pick unused variants to avoid stock collisions. */
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
    fullName: "Aarav Sharma",
    phone: "9820144520",
    line1: "Flat 402, Nilgiri Heights, 14th Cross",
    line2: "Indiranagar, Stage II",
    city: "Bengaluru",
    state: "Karnataka",
    pincode: "560038",
    country: "India",
  };
}

async function paidOrder(index: number): Promise<OrderDoc> {
  const v = pickVariant(index);
  const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "560038" } satisfies CheckoutQuoteDto);
  const res = await checkout.createOrder(
    {
      quoteId: quote.quoteId,
      paymentMethod: "gateway",
      customer: { displayName: "Aarav Sharma", email: customerA.email!, phone: "9820144520" },
      address: address(),
      acceptTerms: true,
      deliverToSomeoneElse: false,
    },
    customerA,
  );
  const order = res as OrderDoc & { clientPaymentPayload?: Record<string, unknown> };
  const attemptId = (order.clientPaymentPayload?.attemptId as string) ?? "";
  const attempt = await db.get<PaymentAttemptDoc>(COLLECTIONS.paymentAttempts, attemptId);
  await checkout.applyVerifiedEvent(
    {
      eventId: `evt_detail_${order.id}`,
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
  // The seed ships COD disabled (business confirms it via Settings); these tests
  // exercise the COD order-creation timeline, so flip it on for this suite only.
  const settingsDoc = await db.get<{ payments: { codEnabled: boolean } }>(COLLECTIONS.settings, "global");
  await db.update(COLLECTIONS.settings, "global", {
    payments: { ...settingsDoc!.payments, codEnabled: true },
  });
});

describe("order timeline (real audit events only)", () => {
  it("returns recorded events in chronological order as the order progresses", async () => {
    const paid = await paidOrder(0);
    await orders.updateStatus(paid.id, { status: "processing" }, owner);
    await orders.updateStatus(
      paid.id,
      { status: "shipped", tracking: { carrier: "Blue Dart Air", trackingNumber: "700054910" } },
      owner,
    );

    const events = await orders.listTimeline(paid.id);
    // gateway orders start their timeline at verified payment — nothing is invented
    expect(events.map((e) => e.action)).toEqual(["payment.succeeded", "order.status_change", "order.status_change"]);
    // strictly ascending timestamps
    for (let i = 1; i < events.length; i += 1) {
      expect(events[i].createdAt).toBeGreaterThanOrEqual(events[i - 1].createdAt);
    }
    // every event is an order event for THIS order
    expect(events.every((e) => e.targetType === "order" && e.targetId === paid.id)).toBe(true);
  });

  it("grows with tracking corrections and refunds", async () => {
    const paid = await paidOrder(1);
    await orders.updateStatus(paid.id, { status: "processing" }, owner);
    await orders.updateStatus(
      paid.id,
      { status: "shipped", tracking: { carrier: "Blue Dart Air", trackingNumber: "700054910" } },
      owner,
    );
    await orders.updateTracking(paid.id, { carrier: "Delhivery Surface", trackingNumber: "7712990442" }, owner);
    await orders.refund(paid.id, { amountPaise: 100, reason: "partial goodwill refund" }, owner);

    const actions = (await orders.listTimeline(paid.id)).map((e) => e.action);
    expect(actions).toEqual([
      "payment.succeeded",
      "order.status_change",
      "order.status_change",
      "order.tracking_update",
      "order.refund",
    ]);
  });

  it("starts a COD order timeline at order creation (no payment event)", async () => {
    const v = pickVariant(2);
    const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "560038" } satisfies CheckoutQuoteDto);
    const cod = (await checkout.createOrder(
      {
        quoteId: quote.quoteId,
        paymentMethod: "cod",
        customer: { displayName: "COD Customer", email: customerA.email!, phone: "9820144520" },
        address: address(),
        acceptTerms: true,
        deliverToSomeoneElse: false,
      },
      customerA,
    )) as OrderDoc;

    const actions = (await orders.listTimeline(cod.id)).map((e) => e.action);
    expect(actions).toEqual(["order.create_cod"]);
  });

  it("404 semantics for a nonexistent order", async () => {
    await expect(orders.listTimeline("no-such-order")).rejects.toThrow(/Order not found/i);
  });
});

describe("internal staff notes", () => {
  it("adds a note with author identity and lists it newest-first", async () => {
    const paid = await paidOrder(3);
    await orders.addNote(paid.id, { note: "Customer requested tamper-proof packaging." }, owner);
    // distinct timestamps so newest-first ordering is observable (creates can land in the same ms)
    await new Promise((resolve) => setTimeout(resolve, 2));
    await orders.addNote(paid.id, { note: "Gift ribbon included before sealing." }, owner);

    const notes = await orders.listNotes(paid.id);
    expect(notes).toHaveLength(2);
    expect(notes[0].note).toBe("Gift ribbon included before sealing."); // newest first
    expect(notes.every((n) => n.orderId === paid.id && n.orderNumber === paid.orderNumber)).toBe(true);
    expect(notes[0].authorUid).toBe(owner.uid);
    expect(notes[0].authorRole).toBe("owner");
  });

  it("records the note in the order timeline as an audit event", async () => {
    const paid = await paidOrder(4);
    await orders.addNote(paid.id, { note: "Verified address over phone." }, owner);
    const actions = (await orders.listTimeline(paid.id)).map((e) => e.action);
    expect(actions).toContain("order.note_add");
  });

  it("requires the orders:write permission to add (read-only staff can still list)", async () => {
    const paid = await paidOrder(5);
    await orders.addNote(paid.id, { note: "Added by owner." }, owner);

    await expect(orders.addNote(paid.id, { note: "should not be allowed" }, readOnlySupport)).rejects.toThrow(
      /orders:write/i,
    );
    const visible = await orders.listNotes(paid.id);
    expect(visible).toHaveLength(1); // read-only staff CAN read notes
  });

  it("404 semantics for notes on a nonexistent order", async () => {
    await expect(orders.listNotes("no-such-order")).rejects.toThrow(/Order not found/i);
    await expect(orders.addNote("no-such-order", { note: "orphan note" }, owner)).rejects.toThrow(/Order not found/i);
  });

  it("keeps notes out of the customer-facing order payload (structural separation)", async () => {
    const paid = await paidOrder(6);
    await orders.addNote(paid.id, { note: "internal-only context" }, owner);
    const customerView = await orders.getForCustomer(paid.id, customerA.uid);
    expect(Object.keys(customerView)).not.toContain("notes");
  });
});

describe("payment attempts (display references)", () => {
  it("returns the provider attempt with real references for a gateway order", async () => {
    const paid = await paidOrder(7);
    const attempts = await orders.listPaymentAttempts(paid.id);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].status).toBe("succeeded");
    expect(attempts[0].providerOrderId).toBeTruthy();
    expect(attempts[0].amountPaise).toBe(paid.totalPaise);
  });

  it("returns an empty list for COD orders (no gateway attempt exists)", async () => {
    const v = pickVariant(8);
    const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "560038" } satisfies CheckoutQuoteDto);
    const cod = (await checkout.createOrder(
      {
        quoteId: quote.quoteId,
        paymentMethod: "cod",
        customer: { displayName: "COD Customer", email: customerA.email!, phone: "9820144520" },
        address: address(),
        acceptTerms: true,
        deliverToSomeoneElse: false,
      },
      customerA,
    )) as OrderDoc;
    expect(await orders.listPaymentAttempts(cod.id)).toEqual([]);
  });

  it("404 semantics for a nonexistent order", async () => {
    await expect(orders.listPaymentAttempts("no-such-order")).rejects.toThrow(/Order not found/i);
  });
});
