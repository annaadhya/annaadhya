/**
 * India-only delivery restriction — the storefront pins its country select to
 * India, but the API is the enforcement point. These tests pin the contract:
 *
 *   - every delivery address (purchaser, gift recipient, saved-to-profile) is
 *     re-validated server-side; the client-supplied country is never trusted
 *   - common representations of India ("IN", "IND", "Bharat", "भारत"…) normalize
 *     to the canonical "India" before anything is written
 *   - any other destination is rejected with one clear, consistent message
 *     BEFORE quote consumption, stock reservation or payment
 *   - legacy payloads without a country parse as India (the storefront never
 *     offered international addresses) and historical orders are untouched
 */
import { beforeAll, describe, expect, it } from "vitest";
import { InMemoryDataClient, applySeed } from "@annaadhya/data-core";
import {
  COLLECTIONS,
  DELIVERY_COUNTRY,
  DELIVERY_COUNTRY_ERROR,
  createOrderSchema,
  deliveryCountrySchema,
  savedAddressSchema,
  type AuthPrincipal,
  type CheckoutQuoteDto,
  type OrderDoc,
  type ProductVariantDoc,
} from "@annaadhya/contracts";
import { loadEnv, resetEnvCache } from "../src/config/env";
import { SettingsService } from "../src/modules/settings/settings.service";
import { AuditService } from "../src/modules/audit/audit.service";
import { CheckoutService } from "../src/modules/checkout/checkout.service";
import { MockPaymentProvider } from "../src/modules/payments/mock.provider";
import { RazorpayProvider } from "../src/modules/payments/razorpay.provider";

process.env.NODE_ENV = "test";
process.env.DATA_PROVIDER = "memory";

let db: InMemoryDataClient;
let checkout: CheckoutService;
let variants: ProductVariantDoc[];

const customer: AuthPrincipal = {
  uid: "india-test-customer",
  email: "india-cust@test.dev",
  provider: "password",
  role: "customer",
  permissions: [],
  isStaff: false,
};

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
  variants = await db.list<ProductVariantDoc>(COLLECTIONS.productVariants);
});

function findVariant(suffix: string): ProductVariantDoc {
  const v = variants.find((x) => x.sku.endsWith(suffix));
  if (!v) throw new Error(`variant ${suffix} not found`);
  return v;
}

/** A valid Indian delivery address; `country` is injected per-test. */
function addressBody(country?: string) {
  return {
    label: "Home",
    fullName: "Test Customer",
    phone: "9876543210",
    line1: "1 Test Street",
    city: "Meerut",
    state: "Uttar Pradesh",
    pincode: "250002",
    ...(country !== undefined ? { country } : {}),
  };
}

function orderBody(country?: string | undefined, addressOverride?: Record<string, unknown>) {
  return {
    quoteId: "placeholder",
    paymentMethod: "gateway" as const,
    customer: { displayName: "Test Customer", email: "cust@test.dev", phone: "9876543210" },
    address: addressOverride ?? addressBody(country),
    acceptTerms: true as const,
    deliverToSomeoneElse: false,
  };
}

/* ----------------------------- schema level ------------------------------- */

describe("deliveryCountrySchema — normalization & rejection", () => {
  it.each([
    ["India", "India"],
    ["IN", "India"],
    ["IND", "India"],
    ["in", "India"],
    ["  India  ", "India"],
    ["Bharat", "India"],
    ["भारत", "India"],
    ["Republic of India", "India"],
    ["Hindustan", "India"],
  ])("normalizes %j to %j", (input, expected) => {
    expect(deliveryCountrySchema.parse(input)).toBe(expected);
  });

  it("defaults an absent or empty country to India (legacy payloads stay valid)", () => {
    expect(deliveryCountrySchema.parse(undefined)).toBe(DELIVERY_COUNTRY);
    expect(deliveryCountrySchema.parse("")).toBe(DELIVERY_COUNTRY);
    expect(deliveryCountrySchema.parse("   ")).toBe(DELIVERY_COUNTRY);
  });

  it.each([
    ["United States"],
    ["United States of America"],
    ["USA"],
    ["Canada"],
    ["Germany"],
    ["Australia"],
    ["United Arab Emirates"],
    ["Singapore"],
  ])("rejects %j with the consistent India-only message", (input) => {
    const res = deliveryCountrySchema.safeParse(input);
    expect(res.success).toBe(false);
    if (!res.success) {
      const issue = res.error.issues[0];
      expect(issue.message).toBe(DELIVERY_COUNTRY_ERROR);
    }
  });

  it("rejects absurd lengths with a bounded message", () => {
    const res = deliveryCountrySchema.safeParse("x".repeat(81));
    expect(res.success).toBe(false);
  });
});

describe("createOrderSchema — country enforcement on both address slots", () => {
  it("normalizes the purchaser address country through the full order schema", () => {
    const parsed = createOrderSchema.parse({ ...orderBody(), quoteId: "quote_abc123" });
    expect(parsed.address!.country).toBe(DELIVERY_COUNTRY);
  });

  it("defaults a missing country on the order address to India", () => {
    const parsed = createOrderSchema.parse(orderBody(undefined));
    expect(parsed.address!.country).toBe(DELIVERY_COUNTRY);
  });

  it("rejects an international delivery address before any side effect", () => {
    const res = createOrderSchema.safeParse(orderBody("United States"));
    expect(res.success).toBe(false);
    if (!res.success) {
      const messages = res.error.issues.map((i) => i.message);
      expect(messages).toContain(DELIVERY_COUNTRY_ERROR);
      const countryIssue = res.error.issues.find((i) => i.path.join(".").endsWith("country"));
      expect(countryIssue).toBeDefined();
    }
  });

  it("rejects an international gift-recipient address (deliverToSomeoneElse path)", () => {
    const res = createOrderSchema.safeParse({
      quoteId: "quote_abc123",
      paymentMethod: "gateway",
      customer: { displayName: "Giver", email: "giver@test.dev", phone: "9876543210" },
      acceptTerms: true,
      deliverToSomeoneElse: true,
      recipient: { fullName: "NRI Cousin", phone: "9812345678" },
      recipientAddress: addressBody("United Kingdom"),
      giftMessage: "Miss you!",
    });
    expect(res.success).toBe(false);
    if (!res.success) {
      const countryIssue = res.error.issues.find((i) => i.path.join(".").startsWith("recipientAddress"));
      expect(countryIssue?.message).toBe(DELIVERY_COUNTRY_ERROR);
    }
  });

  it("accepts a gift recipient address written as an India alias", () => {
    const parsed = createOrderSchema.parse({
      quoteId: "quote_abc123",
      paymentMethod: "gateway",
      customer: { displayName: "Giver", email: "giver@test.dev", phone: "9876543210" },
      acceptTerms: true,
      deliverToSomeoneElse: true,
      recipient: { fullName: "Cousin", phone: "9812345678" },
      recipientAddress: addressBody("IN"),
    });
    expect(parsed.recipientAddress!.country).toBe(DELIVERY_COUNTRY);
  });
});

describe("savedAddressSchema — address book enforcement", () => {
  it("normalizes alias spellings on save", () => {
    const parsed = savedAddressSchema.parse({ ...addressBody("IND"), isDefault: false });
    expect(parsed.country).toBe(DELIVERY_COUNTRY);
  });

  it("defaults a missing country to India", () => {
    const parsed = savedAddressSchema.parse({ ...addressBody(), isDefault: false });
    expect(parsed.country).toBe(DELIVERY_COUNTRY);
  });

  it("refuses to save a foreign address to the profile", () => {
    const res = savedAddressSchema.safeParse({ ...addressBody("France"), isDefault: false });
    expect(res.success).toBe(false);
    if (!res.success) expect(res.error.issues[0].message).toBe(DELIVERY_COUNTRY_ERROR);
  });
});

/* ----------------------------- service level ------------------------------ */

describe("CheckoutService — India-only enforcement on real order creation", () => {
  it("persists the normalized country on the shipping snapshot (alias input)", async () => {
    const v = findVariant("AN-HNY-001-250G");
    const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "250002" } satisfies CheckoutQuoteDto);
    const dto = createOrderSchema.parse({ ...orderBody("IN"), quoteId: quote.quoteId });
    const order = (await checkout.createOrder(dto, customer)) as OrderDoc;
    expect(order.shippingAddress.country).toBe(DELIVERY_COUNTRY);
    expect(order.shippingAddress.city).toBe("Meerut");
  });

  it("persists India for a legacy payload that never sent a country", async () => {
    const v = findVariant("AN-DRY-001-250G");
    const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "250002" } satisfies CheckoutQuoteDto);
    const dto = createOrderSchema.parse({ ...orderBody(undefined), quoteId: quote.quoteId });
    const order = (await checkout.createOrder(dto, customer)) as OrderDoc;
    expect(order.shippingAddress.country).toBe(DELIVERY_COUNTRY);
  });

  it("writes the recipient snapshot's normalized country on gift orders", async () => {
    const v = findVariant("AN-HNY-002-100G");
    const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "250002" } satisfies CheckoutQuoteDto);
    const dto = createOrderSchema.parse({
      quoteId: quote.quoteId,
      paymentMethod: "gateway",
      customer: { displayName: "Giver", email: "giver@test.dev", phone: "9876543210" },
      acceptTerms: true,
      deliverToSomeoneElse: true,
      recipient: { fullName: "Cousin", phone: "9812345678" },
      recipientAddress: addressBody("Bharat"),
      giftMessage: "Happy Diwali!",
    });
    const order = (await checkout.createOrder(dto, customer)) as OrderDoc;
    expect(order.isGiftOrder).toBe(true);
    expect(order.shippingAddress.country).toBe(DELIVERY_COUNTRY);
    expect(order.shippingAddress.fullName).toBe("Cousin");
  });

  it("never charges or reserves stock for an international destination — the DTO layer stops it first", async () => {
    const v = findVariant("AN-DRY-002-100G");
    const before = await db.get<ProductVariantDoc>(COLLECTIONS.productVariants, v.id);
    const quote = await checkout.quote({ items: [{ variantId: v.id, qty: 1 }], pincode: "250002" } satisfies CheckoutQuoteDto);
    // Mirror the HTTP pipe exactly: the schema runs BEFORE the service is reached.
    const dto = orderBody("United States");
    const parsed = createOrderSchema.safeParse({ ...dto, quoteId: quote.quoteId });
    expect(parsed.success).toBe(false);
    // The quote stays unconsumed and stock untouched — nothing happened at all.
    const storedQuote = await db.get<{ consumed: boolean }>(COLLECTIONS.checkoutQuotes, quote.quoteId);
    expect(storedQuote?.consumed ?? false).toBe(false);
    const after = await db.get<ProductVariantDoc>(COLLECTIONS.productVariants, v.id);
    expect(after!.reservedQty).toBe(before!.reservedQty);
  });
});
