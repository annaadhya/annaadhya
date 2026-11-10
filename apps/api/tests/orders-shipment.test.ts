/**
 * Shipment recording & customer ownership tests — the Order Details page contract.
 *
 * Covers the admin manual-shipment workflow (carrier + AWB recorded through the
 * shipped transition) and the guarantees the storefront order pages rely on:
 * shipment changes never touch payment status, orders keep their embedded
 * address snapshot, and a customer can only ever read their own orders.
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

const customerB: AuthPrincipal = {
  uid: "cust-b",
  email: "b@test.dev",
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
  permissions: ["orders:read", "orders:write"],
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

async function paidOrder(index: number, buyer: AuthPrincipal = customerA): Promise<OrderDoc> {
  const v = pickVariant(index);
  const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "560038" } satisfies CheckoutQuoteDto);
  const res = await checkout.createOrder(
    {
      quoteId: quote.quoteId,
      paymentMethod: "gateway",
      customer: { displayName: "Aarav Sharma", email: buyer.email!, phone: "9820144520" },
      address: address(),
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
      eventId: `evt_ship_${order.id}`,
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

describe("manual shipment recording (admin)", () => {
  it("records carrier + AWB on the shipped transition without touching payment status", async () => {
    const paid = await paidOrder(0);
    expect(paid.status).toBe("confirmed");

    // confirmed -> processing -> shipped, exactly like the admin UI's legal transitions
    await orders.updateStatus(paid.id, { status: "processing" }, owner);
    const shipped = await orders.updateStatus(
      paid.id,
      { status: "shipped", tracking: { carrier: "Blue Dart Air", trackingNumber: "700054910" } },
      owner,
    );

    expect(shipped.status).toBe("shipped");
    expect(shipped.tracking?.carrier).toBe("Blue Dart Air");
    expect(shipped.tracking?.trackingNumber).toBe("700054910");
    expect(typeof shipped.tracking?.updatedAt).toBe("number");
    // shipment change must NOT alter payment status
    expect(shipped.paymentStatus).toBe("succeeded");
  });

  it("keeps the embedded delivery address snapshot intact through shipment updates", async () => {
    const paid = await paidOrder(1);
    await orders.updateStatus(paid.id, { status: "processing" }, owner);
    const reread = await orders.getAdmin(paid.id);
    expect(reread.shippingAddress.fullName).toBe("Aarav Sharma");
    expect(reread.shippingAddress.line1).toBe("Flat 402, Nilgiri Heights, 14th Cross");
    expect(reread.shippingAddress.line2).toBe("Indiranagar, Stage II");
    expect(reread.shippingAddress.city).toBe("Bengaluru");
    expect(reread.shippingAddress.pincode).toBe("560038");
  });
});

describe("tracking correction after shipping (admin)", () => {
  const readOnlyOwner: AuthPrincipal = {
    uid: "readonly-owner",
    email: "readonly@test.dev",
    provider: "dev",
    role: "orders_support",
    permissions: ["orders:read"],
    isStaff: true,
  };

  it("corrects carrier + AWB on a shipped order without touching status or payment", async () => {
    const paid = await paidOrder(4);
    await orders.updateStatus(paid.id, { status: "processing" }, owner);
    const shipped = await orders.updateStatus(
      paid.id,
      { status: "shipped", tracking: { carrier: "Blue Dart Air", trackingNumber: "700054910" } },
      owner,
    );

    const corrected = await orders.updateTracking(
      shipped.id,
      { carrier: "Delhivery Surface", trackingNumber: "7712990442" },
      owner,
    );

    expect(corrected.status).toBe("shipped");
    expect(corrected.paymentStatus).toBe("succeeded");
    expect(corrected.tracking?.carrier).toBe("Delhivery Surface");
    expect(corrected.tracking?.trackingNumber).toBe("7712990442");
    expect(corrected.tracking!.updatedAt).toBeGreaterThanOrEqual(shipped.tracking!.updatedAt);
    // everything else about the order stays intact
    expect(corrected.shippingAddress.pincode).toBe("560038");
    expect(corrected.totalPaise).toBe(shipped.totalPaise);
  });

  it("can add tracking to a shipped order that was shipped without it", async () => {
    const paid = await paidOrder(5);
    await orders.updateStatus(paid.id, { status: "processing" }, owner);
    const shipped = await orders.updateStatus(paid.id, { status: "shipped" }, owner);
    expect(shipped.tracking).toBeUndefined();

    const corrected = await orders.updateTracking(
      shipped.id,
      { carrier: "India Post Speed", trackingNumber: "RM992244551IN" },
      owner,
    );
    expect(corrected.tracking?.trackingNumber).toBe("RM992244551IN");
  });

  it("also works on delivered orders (keeping records honest after the fact)", async () => {
    const paid = await paidOrder(6);
    await orders.updateStatus(paid.id, { status: "processing" }, owner);
    await orders.updateStatus(
      paid.id,
      { status: "shipped", tracking: { carrier: "Blue Dart Air", trackingNumber: "700054910" } },
      owner,
    );
    const delivered = await orders.updateStatus(paid.id, { status: "delivered" }, owner);

    const corrected = await orders.updateTracking(
      delivered.id,
      { carrier: "Ekart Logistics", trackingNumber: "FMPP1122334" },
      owner,
    );
    expect(corrected.status).toBe("delivered");
    expect(corrected.tracking?.trackingNumber).toBe("FMPP1122334");
  });

  it("rejects correction before shipping (400 semantics)", async () => {
    const paid = await paidOrder(7);
    await expect(
      orders.updateTracking(paid.id, { carrier: "Delhivery", trackingNumber: "7712990442" }, owner),
    ).rejects.toThrow(/shipped or delivered/i);
  });

  it("rejects correction on closed orders (cancelled / refunded)", async () => {
    const paid = await paidOrder(8);
    await orders.updateStatus(paid.id, { status: "cancelled" }, owner);
    await expect(
      orders.updateTracking(paid.id, { carrier: "Delhivery", trackingNumber: "7712990442" }, owner),
    ).rejects.toThrow(/shipped or delivered/i);
  });

  it("requires the orders:write permission", async () => {
    const paid = await paidOrder(9);
    await orders.updateStatus(paid.id, { status: "processing" }, owner);
    await orders.updateStatus(
      paid.id,
      { status: "shipped", tracking: { carrier: "Blue Dart Air", trackingNumber: "700054910" } },
      owner,
    );
    await expect(
      orders.updateTracking(paid.id, { carrier: "Delhivery", trackingNumber: "7712990442" }, readOnlyOwner),
    ).rejects.toThrow(/orders:write/i);
  });

  it("404 semantics for a nonexistent order", async () => {
    await expect(
      orders.updateTracking("no-such-order", { carrier: "Delhivery", trackingNumber: "7712990442" }, owner),
    ).rejects.toThrow(/Order not found/i);
  });
});

describe("customer order ownership", () => {
  it("a customer can read their own order", async () => {
    const paid = await paidOrder(2);
    const own = await orders.getForCustomer(paid.id, customerA.uid);
    expect(own.id).toBe(paid.id);
    expect(own.customerUid).toBe(customerA.uid);
  });

  it("a customer cannot read another customer's order (404 semantics)", async () => {
    const paid = await paidOrder(3, customerA);
    await expect(orders.getForCustomer(paid.id, customerB.uid)).rejects.toThrow(/Order not found/i);
  });

  it("listForCustomer returns only the caller's orders", async () => {
    const mineA = await orders.listForCustomer(customerA.uid, 1, 50);
    const mineB = await orders.listForCustomer(customerB.uid, 1, 50);
    expect(mineA.items.length).toBeGreaterThan(0);
    expect(mineA.items.every((o) => o.customerUid === customerA.uid)).toBe(true);
    expect(mineB.items.every((o) => o.customerUid === customerB.uid)).toBe(true);
    expect(mineB.items.length).toBe(0);
  });
});
