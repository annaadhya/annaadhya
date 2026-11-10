/**
 * Gift order ("Deliver to someone else") business-rule tests — run the real checkout and
 * orders services against the in-memory provider, exercising the exact production paths.
 *
 * Covered scenarios (per the feature spec):
 *   A — normal checkout stays untouched (no gift fields)
 *   B — gift checkout: purchaser keeps ownership, recipient snapshot is stored
 *   C — address separation: the purchaser's saved default address is never modified
 *   D — payment failure + retry keeps recipient details, no duplicate orders
 *   E — purchaser/admin visibility + cross-customer access denied
 *   F — shipping uses the recipient snapshot; tracking keeps working
 *   G — backend validation rejects bad gift data; normal checkout is not blocked
 *   H — persistence + backward compatibility with pre-gift orders
 */
import { beforeAll, describe, expect, it } from "vitest";
import { InMemoryDataClient, applySeed } from "@annaadhya/data-core";
import {
  COLLECTIONS,
  GIFT_MESSAGE_MAX,
  createOrderSchema,
  type AuthPrincipal,
  type CheckoutQuoteDto,
  type CustomerDoc,
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

const purchaser: AuthPrincipal = {
  uid: "gift-purchaser",
  email: "purchaser@test.dev",
  provider: "password",
  role: "customer",
  permissions: [],
  isStaff: false,
};

const otherCustomer: AuthPrincipal = {
  uid: "gift-someone-else",
  email: "someone@test.dev",
  provider: "password",
  role: "customer",
  permissions: [],
  isStaff: false,
};

const owner: AuthPrincipal = {
  uid: "gift-owner",
  email: "owner@test.dev",
  provider: "dev",
  role: "owner",
  permissions: ["orders:read", "orders:write", "orders:refund"],
  isStaff: true,
};

let variants: ProductVariantDoc[];

function findVariant(suffix: string): ProductVariantDoc {
  const v = variants.find((x) => x.sku.endsWith(suffix));
  if (!v) throw new Error(`variant ${suffix} not found`);
  return v;
}

function purchaserAddress() {
  return {
    label: "Home",
    fullName: "Test Purchaser",
    phone: "9876543210",
    line1: "1 Purchaser Street",
    city: "Delhi",
    state: "Delhi",
    pincode: "110001",
    country: "India",
  };
}

function recipientDetails() {
  return {
    recipient: { fullName: "Ananya Sharma", phone: "9123456780" },
    recipientAddress: {
      label: "Gift delivery",
      fullName: "Ananya Sharma",
      phone: "9123456780",
      line1: "22 Holi Adda Road",
      line2: "Near Ghanta Ghar",
      city: "Meerut",
      state: "Uttar Pradesh",
      pincode: "250002",
      country: "India",
    },
    giftMessage: "Happy Diwali didi! Enjoy the honey — from your little brother.",
  };
}

async function placeGiftOrder(
  variantSuffix: string,
  principal: AuthPrincipal,
  overrides: { giftMessage?: string } = {},
): Promise<{ order: OrderDoc; attempt: PaymentAttemptDoc | null }> {
  const v = findVariant(variantSuffix);
  const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "250002" } satisfies CheckoutQuoteDto);
  const details = recipientDetails();
  const res = await checkout.createOrder(
    {
      quoteId: quote.quoteId,
      paymentMethod: "gateway",
      customer: { displayName: "Test Purchaser", email: "purchaser@test.dev", phone: "9876543210" },
      address: purchaserAddress(),
      acceptTerms: true,
      deliverToSomeoneElse: true,
      recipient: details.recipient,
      recipientAddress: details.recipientAddress,
      giftMessage: overrides.giftMessage !== undefined ? overrides.giftMessage : details.giftMessage,
    },
    principal,
  );
  const order = res as OrderDoc & { clientPaymentPayload?: Record<string, unknown> };
  const attempt = order.clientPaymentPayload
    ? await db.get<PaymentAttemptDoc>(
        COLLECTIONS.paymentAttempts,
        (order.clientPaymentPayload as { attemptId?: string }).attemptId ?? (order.clientPaymentPayload as { attemptId: string }).attemptId,
      )
    : null;
  return { order, attempt };
}

async function payOrder(attempt: PaymentAttemptDoc, eventId: string) {
  return checkout.applyVerifiedEvent(
    { eventId, eventType: "mock.succeeded", providerOrderId: attempt.providerOrderId, outcome: "succeeded", amountPaise: attempt.amountPaise },
    "mock",
  );
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

/* --------------------------- Scenario A: normal checkout --------------------------- */

describe("Scenario A — normal checkout is untouched", () => {
  it("creates a plain order without any gift information", async () => {
    const v = findVariant("AN-HNY-010-100G");
    const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }] });
    const res = await checkout.createOrder(
      {
        quoteId: quote.quoteId,
        paymentMethod: "gateway",
        customer: { displayName: "Test Purchaser", email: "purchaser@test.dev", phone: "9876543210" },
        address: purchaserAddress(),
        acceptTerms: true,
        deliverToSomeoneElse: false,
      },
      purchaser,
    );
    const order = res as OrderDoc;
    expect(order.isGiftOrder).toBe(false);
    expect(order.gift).toBeUndefined();
    expect(order.shippingAddress.fullName).toBe("Test Purchaser");
    expect(order.shippingAddress.city).toBe("Delhi");
    expect(order.customerUid).toBe(purchaser.uid);
  });

  it("ignores stray recipient fields when gift mode is off", async () => {
    const v = findVariant("AN-HNY-010-250G");
    const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }] });
    const details = recipientDetails();
    const res = await checkout.createOrder(
      {
        quoteId: quote.quoteId,
        paymentMethod: "gateway",
        customer: { displayName: "Test Purchaser", email: "purchaser@test.dev", phone: "9876543210" },
        address: purchaserAddress(),
        acceptTerms: true,
        deliverToSomeoneElse: false,
        recipient: details.recipient,
        recipientAddress: details.recipientAddress,
      } as Parameters<CheckoutService["createOrder"]>[0],
      purchaser,
    );
    const order = res as OrderDoc;
    expect(order.isGiftOrder).toBe(false);
    expect(order.gift).toBeUndefined();
    expect(order.shippingAddress.fullName).toBe("Test Purchaser");
  });
});

/* ---------------------------- Scenario B: gift checkout ---------------------------- */

describe("Scenario B — gift checkout stores the recipient snapshot", () => {
  it("keeps the purchaser as owner and ships to the recipient", async () => {
    const { order } = await placeGiftOrder("AN-HNY-010-500G", purchaser);

    expect(order.isGiftOrder).toBe(true);
    expect(order.customerUid).toBe(purchaser.uid); // purchaser owns the order
    expect(order.customerContact.displayName).toBe("Test Purchaser"); // purchaser stays the contact
    expect(order.gift?.recipientName).toBe("Ananya Sharma");
    expect(order.gift?.recipientPhone).toBe("9123456780");
    expect(order.gift?.message).toContain("Happy Diwali");

    // The shipping snapshot IS the recipient's address
    expect(order.shippingAddress.fullName).toBe("Ananya Sharma");
    expect(order.shippingAddress.phone).toBe("9123456780");
    expect(order.shippingAddress.line1).toBe("22 Holi Adda Road");
    expect(order.shippingAddress.city).toBe("Meerut");
    expect(order.shippingAddress.pincode).toBe("250002");
    expect(order.shippingAddress.isDefault).toBe(false);
  });

  it("stores an empty gift message as absent (not empty string)", async () => {
    const { order } = await placeGiftOrder("AN-HNY-010-1KG", purchaser, { giftMessage: "   " });
    expect(order.isGiftOrder).toBe(true);
    expect(order.gift?.message).toBeUndefined();
  });
});

/* ------------------------ Scenario C: address separation --------------------------- */

describe("Scenario C — purchaser's saved address is never modified", () => {
  it("leaves the customer's saved address book untouched by a gift order", async () => {
    // Seed a customer with a saved default address
    const savedAddress = {
      id: "addr_saved_1",
      label: "Home",
      fullName: "Test Purchaser",
      phone: "9876543210",
      line1: "1 Purchaser Street",
      city: "Delhi",
      state: "Delhi",
      pincode: "110001",
      country: "India",
      isDefault: true,
    };
    const customerDoc: CustomerDoc = {
      id: "cust_gift_test",
      uid: purchaser.uid,
      displayName: "Test Purchaser",
      email: "purchaser@test.dev",
      providers: ["password"],
      accountStatus: "active",
      defaultAddressId: savedAddress.id,
      addresses: [savedAddress],
      marketingOptIn: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isDemo: false,
    };
    await db.set(COLLECTIONS.customers, customerDoc.id, customerDoc as unknown as Record<string, unknown>);

    await placeGiftOrder("AN-KES-001-05G", purchaser);

    const after = await db.get<CustomerDoc>(COLLECTIONS.customers, customerDoc.id);
    expect(after).toBeTruthy();
    expect(after!.addresses.length).toBe(1);
    expect(after!.addresses[0].line1).toBe("1 Purchaser Street");
    expect(after!.addresses[0].isDefault).toBe(true);
    expect(after!.defaultAddressId).toBe(savedAddress.id);
    expect(after!.addresses[0].phone).toBe("9876543210");
  });
});

/* --------------------- Scenario D: payment failure and retry ----------------------- */

describe("Scenario D — payment failure and retry keep gift details", () => {
  it("cancels a failed gift payment and preserves recipient details on the retried order", async () => {
    // First attempt fails
    const first = await placeGiftOrder("AN-KES-001-1G", purchaser);
    expect(first.attempt).not.toBeNull();
    const failedOrder = await db.get<OrderDoc>(COLLECTIONS.orders, first.order.id);
    expect(failedOrder!.isGiftOrder).toBe(true);
    await checkout.applyVerifiedEvent(
      { eventId: "evt_gift_fail_1", eventType: "mock.failed", providerOrderId: first.attempt!.providerOrderId, outcome: "failed" },
      "mock",
    );
    const cancelled = await db.get<OrderDoc>(COLLECTIONS.orders, first.order.id);
    expect(cancelled!.status).toBe("cancelled");
    expect(cancelled!.paymentStatus).toBe("failed");
    // Cancelled order still carries the recipient snapshot (audit trail)
    expect(cancelled!.gift?.recipientName).toBe("Ananya Sharma");

    // Retry creates a NEW order (fresh quote) with the same recipient details
    const retry = await placeGiftOrder("AN-KES-001-2G", purchaser);
    expect(retry.order.id).not.toBe(first.order.id); // no duplicate/reuse — a distinct order
    expect(retry.order.gift?.recipientName).toBe("Ananya Sharma");
    expect(retry.order.shippingAddress.city).toBe("Meerut");
    expect(retry.order.customerUid).toBe(purchaser.uid);

    // Duplicate payment application on the retry attempt stays idempotent
    const pay = await payOrder(retry.attempt!, `evt_gift_retry_${retry.order.id}`);
    expect(pay.applied).toBe(true);
    const again = await payOrder(retry.attempt!, `evt_gift_retry_${retry.order.id}`);
    expect(again.applied).toBe(false);
  });
});

/* --------------------- Scenario E: account and admin visibility -------------------- */

describe("Scenario E — purchaser and admin visibility", () => {
  it("lets the purchaser view their gift order and blocks other customers", async () => {
    const { order } = await placeGiftOrder("AN-KES-002-05G", purchaser);

    const mine = await orders.getForCustomer(order.id, purchaser.uid);
    expect(mine.isGiftOrder).toBe(true);
    expect(mine.gift?.recipientName).toBe("Ananya Sharma");

    await expect(orders.getForCustomer(order.id, otherCustomer.uid)).rejects.toThrow(/not found/i);
  });

  it("lets an authorised admin retrieve the gift order for fulfilment", async () => {
    const { order } = await placeGiftOrder("AN-KES-002-1G", purchaser);
    const adminView = await orders.getAdmin(order.id);
    expect(adminView.gift?.recipientPhone).toBe("9123456780");
    expect(adminView.shippingAddress.pincode).toBe("250002");
  });
});

/* ------------------------------ Scenario F: shipping ------------------------------- */

describe("Scenario F — shipping uses the recipient snapshot", () => {
  it("keeps the recipient address stable through paid fulfilment + AWB tracking", async () => {
    const { order, attempt } = await placeGiftOrder("AN-KES-002-2G", purchaser);
    await payOrder(attempt!, `evt_gift_ship_${order.id}`);

    const processing = await orders.updateStatus(order.id, { status: "processing" }, owner);
    expect(processing.status).toBe("processing");

    // Manual AWB entry (existing workflow) — recipient address must remain the snapshot
    const shipped = await orders.updateStatus(
      order.id,
      { status: "shipped", tracking: { carrier: "Shiprocket (Delhivery)", trackingNumber: "SR12345678901" } },
      owner,
    );
    expect(shipped.status).toBe("shipped");
    expect(shipped.tracking?.trackingNumber).toBe("SR12345678901");
    expect(shipped.shippingAddress.fullName).toBe("Ananya Sharma"); // recipient, not purchaser
    expect(shipped.shippingAddress.phone).toBe("9123456780"); // courier contact number
    expect(shipped.shippingAddress.line1).toBe("22 Holi Adda Road");
  });
});

/* ---------------------------- Scenario G: validation ------------------------------- */

describe("Scenario G — backend validation of gift fields", () => {
  const base = {
    quoteId: "qte_gift_validation",
    paymentMethod: "gateway" as const,
    customer: { displayName: "Test Purchaser", email: "purchaser@test.dev", phone: "9876543210" },
    address: purchaserAddress(),
    acceptTerms: true as const,
  };

  function parse(payload: unknown) {
    return createOrderSchema.safeParse(payload);
  }

  it("rejects gift mode without recipient details", () => {
    const res = parse({ ...base, address: undefined, deliverToSomeoneElse: true });
    expect(res.success).toBe(false);
    if (!res.success) {
      const messages = res.error.issues.map((i) => i.message).join(" | ");
      expect(messages).toMatch(/Recipient name and phone are required/);
      expect(messages).toMatch(/recipient's delivery address is required/i);
    }
  });

  it("rejects an invalid recipient phone number", () => {
    const details = recipientDetails();
    const res = parse({
      ...base,
      deliverToSomeoneElse: true,
      recipient: { fullName: "Ananya Sharma", phone: "12345" },
      recipientAddress: details.recipientAddress,
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0].message).toMatch(/valid Indian mobile/i);
  });

  it("rejects an invalid recipient pincode", () => {
    const details = recipientDetails();
    const res = parse({
      ...base,
      deliverToSomeoneElse: true,
      recipient: details.recipient,
      recipientAddress: { ...details.recipientAddress, pincode: "2500" },
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues.map((i) => i.message).join(" ")).toMatch(/6 digits/);
  });

  it(`rejects gift messages over ${GIFT_MESSAGE_MAX} characters`, () => {
    const details = recipientDetails();
    const res = parse({
      ...base,
      deliverToSomeoneElse: true,
      recipient: details.recipient,
      recipientAddress: details.recipientAddress,
      giftMessage: "x".repeat(GIFT_MESSAGE_MAX + 1),
    });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0].message).toMatch(/250 characters or fewer/);
  });

  it("rejects normal checkout without a delivery address", () => {
    const res = parse({ ...base, address: undefined });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0].message).toMatch(/Delivery address is required/);
  });

  it("does not block normal checkout with gift validation rules", () => {
    const res = parse({ ...base });
    expect(res.success).toBe(true);
  });

  it("the service layer also refuses a gift order missing recipient data (defence in depth)", async () => {
    const v = findVariant("AN-KES-002-5G");
    const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }] });
    await expect(
      checkout.createOrder(
        {
          ...base,
          quoteId: quote.quoteId,
          address: undefined as unknown as typeof base.address,
          deliverToSomeoneElse: true,
        } as Parameters<CheckoutService["createOrder"]>[0],
        purchaser,
      ),
    ).rejects.toThrow();
  });
});

/* ----------------- Scenario H: persistence & backward compatibility ---------------- */

describe("Scenario H — persistence and backward compatibility", () => {
  it("gift details survive a raw re-read from the data store", async () => {
    const { order } = await placeGiftOrder("AN-HNY-009-100G", purchaser);
    const raw = await db.get<OrderDoc>(COLLECTIONS.orders, order.id);
    expect(raw!.gift?.recipientName).toBe("Ananya Sharma");
    expect(raw!.gift?.recipientPhone).toBe("9123456780");
    expect(raw!.gift?.message).toBeTruthy();
    expect(raw!.isGiftOrder).toBe(true);
  });

  it("pre-gift orders (isGiftOrder false, no gift field) still load everywhere", async () => {
    // Demo seed orders are all legacy-shaped (isGiftOrder: false, no gift field)
    const demoOrders = await db.list<OrderDoc>(COLLECTIONS.orders, {
      where: [{ field: "isDemo", op: "==", value: true }],
      limit: 1,
    });
    expect(demoOrders.length).toBe(1);
    const legacy = demoOrders[0];
    expect(legacy.isGiftOrder).toBe(false);
    expect(legacy.gift).toBeUndefined();

    // The customer service path returns them without erroring on missing gift fields
    const demoCustomer = await db.list<CustomerDoc>(COLLECTIONS.customers, { limit: 1 });
    if (demoCustomer[0]) {
      const legacyOrders = await orders.listForCustomer(demoCustomer[0].uid, 1, 10);
      expect(Array.isArray(legacyOrders.items)).toBe(true);
    }
  });

  it("admin list gift filter separates gift orders from standard ones", async () => {
    const giftPage = await orders.listAdmin({ gift: true, page: 1, pageSize: 100 });
    expect(giftPage.items.length).toBeGreaterThan(0);
    expect(giftPage.items.every((o) => o.isGiftOrder)).toBe(true);

    const standardPage = await orders.listAdmin({ gift: false, page: 1, pageSize: 100 });
    expect(standardPage.items.every((o) => !o.isGiftOrder)).toBe(true);

    // Gift search also matches the recipient name
    const byRecipient = await orders.listAdmin({ search: "ananya", page: 1, pageSize: 100 });
    expect(byRecipient.items.length).toBeGreaterThan(0);
    expect(byRecipient.items.every((o) => o.isGiftOrder)).toBe(true);
  });
});
