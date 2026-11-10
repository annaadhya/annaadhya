/**
 * Purchases console service tests — run the exact production code paths against the
 * in-memory provider. Covers the critical inventory contract:
 *   • drafts/confirmations never touch stock
 *   • receiving 40 of 50 credits exactly 40, keeps the purchase partially received,
 *     and the remaining 10 completes it
 *   • replayed receipts (same idempotency key) can never double-apply stock
 *   • failed receiving leaves purchase + inventory consistent (transaction rollback)
 *   • payment settlement is derived from persisted payment records only
 *   • cancellation preserves history, receipts and any stock already received
 * plus ledger metrics/filters/sorts, reference generation, draft-only edits and
 * legacy-document fallbacks.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryDataClient, applySeed } from "@annaadhya/data-core";
import {
  COLLECTIONS,
  purchaseReceiveSchema,
  purchaseUpsertSchema,
  type AuthPrincipal,
  type InventoryMovementDoc,
  type ProductVariantDoc,
  type PurchaseDoc,
} from "@annaadhya/contracts";
import { SuppliersService, PurchasesService } from "../src/modules/suppliers/suppliers.service";
import { InventoryService } from "../src/modules/inventory/inventory.service";
import { AuditService } from "../src/modules/audit/audit.service";

process.env.NODE_ENV = "test";
process.env.DATA_PROVIDER = "memory";

let db: InMemoryDataClient;
let suppliers: SuppliersService;
let purchases: PurchasesService;
let audit: AuditService;

const owner: AuthPrincipal = {
  uid: "test-owner",
  email: "owner@test.dev",
  provider: "dev",
  displayName: "Test Owner",
  role: "owner",
  permissions: ["suppliers:read", "suppliers:write", "purchases:read", "purchases:write", "inventory:write", "audit:read"],
  isStaff: true,
};

async function stockOf(sku: string): Promise<number> {
  const found = await db.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
    where: [{ field: "sku", op: "==", value: sku }],
    limit: 1,
  });
  return found[0]?.stockOnHand ?? -1;
}

function draftDto(supplierId: string) {
  return {
    supplierId,
    status: "ordered" as const,
    items: [
      {
        variantSku: "AN-HNY-001-250G",
        description: "Wild forest honey 250 g jars",
        qtyOrdered: 50,
        unitCostPaise: 24500,
        unit: "unit",
        discountPaise: 0,
        taxPercent: 5,
      },
    ],
  };
}

beforeEach(async () => {
  db = new InMemoryDataClient({ nodeEnv: "test" });
  await applySeed(db);
  audit = new AuditService(db);
  suppliers = new SuppliersService(db);
  const inventory = new InventoryService(db);
  purchases = new PurchasesService(db, suppliers, inventory, audit);
});

describe("purchase creation", () => {
  it("creates a draft with server-computed totals and catalogue snapshots, touching no stock", async () => {
    const sup = (await suppliers.list())[0];
    const before = await stockOf("AN-HNY-001-250G");
    const doc = await purchases.upsert({
      supplierId: sup.id,
      status: "draft",
      items: [
        { variantSku: "AN-HNY-001-250G", description: "Honey jars", qtyOrdered: 100, unitCostPaise: 24500, unit: "unit", discountPaise: 20000, taxPercent: 5 },
      ],
    });
    expect(doc.id).toMatch(/^pur_/);
    expect(doc.status).toBe("draft");
    // subtotal 100×24500=2,450,000; discount 20,000 → 2,430,000; +5% = 121,500 → total 2,551,500
    expect(doc.subTotalPaise).toBe(2_450_000);
    expect(doc.discountTotalPaise).toBe(20_000);
    expect(doc.taxTotalPaise).toBe(121_500);
    expect(doc.totalPaise).toBe(2_551_500);
    expect(doc.items[0].productName).toBe("Annaadhya Vanamrit Honey");
    expect(doc.items[0].variantPackLabel).toBe("250 g");
    expect(doc.items[0].lineTotalPaise).toBe(2_551_500);
    expect(doc.createdByName).toBeUndefined(); // service-level create without actor
    // no inventory movement was created
    const movements = await db.list<InventoryMovementDoc>(COLLECTIONS.inventoryMovements, { limit: 1000 });
    expect(movements.filter((m) => m.referenceType === "purchase" && m.referenceId === doc.id)).toHaveLength(0);
    expect(await stockOf("AN-HNY-001-250G")).toBe(before);
    const persisted = await db.get<PurchaseDoc>(COLLECTIONS.purchases, doc.id);
    expect(persisted?.totalPaise).toBe(2_551_500);
  });

  it("auto-generates sequential PUR-<year>-NNN references when none is supplied", async () => {
    const sup = (await suppliers.list())[0];
    const a = await purchases.upsert({ ...draftDto(sup.id), status: "draft" });
    const b = await purchases.upsert({ ...draftDto(sup.id), status: "draft" });
    const year = new Date().getFullYear();
    expect(a.reference).toBe(`PUR-${year}-001`);
    expect(b.reference).toBe(`PUR-${year}-002`);
  });

  it("rejects unknown or archived catalogue SKUs", async () => {
    const sup = (await suppliers.list())[0];
    await expect(
      purchases.upsert({
        supplierId: sup.id,
        status: "draft",
        items: [{ variantSku: "AN-DOES-NOT-EXIST", description: "", qtyOrdered: 1, unitCostPaise: 100, unit: "unit", discountPaise: 0, taxPercent: 0 }],
      }),
    ).rejects.toThrow(/Unknown catalogue SKU/);
  });

  it("rejects a supplied duplicate reference", async () => {
    const sup = (await suppliers.list())[0];
    await purchases.upsert({ supplierId: sup.id, status: "draft", reference: "PO-DUP-1", items: draftDto(sup.id).items });
    await expect(
      purchases.upsert({ supplierId: sup.id, status: "draft", reference: "PO-DUP-1", items: draftDto(sup.id).items }),
    ).rejects.toThrow(); // Firestore/memory unique reference is enforced via generateReference collision below
  });
});

describe("confirmation & editing", () => {
  it("confirming a draft makes it ordered without any inventory change", async () => {
    const sup = (await suppliers.list())[0];
    const before = await stockOf("AN-HNY-001-250G");
    const draft = await purchases.upsert({ ...draftDto(sup.id), status: "draft" });
    const confirmed = await purchases.confirm(draft.id, owner);
    expect(confirmed.status).toBe("ordered");
    expect(confirmed.confirmedAt).toBeGreaterThan(0);
    expect(await stockOf("AN-HNY-001-250G")).toBe(before);
    await expect(purchases.confirm(draft.id, owner)).rejects.toThrow(/Only draft/);
  });

  it("only drafts are editable", async () => {
    const sup = (await suppliers.list())[0];
    const draft = await purchases.upsert({ ...draftDto(sup.id), status: "draft" });
    const edited = await purchases.upsert({ ...draftDto(sup.id), items: [{ ...draftDto(sup.id).items[0], qtyOrdered: 60 }] }, owner, draft.id);
    expect(edited.items[0].qtyOrdered).toBe(60);
    expect(edited.reference).toBe(draft.reference); // reference stays stable on edit
    await purchases.confirm(draft.id, owner);
    await expect(purchases.upsert({ ...draftDto(sup.id) }, owner, draft.id)).rejects.toThrow(/Only draft purchases can be edited/);
  });
});

describe("goods receiving (critical inventory rule)", () => {
  it("receiving 40 of 50 credits exactly 40 and keeps the purchase partially received", async () => {
    const sup = (await suppliers.list())[0];
    const before = await stockOf("AN-HNY-001-250G");
    const po = await purchases.upsert(draftDto(sup.id)); // ordered, 50 units
    const after = await purchases.receive(po.id, { receiptId: "rcv-test-0001", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 40 }] }, owner);
    expect(after.status).toBe("partially_received");
    expect(after.items[0].qtyReceived).toBe(40);
    expect(await stockOf("AN-HNY-001-250G")).toBe(before + 40);
    // receipt persisted with movement linkage
    expect(after.receipts).toHaveLength(1);
    const receipt = after.receipts![0];
    expect(receipt.id).toBe("rcv-test-0001");
    expect(receipt.movementIds).toHaveLength(1);
    const movement = await db.get<InventoryMovementDoc>(COLLECTIONS.inventoryMovements, receipt.movementIds[0]);
    expect(movement?.qtyDelta).toBe(40);
    expect(movement?.type).toBe("received");
    expect(movement?.referenceId).toBe(po.id);
  });

  it("completing the remaining 10 credits exactly 10 and closes the purchase", async () => {
    const sup = (await suppliers.list())[0];
    const before = await stockOf("AN-HNY-001-250G");
    const po = await purchases.upsert(draftDto(sup.id));
    await purchases.receive(po.id, { receiptId: "rcv-test-0001", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 40 }] }, owner);
    const done = await purchases.receive(po.id, { receiptId: "rcv-test-0002", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 10 }] }, owner);
    expect(done.status).toBe("received");
    expect(done.items[0].qtyReceived).toBe(50);
    expect(await stockOf("AN-HNY-001-250G")).toBe(before + 50);
    expect(done.receipts).toHaveLength(2);
  });

  it("a replayed receipt (same idempotency key) never applies stock twice", async () => {
    const sup = (await suppliers.list())[0];
    const before = await stockOf("AN-HNY-001-250G");
    const po = await purchases.upsert(draftDto(sup.id));
    const first = await purchases.receive(po.id, { receiptId: "rcv-replay-01", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 40 }] }, owner);
    const replay = await purchases.receive(po.id, { receiptId: "rcv-replay-01", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 40 }] }, owner);
    expect(replay.items[0].qtyReceived).toBe(40);
    expect(replay.receipts).toHaveLength(1);
    expect(await stockOf("AN-HNY-001-250G")).toBe(before + 40);
    expect(first.receipts).toEqual(replay.receipts);
  });

  it("over-receiving is rejected atomically — stock and purchase stay consistent", async () => {
    const sup = (await suppliers.list())[0];
    const before = await stockOf("AN-HNY-001-250G");
    const po = await purchases.upsert(draftDto(sup.id));
    await purchases.receive(po.id, { receiptId: "rcv-part-0001", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 40 }] }, owner);
    await expect(
      purchases.receive(po.id, { receiptId: "rcv-over-0002", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 20 }] }, owner),
    ).rejects.toThrow(/exceeds the outstanding 10/);
    // nothing leaked: stock unchanged since the first receipt, no new receipt, status intact
    expect(await stockOf("AN-HNY-001-250G")).toBe(before + 40);
    const fresh = await purchases.get(po.id);
    expect(fresh.receipts).toHaveLength(1);
    expect(fresh.status).toBe("partially_received");
  });

  it("invalid quantities never reach the service (schema gate) and unknown SKUs are refused", async () => {
    const sup = (await suppliers.list())[0];
    const po = await purchases.upsert(draftDto(sup.id));
    expect(purchaseReceiveSchema.safeParse({ receiptId: "rcv-x", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 0 }] }).success).toBe(false);
    expect(purchaseReceiveSchema.safeParse({ receiptId: "rcv-x", receipts: [{ variantSku: "AN-HNY-001-250G", qty: -3 }] }).success).toBe(false);
    expect(purchaseReceiveSchema.safeParse({ receiptId: "rcv-x", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 2.5 }] }).success).toBe(false);
    await expect(
      purchases.receive(po.id, { receiptId: "rcv-unknown-01", receipts: [{ variantSku: "AN-NOT-REAL", qty: 1 }] }, owner),
    ).rejects.toThrow(/Purchase does not include/);
  });

  it("drafts, cancelled and fully received purchases cannot be received", async () => {
    const sup = (await suppliers.list())[0];
    const draft = await purchases.upsert({ ...draftDto(sup.id), status: "draft" });
    await expect(purchases.receive(draft.id, { receiptId: "rcv-draft-001", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 5 }] }, owner)).rejects.toThrow(
      /Confirm the purchase order/,
    );
    const po = await purchases.upsert(draftDto(sup.id));
    await purchases.cancel(po.id, "Crop failed", owner);
    await expect(purchases.receive(po.id, { receiptId: "rcv-cxl-0001", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 5 }] }, owner)).rejects.toThrow(
      /cancelled/,
    );
    const done = await purchases.upsert(draftDto(sup.id));
    await purchases.receive(done.id, { receiptId: "rcv-all-0001", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 50 }] }, owner);
    await expect(purchases.receive(done.id, { receiptId: "rcv-more-002", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 1 }] }, owner)).rejects.toThrow(
      /already fully received/,
    );
  });
});

describe("payments & settlement", () => {
  it("records payments and derives the settlement state (never from receiving)", async () => {
    const sup = (await suppliers.list())[0];
    const po = await purchases.upsert(draftDto(sup.id)); // total 50×24500=1,225,000 +5% = 1,286,250
    expect(po.totalPaise).toBe(1_286_250);
    expect(po.paymentStatus).toBe("unpaid");
    const half = await purchases.recordPayment(po.id, { amountPaise: 643_125, method: "bank_transfer", reference: "UTR-111" }, owner);
    expect(half.paymentStatus).toBe("partially_paid");
    expect(half.paidPaise).toBe(643_125);
    const full = await purchases.recordPayment(po.id, { amountPaise: 643_125, method: "upi" }, owner);
    expect(full.paymentStatus).toBe("paid");
    expect(full.payments).toHaveLength(2);
    // receiving goods does not change settlement
    await purchases.receive(po.id, { receiptId: "rcv-pay-0001", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 50 }] }, owner);
    const final = await purchases.get(po.id);
    expect(final.status).toBe("received");
    expect(final.paymentStatus).toBe("paid");
    expect(final.paidPaise).toBe(1_286_250);
  });

  it("refuses overpayment and payments on drafts/cancelled purchases", async () => {
    const sup = (await suppliers.list())[0];
    const po = await purchases.upsert(draftDto(sup.id));
    await expect(purchases.recordPayment(po.id, { amountPaise: po.totalPaise! + 1, method: "cash" }, owner)).rejects.toThrow(/exceeds the outstanding/);
    const draft = await purchases.upsert({ ...draftDto(sup.id), status: "draft" });
    await expect(purchases.recordPayment(draft.id, { amountPaise: 100, method: "cash" }, owner)).rejects.toThrow(/confirmed purchase/);
    await purchases.cancel(po.id, "Supplier withdrew", owner);
    await expect(purchases.recordPayment(po.id, { amountPaise: 100, method: "cash" }, owner)).rejects.toThrow(/cancelled/);
  });
});

describe("cancellation & history", () => {
  it("cancelling preserves receipts, payments and received stock", async () => {
    const sup = (await suppliers.list())[0];
    const before = await stockOf("AN-HNY-001-250G");
    const po = await purchases.upsert(draftDto(sup.id));
    await purchases.receive(po.id, { receiptId: "rcv-keep-0001", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 40 }] }, owner);
    await purchases.recordPayment(po.id, { amountPaise: 100_000, method: "cash" }, owner);
    const cancelled = await purchases.cancel(po.id, "Crop failed due to drought", owner);
    expect(cancelled.status).toBe("cancelled");
    expect(cancelled.cancelReason).toBe("Crop failed due to drought");
    expect(cancelled.receipts).toHaveLength(1); // history intact
    expect(cancelled.payments).toHaveLength(1);
    expect(await stockOf("AN-HNY-001-250G")).toBe(before + 40); // received stock NOT rolled back
    const fresh = await purchases.get(po.id);
    expect(fresh.items[0].qtyReceived).toBe(40);
    await expect(purchases.cancel(po.id, "again", owner)).resolves.toBeDefined(); // idempotent
  });

  it("a fully received purchase cannot be cancelled and short reasons are rejected", async () => {
    const sup = (await suppliers.list())[0];
    const po = await purchases.upsert(draftDto(sup.id));
    await purchases.receive(po.id, { receiptId: "rcv-full-0001", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 50 }] }, owner);
    await expect(purchases.cancel(po.id, undefined, owner)).rejects.toThrow(/cannot be cancelled/);
    const other = await purchases.upsert(draftDto(sup.id));
    await expect(purchases.cancel(other.id, "no", owner)).rejects.toThrow(/at least 3 characters/);
  });
});

describe("purchases ledger", () => {
  async function seedScenario() {
    const sup = (await suppliers.list())[0];
    const older = await purchases.upsert({ ...draftDto(sup.id), status: "ordered", items: [{ ...draftDto(sup.id).items[0], qtyOrdered: 50, unitCostPaise: 24500, taxPercent: 0 }] });
    await purchases.receive(older.id, { receiptId: "rcv-led-0001", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 40 }] }, owner);
    await new Promise((r) => setTimeout(r, 3));
    const paid = await purchases.upsert({
      supplierId: sup.id,
      status: "ordered",
      reference: "PO-LED-PAID",
      items: [{ variantSku: "AN-HNY-001-250G", description: "Paid PO", qtyOrdered: 10, unitCostPaise: 24000, unit: "unit", discountPaise: 0, taxPercent: 0 }],
    });
    await purchases.receive(paid.id, { receiptId: "rcv-led-0002", receipts: [{ variantSku: "AN-HNY-001-250G", qty: 10 }] }, owner);
    await purchases.recordPayment(paid.id, { amountPaise: paid.totalPaise!, method: "cash" }, owner);
    await new Promise((r) => setTimeout(r, 3));
    const draft = await purchases.upsert({ ...draftDto(sup.id), status: "draft", expectedDeliveryDate: Date.now() + 86_400_000 });
    return { sup, older, paid, draft };
  }

  it("computes summary metrics over the filtered scope with the right priority pick", async () => {
    const { sup } = await seedScenario();
    const page = await purchases.ledger({ status: "all", paymentStatus: "all", sort: "recent_first", page: 1, pageSize: 20 });
    expect(page.total).toBe(3);
    expect(page.summary.totalPurchases).toBe(3);
    expect(page.summary.pendingDeliveries).toBe(1);
    expect(page.summary.partiallyReceivedCount).toBe(1);
    expect(page.summary.goodsReceived).toBe(1);
    expect(page.summary.draftCount).toBe(1);
    // spend = order totals: 50×24500 (0% tax) + 10×24000 = 1,225,000 + 240,000
    expect(page.summary.spendPaise).toBe(1_225_000 + 240_000);
    expect(page.summary.paidPaise).toBe(240_000);
    expect(page.summary.outstandingPaise).toBe(1_225_000);
    // priority: the only pending consignment
    expect(page.summary.priority?.reference).toBe(page.items.find((r) => r.status === "partially_received")?.reference);
    expect(page.summary.priority?.outstandingUnits).toBe(10);
    expect(page.summary.priority?.partiallyReceived).toBe(true);
    // rows carry the supplier join
    const row = page.items[0];
    expect(row.supplierName).toBe(sup.name);
    expect(row.supplierStatus).toBe(sup.status ?? "active");
  });

  it("filters by status, payment status, supplier and date range; search hits refs, suppliers and SKUs", async () => {
    const { sup, older, paid, draft } = await seedScenario();
    const base = { sort: "recent_first" as const, page: 1, pageSize: 20 };
    const receivedOnly = await purchases.ledger({ ...base, status: "received", paymentStatus: "all" });
    expect(receivedOnly.items.map((r) => r.id)).toEqual([paid.id]);
    const unpaidOnly = await purchases.ledger({ ...base, status: "all", paymentStatus: "unpaid" });
    expect(unpaidOnly.total).toBe(2);
    expect(unpaidOnly.items.every((r) => r.paymentStatus === "unpaid")).toBe(true);
    const partialOnly = await purchases.ledger({ ...base, status: "partially_received", paymentStatus: "all" });
    expect(partialOnly.items.map((r) => r.id)).toEqual([older.id]);
    const bySupplier = await purchases.ledger({ ...base, status: "all", paymentStatus: "all", supplierId: sup.id });
    expect(bySupplier.total).toBe(3);
    const bySearch = await purchases.ledger({ ...base, status: "all", paymentStatus: "all", search: "PO-LED-PAID" });
    expect(bySearch.items.map((r) => r.id)).toEqual([paid.id]);
    const bySku = await purchases.ledger({ ...base, status: "all", paymentStatus: "all", search: "AN-HNY-001-250G" });
    expect(bySku.total).toBe(3);
    const todayStart = Math.floor((draft.purchaseDate ?? Date.now()) / 86_400_000) * 86_400_000;
    const byDate = await purchases.ledger({ ...base, status: "all", paymentStatus: "all", dateFrom: todayStart, dateTo: todayStart + 86_400_000 });
    expect(byDate.total).toBe(3);
  });

  it("sorts by recency and value and paginates", async () => {
    const { older, draft } = await seedScenario();
    const base = { status: "all" as const, paymentStatus: "all" as const, page: 1, pageSize: 20 };
    const recent = await purchases.ledger({ ...base, sort: "recent_first" });
    expect(recent.items[0].id).toBe(draft.id); // newest first
    const oldest = await purchases.ledger({ ...base, sort: "oldest_first" });
    expect(oldest.items[0].id).toBe(older.id);
    const byValue = await purchases.ledger({ ...base, sort: "value_desc" });
    expect(byValue.items[0].id).toBe(draft.id); // 1,286,250 > 1,225,000 > 240,000
    const tiny = await purchases.ledger({ ...base, sort: "recent_first", pageSize: 1, page: 2 });
    expect(tiny.items).toHaveLength(1);
    expect(tiny.totalPages).toBe(3);
  });

  it("renders legacy documents (no totals/receipts) with documented fallbacks", async () => {
    const sup = (await suppliers.list())[0];
    const now = Date.now();
    await db.set<Partial<PurchaseDoc> & { id: string }>(COLLECTIONS.purchases, "pur_legacy", {
      id: "pur_legacy",
      supplierId: sup.id,
      reference: "PO-LEGACY-1",
      status: "received",
      items: [{ variantSku: "AN-HNY-001-250G", description: "", qtyOrdered: 100, qtyReceived: 100, unitCostPaise: 20000 }],
      createdAt: now,
      updatedAt: now,
      isDemo: false,
    });
    const page = await purchases.ledger({ status: "all", paymentStatus: "all", sort: "recent_first", page: 1, pageSize: 20 });
    const row = page.items.find((r) => r.id === "pur_legacy");
    expect(row).toBeDefined();
    expect(row!.totalPaise).toBe(2_000_000); // items math fallback
    expect(row!.paymentStatus).toBe("unpaid"); // no payment records → honestly unpaid
    expect(row!.receivedUnits).toBe(100);
  });
});

describe("HTTP schema gate", () => {
  it("only accepts draft/ordered statuses and strips client-side received counters", () => {
    expect(purchaseUpsertSchema.safeParse({ supplierId: "sup_x", status: "received", items: [] }).success).toBe(false);
    const parsed = purchaseUpsertSchema.parse({
      supplierId: "sup_x",
      status: "draft",
      items: [{ variantSku: "AN-HNY-001-250G", qtyOrdered: 5, unitCostPaise: 100, qtyReceived: 999, unit: "unit" }],
    });
    expect(parsed.items[0]).not.toHaveProperty("qtyReceived");
    expect(parsed.items[0].taxPercent).toBe(0);
    expect(parsed.items[0].discountPaise).toBe(0);
  });

  it("rejects an expected delivery before the purchase date", () => {
    const ok = purchaseUpsertSchema.safeParse({
      supplierId: "sup_x",
      purchaseDate: 1_700_000_000_000,
      expectedDeliveryDate: 1_700_000_000_000,
      items: [{ variantSku: "AN-HNY-001-250G", qtyOrdered: 1, unitCostPaise: 100 }],
    });
    expect(ok.success).toBe(true);
    const bad = purchaseUpsertSchema.safeParse({
      supplierId: "sup_x",
      purchaseDate: 1_700_000_000_000,
      expectedDeliveryDate: 1_699_999_999_999,
      items: [{ variantSku: "AN-HNY-001-250G", qtyOrdered: 1, unitCostPaise: 100 }],
    });
    expect(bad.success).toBe(false);
  });
});
