/**
 * Admin customer directory — metrics, filters, privacy.
 *
 * Covers the contract behind the Customers console:
 *  - spend/order metric rules: only REAL orders count (ghost pending_payment checkouts
 *    never do); completed spend = online payments captured (net of refunds) + COD
 *    delivered; cancelled/refunded/unpaid orders never count;
 *  - directory filters (activity / status / search / registration window), sorting,
 *    pagination honesty, and the summary cards over the same filtered cohort;
 *  - privacy: list rows never carry addresses or note text; roles without
 *    customers:write receive masked contact fields; storefront-facing responses
 *    (forSelf) never include internal staff notes;
 *  - account status writes persist to `accountStatus` (regression: an earlier revision
 *    wrote a stray `status` key, so Suspend/Activate silently did nothing) and are
 *    audited; internal notes are audited too.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { InMemoryDataClient, applySeed } from "@annaadhya/data-core";
import {
  COLLECTIONS,
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
import {
  CustomersService,
  aggregateOrdersByCustomer,
  isCompletedSpendOrder,
  isRealOrder,
} from "../src/modules/customers/customers.service";

process.env.NODE_ENV = "test";
process.env.DATA_PROVIDER = "memory";

let db: InMemoryDataClient;
let checkout: CheckoutService;
let orders: OrdersService;
let customers: CustomersService;
let variants: ProductVariantDoc[];

const customerA: AuthPrincipal = {
  uid: "cust-dir-a",
  email: "dircust.a@filter.test",
  provider: "password",
  role: "customer",
  permissions: [],
  isStaff: false,
};
const customerB: AuthPrincipal = {
  uid: "cust-dir-b",
  email: "dircust.b@filter.test",
  provider: "password",
  role: "customer",
  permissions: [],
  isStaff: false,
};
const customerC: AuthPrincipal = {
  uid: "cust-dir-c",
  email: "dircust.c@filter.test",
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
  permissions: ["customers:read", "customers:write", "orders:read", "orders:write", "orders:refund"],
  isStaff: true,
};

const readOnly: AuthPrincipal = {
  uid: "test-viewer",
  email: "viewer@test.dev",
  provider: "dev",
  role: "reports",
  permissions: ["customers:read"],
  isStaff: true,
};

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
    fullName: "Dir Cust",
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
      eventId: `evt_dircust_${order.id}`,
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

/** Gateway order created but never paid — the "ghost checkout" shape. */
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
  return orders.getAdmin((res as OrderDoc).id);
}

/** COD order — confirmed at creation (payment collected on delivery). */
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

async function dirRow(principal: AuthPrincipal) {
  const page = await customers.directory({ activity: "all", status: "all", sort: "spend_desc", page: 1, pageSize: 100 });
  const row = page.items.find((c) => c.uid === principal.uid);
  if (!row) throw new Error(`directory row for ${principal.uid} not found`);
  return row;
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
  customers = new CustomersService(db, audit);
  variants = await db.list<ProductVariantDoc>(COLLECTIONS.productVariants);
  const settingsDoc = await db.get<{ payments: { codEnabled: boolean } }>(COLLECTIONS.settings, "global");
  await db.update(COLLECTIONS.settings, "global", {
    payments: { ...settingsDoc!.payments, codEnabled: true },
  });

  // Provision the three storefront profiles (as /auth/verify would).
  await customers.me(customerA);
  await customers.me(customerB);
  await customers.me(customerC);
});

describe("customer metric primitives", () => {
  it("classifies ghost checkouts as not real and not spend", () => {
    const ghost = { status: "pending_payment", paymentStatus: "pending" } as OrderDoc;
    expect(isRealOrder(ghost)).toBe(false);
    expect(isCompletedSpendOrder(ghost)).toBe(false);
  });

  it("excludes cancelled and refunded orders from spend", () => {
    const cancelled = { status: "cancelled", paymentStatus: "succeeded", paymentProvider: "mock" } as OrderDoc;
    const refunded = { status: "refunded", paymentStatus: "refunded", paymentProvider: "mock" } as OrderDoc;
    const pendingCod = { status: "confirmed", paymentStatus: "pending", paymentProvider: "cod" } as OrderDoc;
    expect(isRealOrder(cancelled)).toBe(true);
    expect(isCompletedSpendOrder(cancelled)).toBe(false);
    expect(isCompletedSpendOrder(refunded)).toBe(false);
    expect(isCompletedSpendOrder(pendingCod)).toBe(false);
  });

  it("counts delivered COD as spend but shipped COD as receivable, not spend", () => {
    const shipped = { status: "shipped", paymentStatus: "pending", paymentProvider: "cod" } as OrderDoc;
    const delivered = { status: "delivered", paymentStatus: "pending", paymentProvider: "cod" } as OrderDoc;
    expect(isCompletedSpendOrder(shipped)).toBe(false);
    expect(isCompletedSpendOrder(delivered)).toBe(true);
  });

  it("aggregates per-customer metrics and nets refunds off completed spend", () => {
    const t1 = 340_000;
    const t2 = 199_500;
    const ordersList = [
      { id: "o1", customerUid: "u1", status: "delivered", paymentStatus: "succeeded", paymentProvider: "mock", totalPaise: t1, refundPaise: 40_000, createdAt: 5, orderNumber: "AN-1" },
      { id: "o2", customerUid: "u1", status: "confirmed", paymentStatus: "succeeded", paymentProvider: "mock", totalPaise: t2, refundPaise: 0, createdAt: 9, orderNumber: "AN-2" },
      { id: "o3", customerUid: undefined, status: "delivered", paymentStatus: "succeeded", paymentProvider: "mock", totalPaise: 999, refundPaise: 0, createdAt: 7, orderNumber: "AN-3" },
    ] as unknown as OrderDoc[];
    const agg = aggregateOrdersByCustomer(ordersList);
    const u1 = agg.get("u1")!;
    expect(u1.orderCount).toBe(2);
    expect(u1.completedOrderCount).toBe(2);
    expect(u1.totalSpendPaise).toBe(t1 - 40_000 + t2);
    expect(u1.lastOrderId).toBe("o2");
    expect(agg.size).toBe(1); // guest order (no uid) never joins
  });
});

describe("customers directory — metrics over real orders", () => {
  it("computes spend and order counts per the documented rules", async () => {
    // A: two paid gateway orders, one partially refunded afterwards.
    const paid1 = await paidOrder(0, customerA, "Dircust Aanvi");
    const paid2 = await paidOrder(1, customerA, "Dircust Aanvi");
    await orders.refund(paid1.id, { amountPaise: Math.floor(paid1.totalPaise / 2), reason: "directory partial refund" }, owner);

    // B: one COD order still awaiting delivery + one ghost unpaid checkout.
    const cod = await codOrder(2, customerB, "Dircust Bhavik");
    await unpaidOrder(3, customerB, "Dircust Bhavik");
    const rowA = await dirRow(customerA);
    expect(rowA.orderCount).toBe(2); // both paid orders are real
    expect(rowA.completedOrderCount).toBe(2);
    expect(rowA.totalSpendPaise).toBe(paid1.totalPaise - Math.floor(paid1.totalPaise / 2) + paid2.totalPaise);
    expect(rowA.lastOrderNumber).toBe(paid2.orderNumber);

    const rowB = await dirRow(customerB);
    expect(rowB.orderCount).toBe(1); // ghost checkout excluded
    expect(rowB.completedOrderCount).toBe(0);
    expect(rowB.totalSpendPaise).toBe(0); // COD confirmed = receivable, not spend

    // COD delivered → money collected → spend counts, net zero refunds.
    // NOTE: the platform has no COD payment-verification path yet, so the API refuses
    // to move a COD order into fulfilment (updateStatus guard) — the delivered-COD
    // state is written directly here to exercise the directory's delivered-COD rule.
    await db.update(COLLECTIONS.orders, cod.id, { status: "delivered" } as Partial<OrderDoc>);
    const delivered = await orders.getAdmin(cod.id);
    expect(delivered.status).toBe("delivered");
    const rowBAfter = await dirRow(customerB);
    expect(rowBAfter.completedOrderCount).toBe(1);
    expect(rowBAfter.totalSpendPaise).toBe(delivered.totalPaise);
  });

  it("filters activity cohorts and searches on name/email/id", async () => {
    const withOrders = await customers.directory({ activity: "with_orders", status: "all", sort: "spend_desc", page: 1, pageSize: 200 });
    expect(withOrders.items.some((c) => c.uid === customerA.uid)).toBe(true);
    expect(withOrders.items.every((c) => c.orderCount >= 1)).toBe(true);

    const noOrders = await customers.directory({ activity: "no_orders", status: "all", sort: "name_asc", page: 1, pageSize: 200 });
    expect(noOrders.items.some((c) => c.uid === customerC.uid)).toBe(true);
    expect(noOrders.items.every((c) => c.orderCount === 0)).toBe(true);

    const repeat = await customers.directory({ activity: "repeat", status: "all", sort: "spend_desc", page: 1, pageSize: 200 });
    expect(repeat.items.some((c) => c.uid === customerA.uid)).toBe(true);
    expect(repeat.items.some((c) => c.uid === customerB.uid)).toBe(false);
    expect(repeat.items.every((c) => c.orderCount >= 2)).toBe(true);

    const searched = await customers.directory({ search: "dircust", activity: "all", status: "all", sort: "spend_desc", page: 1, pageSize: 100 });
    expect(searched.items.map((c) => c.uid).sort()).toEqual([customerA.uid, customerB.uid, customerC.uid].sort());

    const rowA = await dirRow(customerA);
    const byId = await customers.directory({ search: rowA.id, activity: "all", status: "all", sort: "spend_desc", page: 1, pageSize: 100 });
    expect(byId.items.some((c) => c.id === rowA.id)).toBe(true);
  });

  it("sorts by spend by default and paginates honestly", async () => {
    const page1 = await customers.directory({ activity: "all", status: "all", sort: "spend_desc", page: 1, pageSize: 2 });
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBeGreaterThanOrEqual(3);
    expect(page1.totalPages).toBeGreaterThanOrEqual(2);
    expect(page1.items[0].totalSpendPaise).toBeGreaterThanOrEqual(page1.items[1].totalSpendPaise);

    // Within the fixture cohort the highest spender is customer A (two paid orders).
    const cohort = await customers.directory({ search: "dircust", activity: "all", status: "all", sort: "spend_desc", page: 1, pageSize: 10 });
    expect(cohort.items[0].uid).toBe(customerA.uid);

    const page2 = await customers.directory({ activity: "all", status: "all", sort: "spend_desc", page: 2, pageSize: 2 });
    expect(page2.items.every((c) => c.id !== page1.items[0].id && c.id !== page1.items[1].id)).toBe(true);
  });

  it("summarises the filtered cohort (cards match the table)", async () => {
    const cohort = await customers.directory({ search: "dircust", activity: "all", status: "all", sort: "spend_desc", page: 1, pageSize: 50 });
    expect(cohort.summary.totalCustomers).toBe(3);
    expect(cohort.summary.customersWithOrders).toBe(2);
    expect(cohort.summary.repeatCustomers).toBe(1);
    expect(cohort.summary.newCustomers).toBe(3); // all three registered this IST month
    expect(cohort.summary.newCustomersWindow).toBe("this month");
    const rowA = await dirRow(customerA);
    const rowB = await dirRow(customerB);
    expect(cohort.summary.lifetimeSpendPaise).toBe(rowA.totalSpendPaise + rowB.totalSpendPaise);
    expect(cohort.summary.avgOrdersPerRepeat).toBe(2);
    expect(cohort.total).toBe(3);
  });

  it("filters by registration window", async () => {
    const future = await customers.directory({
      activity: "all",
      status: "all",
      sort: "spend_desc",
      registeredFrom: Date.now() + 86_400_000,
      registeredTo: Date.now() + 7 * 86_400_000,
      page: 1,
      pageSize: 50,
    });
    expect(future.total).toBe(0);
    const now = await customers.directory({
      activity: "all",
      status: "all",
      sort: "spend_desc",
      registeredFrom: Date.now() - 86_400_000,
      registeredTo: Date.now() + 60_000,
      page: 1,
      pageSize: 200,
    });
    expect(now.items.some((c) => c.uid === customerC.uid)).toBe(true);
  });
});

describe("customers privacy and account management", () => {
  it("never ships addresses or note text in directory list rows", async () => {
    await db.update(COLLECTIONS.customers, `cust_${customerA.uid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28)}`, {
      notes: "private staff note content",
      addresses: [
        {
          id: "addr1",
          label: "Home",
          fullName: "Dircust Aanvi",
          phone: "9820144520",
          line1: "Secret Lane 1",
          city: "Bengaluru",
          state: "Karnataka",
          pincode: "560038",
          country: "India",
          isDefault: true,
        },
      ],
    } as Partial<CustomerDoc>);
    const page = await customers.directory({ activity: "all", status: "all", sort: "spend_desc", page: 1, pageSize: 100 });
    const rowA = page.items.find((c) => c.uid === customerA.uid)!;
    expect(rowA.addresses).toEqual([]);
    expect(rowA.notes).toBeUndefined();
  });

  it("masks contact fields server-side for roles without customers:write", async () => {
    const id = `cust_${customerA.uid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28)}`;
    // Profiles provisioned by me() carry no phone — give the doc one so masking is observable.
    await db.update(COLLECTIONS.customers, id, { phone: "9820144520" } as Partial<CustomerDoc>);
    const doc = await customers.getAdmin(id);
    const masked = customers.maskForRole(doc, readOnly.permissions);
    expect(masked.email).not.toBe(customerA.email);
    expect(masked.email).toContain("***");
    expect(masked.phone).not.toBe(doc.phone);
    expect(masked.phone).toContain("xxxxx");
    expect(masked.addresses).toEqual([]);
    const full = customers.maskForRole(doc, owner.permissions);
    expect(full.email).toBe(customerA.email);
    expect(full.phone).toBe("9820144520");
  });

  it("strips internal notes from storefront-facing responses (forSelf)", async () => {
    const id = `cust_${customerA.uid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28)}`;
    const doc = await customers.getAdmin(id);
    expect(doc.notes).toContain("private staff note content");
    const safe = customers.forSelf(doc);
    expect(safe.notes).toBeUndefined();
    expect(safe.displayName).toBe(doc.displayName);
  });

  it("persists notes writes to the notes field and audits them", async () => {
    const id = `cust_${customerB.uid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28)}`;
    const updated = await customers.updateNotes(id, "Prefers festive gift wrapping.", owner);
    expect(updated.notes).toBe("Prefers festive gift wrapping.");
    const auditRows = await db.list<{ action: string; targetId: string }>(COLLECTIONS.auditLogs, { limit: 100 });
    expect(auditRows.some((a) => a.action === "customer.notes_updated" && a.targetId === id)).toBe(true);

    const cleared = await customers.updateNotes(id, "", owner);
    expect(cleared.notes).toBe("");
  });

  it("persists account status to accountStatus (regression) and audits the change", async () => {
    const id = `cust_${customerC.uid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28)}`;
    const suspended = await customers.setStatus(id, "suspended", owner);
    expect(suspended.accountStatus).toBe("suspended");
    const reread = await customers.getAdmin(id);
    expect(reread.accountStatus).toBe("suspended");
    expect((reread as unknown as { status?: string }).status).toBeUndefined();

    const filtered = await customers.directory({ activity: "all", status: "suspended", sort: "spend_desc", page: 1, pageSize: 100 });
    expect(filtered.items.some((c) => c.id === id)).toBe(true);

    const auditRows = await db.list<{ action: string; targetId: string }>(COLLECTIONS.auditLogs, { limit: 100 });
    expect(auditRows.some((a) => a.action === "customer.status_changed" && a.targetId === id)).toBe(true);

    const restored = await customers.setStatus(id, "active", owner);
    expect(restored.accountStatus).toBe("active");
  });

  it("returns the real paginated order history for one customer", async () => {
    const profile = await customers.me(customerA);
    const history = await customers.customerOrders(profile.id, 1, 10);
    expect(history.total).toBe(2);
    expect(history.items.every((o) => o.customerUid === customerA.uid)).toBe(true);
    expect(history.items[0].createdAt).toBeGreaterThanOrEqual(history.items[1].createdAt);
  });
});
