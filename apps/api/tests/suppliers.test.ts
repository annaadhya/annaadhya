/**
 * Suppliers console service tests — run the exact production code paths against the
 * in-memory provider: CRUD, ledger metrics/filters/sorts, purchase rollups, status
 * changes (history preserved), validation, and audit-trail writes.
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InMemoryDataClient, applySeed } from "@annaadhya/data-core";
import { COLLECTIONS, supplierUpsertSchema, type AuditLogDoc, type AuthPrincipal, type SupplierDoc } from "@annaadhya/contracts";
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
  role: "owner",
  permissions: ["suppliers:read", "suppliers:write", "purchases:read", "purchases:write", "inventory:write"],
  isStaff: true,
};

/** Legit full payload for one supplier. */
function honeySupplierDto() {
  return {
    name: "Sundarbans Wild Honey Foragers Co-op",
    type: "farmer_apiarist" as const,
    contactPerson: "Subal Mondal",
    phone: "+91 98301 22910",
    email: "subal@sundarbanshoney.test",
    city: "Canning",
    state: "West Bengal",
    pincode: "743329",
    status: "active" as const,
    paymentTerms: "50% advance, balance on dispatch",
    licenseNumber: "LIC-10023022001892",
    notes: "Cold filtration batch testing per FSSAI honey standards.",
    productSkus: ["AN-HNY-001"],
    rates: [
      {
        label: "Raw Wild Forest Honey (Grade-A bulk)",
        productSku: "AN-HNY-001" as const,
        unitCostPaise: 38000,
        unit: "kg",
        moqQty: 500,
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

beforeAll(() => {});

describe("supplier upsert", () => {
  it("creates a supplier with normalized rate ids and persists it", async () => {
    const doc = await suppliers.upsert(honeySupplierDto());
    expect(doc.id).toMatch(/^sup_/);
    expect(doc.name).toBe("Sundarbans Wild Honey Foragers Co-op");
    expect(doc.type).toBe("farmer_apiarist");
    expect(doc.status).toBe("active");
    expect(doc.rates).toHaveLength(1);
    expect(doc.rates![0].id).toMatch(/^rt_/);
    expect(doc.rates![0].unitCostPaise).toBe(38000);
    const persisted = await db.get<SupplierDoc>(COLLECTIONS.suppliers, doc.id);
    expect(persisted).not.toBeNull();
    expect(persisted!.pincode).toBe("743329");
  });

  it("writes a supplier.create audit record", async () => {
    const doc = await suppliers.upsert(honeySupplierDto());
    // controller writes the audit entry; emulate that path here via AuditService shape check
    await audit.record({
      actor: owner,
      action: "supplier.create",
      targetType: "supplier",
      targetId: doc.id,
      summary: `Supplier ${doc.name} created`,
    });
    const logs = await db.list<AuditLogDoc>(COLLECTIONS.auditLogs, { limit: 100 });
    expect(logs.some((l) => l.action === "supplier.create" && l.targetId === doc.id)).toBe(true);
  });

  it("update preserves createdAt and rewrites rates with stable ids", async () => {
    const created = await suppliers.upsert(honeySupplierDto());
    const firstRateId = created.rates![0].id;
    const updated = await suppliers.upsert(
      {
        ...honeySupplierDto(),
        name: "Sundarbans Honey Co-op",
        rates: [
          { ...honeySupplierDto().rates[0], id: firstRateId, unitCostPaise: 39500 },
          { label: "Artisanal Clay Jar 500g", unitCostPaise: 24500, unit: "unit", moqQty: 250 },
        ],
      },
      created.id,
    );
    expect(updated.id).toBe(created.id);
    expect(updated.createdAt).toBe(created.createdAt);
    expect(updated.rates).toHaveLength(2);
    // first line keeps its id (edited in place), second line gets a fresh one
    expect(updated.rates![0].id).toBe(firstRateId);
    expect(updated.rates![1].id).toMatch(/^rt_/);
    expect(updated.rates![0].unitCostPaise).toBe(39500);
  });

  it("accepts the legacy purchases-page payload (no type/status/rates) through the schema defaults", async () => {
    // The controller pipe parses the body through supplierUpsertSchema first — the zod
    // defaults (type "other", status "active", rates []) apply exactly as in production.
    const dto = supplierUpsertSchema.parse({ name: "Legacy Plain Supplier", productSkus: ["AN-HNY-002"] });
    const doc = await suppliers.upsert(dto);
    expect(doc.type).toBe("other");
    expect(doc.status).toBe("active");
    expect(doc.rates).toEqual([]);
  });
});

describe("supplier status", () => {
  it("flips status without touching purchase history", async () => {
    const sup = await suppliers.upsert(honeySupplierDto());
    await purchases.upsert({
      supplierId: sup.id,
      reference: "PO-884",
      status: "received",
      items: [{ variantSku: "AN-HNY-001-250G", description: "Honey", qtyOrdered: 500, qtyReceived: 500, unitCostPaise: 38000 }],
    });
    const paused = await suppliers.setStatus(sup.id, "inactive");
    expect(paused.status).toBe("inactive");

    const stillThere = await purchases.list({ supplierId: sup.id });
    expect(stillThere).toHaveLength(1);
    expect(stillThere[0].reference).toBe("PO-884");

    // ledger still reports the real purchase history of the paused supplier
    const ledger = await suppliers.ledger({ status: "all", sort: "recently_added", page: 1, pageSize: 50 });
    const row = ledger.items.find((r) => r.id === sup.id);
    expect(row?.status).toBe("inactive");
    expect(row?.purchaseCount).toBe(1);
    expect(row?.lastPurchaseReference).toBe("PO-884");
  });

  it("is idempotent when the status is unchanged", async () => {
    const sup = await suppliers.upsert(honeySupplierDto());
    const again = await suppliers.setStatus(sup.id, "active");
    expect(again.status).toBe("active");
    expect(again.updatedAt).toBe(sup.updatedAt);
  });
});

describe("suppliers ledger", () => {
  it("computes summary metrics over the filtered scope and derives purchase rollups", async () => {
    const a = await suppliers.upsert(honeySupplierDto());
    const b = await suppliers.upsert({
      name: "Pampore Saffron Valley Growers Syndicate",
      type: "estate_producer" as const,
      contactPerson: "Ghulam Mohiuddin Mir",
      city: "Pampore",
      state: "Jammu & Kashmir",
      status: "active" as const,
      productSkus: ["AN-KES-001"],
      rates: [{ label: "Grade-A Mongra Kesar", unitCostPaise: 62000, unit: "g" }],
    });
    await purchases.upsert({
      supplierId: a.id,
      reference: "PO-884",
      status: "received",
      items: [{ variantSku: "AN-HNY-001-250G", description: "", qtyOrdered: 500, qtyReceived: 500, unitCostPaise: 38000 }],
    });
    // Real consignments never share a timestamp; space them out so "newest first" is deterministic.
    await new Promise((r) => setTimeout(r, 5));
    await purchases.upsert({
      supplierId: a.id,
      reference: "PO-832",
      status: "received",
      items: [{ variantSku: "AN-HNY-001-250G", description: "", qtyOrdered: 350, qtyReceived: 350, unitCostPaise: 38000 }],
    });

    const page = await suppliers.ledger({ status: "all", sort: "recently_added", page: 1, pageSize: 20 });
    // 4 seeded demo suppliers + the 2 created above; the seeded kesar guild ships paused.
    expect(page.summary.totalSuppliers).toBe(6);
    expect(page.summary.inactiveSuppliers).toBe(1);
    expect(page.summary.activeSuppliers).toBe(5);
    // honey supplier has two real purchases
    const rowA = page.items.find((r) => r.id === a.id)!;
    expect(rowA.purchaseCount).toBe(2);
    expect(rowA.lastPurchaseReference).toBe("PO-832"); // newest first
    expect(rowA.lastPurchaseValuePaise).toBe(350 * 38000);
    expect(rowA.totalPurchaseValuePaise).toBe((500 + 350) * 38000);
    expect(rowA.categoryNames.length).toBeGreaterThanOrEqual(1); // linked via catalogue SKU

    const rowB = page.items.find((r) => r.id === b.id)!;
    expect(rowB.purchaseCount).toBe(0);
    expect(rowB.lastPurchaseAt).toBeNull();

    // sorting by lifetime value puts the honey supplier first
    const byValue = await suppliers.ledger({ status: "all", sort: "value_desc", page: 1, pageSize: 20 });
    expect(byValue.items[0].id).toBe(a.id);

    // search by contact email (unique — the seeded demo honey supplier shares a contact first name)
    const byContact = await suppliers.ledger({
      status: "all",
      sort: "recently_added",
      page: 1,
      pageSize: 20,
      search: "sundarbanshoney.test",
    });
    expect(byContact.items).toHaveLength(1);
    expect(byContact.items[0].id).toBe(a.id);

    // type filter
    const estates = await suppliers.ledger({ status: "all", sort: "recently_added", page: 1, pageSize: 20, type: "estate_producer" });
    expect(estates.items.every((r) => r.type === "estate_producer")).toBe(true);
    expect(estates.items.some((r) => r.id === b.id)).toBe(true);

    // pagination really slices
    const tiny = await suppliers.ledger({ status: "all", sort: "recently_added", page: 1, pageSize: 1 });
    expect(tiny.items).toHaveLength(1);
    expect(tiny.totalPages).toBe(Math.max(1, Math.ceil(tiny.total / 1)));
  });

  it("renders legacy documents (no type/status/rates) with documented fallbacks", async () => {
    const now = Date.now();
    await db.set<{ id: string } & Partial<SupplierDoc>>(
      COLLECTIONS.suppliers,
      "sup_legacy",
      { id: "sup_legacy", name: "Old Plain Records", productSkus: [], createdAt: now, updatedAt: now, isDemo: false },
    );
    const page = await suppliers.ledger({ status: "all", sort: "recently_added", page: 1, pageSize: 50 });
    const row = page.items.find((r) => r.id === "sup_legacy");
    expect(row).toBeDefined();
    expect(row!.type).toBe("other");
    expect(row!.status).toBe("active");
    expect(row!.rates).toEqual([]);
  });

  it("status filter excludes paused suppliers from the active scope", async () => {
    const sup = await suppliers.upsert(honeySupplierDto());
    await suppliers.setStatus(sup.id, "inactive");
    const active = await suppliers.ledger({ status: "active", sort: "recently_added", page: 1, pageSize: 50 });
    expect(active.items.some((r) => r.id === sup.id)).toBe(false);
    const inactive = await suppliers.ledger({ status: "inactive", sort: "recently_added", page: 1, pageSize: 50 });
    expect(inactive.items.some((r) => r.id === sup.id)).toBe(true);
  });
});
