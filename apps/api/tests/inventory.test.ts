/**
 * Inventory console tests — ledger listing/summary scope, guided stock adjustments
 * (add / remove / set exact) with concurrency-safe semantics, and bulk thresholds.
 * Runs services directly against the in-memory provider (same code paths as prod).
 */
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InMemoryDataClient } from "@annaadhya/data-core";
import {
  COLLECTIONS,
  type AuthPrincipal,
  type CategoryDoc,
  type InventoryLedgerQueryDto,
  type InventoryMovementDoc,
  type ProductDoc,
  type ProductVariantDoc,
} from "@annaadhya/contracts";
import { InventoryService } from "../src/modules/inventory/inventory.service";

process.env.NODE_ENV = "test";

let db: InMemoryDataClient;
let inventory: InventoryService;

const owner: AuthPrincipal = {
  uid: "test-owner",
  email: "owner@test.dev",
  displayName: "Test Owner",
  provider: "dev",
  role: "owner",
  permissions: ["inventory:read", "inventory:write"],
  isStaff: true,
};

const NOW = 1_760_000_000_000;

let honeyProduct: ProductDoc;
let jamProduct: ProductDoc;
let honey250: ProductVariantDoc;
let honey500: ProductVariantDoc;
let jam250: ProductVariantDoc;

async function seedFixture(): Promise<void> {
  const category: CategoryDoc = {
    id: "cat_honey",
    slug: "honey",
    name: "Honey",
    tagline: "",
    description: "",
    sortOrder: 1,
    isReady: true,
    status: "published",
    createdAt: NOW,
    updatedAt: NOW,
    isDemo: false,
  };
  await db.set(COLLECTIONS.categories, category.id, category);

  honeyProduct = {
    id: "prod_honey",
    sku: "AN-HNY-001",
    slug: "wild-honey",
    name: "Raw Wild Forest Honey",
    subtitle: "",
    description: "Wild forest honey for inventory tests.",
    categoryId: category.id,
    typeLabel: "Wild forest honey",
    status: "published",
    images: [{ url: "/demo-images/wild-honey.svg", alt: "honey" }],
    giftItem: false,
    seo: {},
    createdAt: NOW,
    updatedAt: NOW,
    isDemo: false,
  };
  jamProduct = {
    ...honeyProduct,
    id: "prod_jam",
    sku: "AN-JAM-001",
    slug: "fruit-jam",
    name: "Hill Berry Jam",
    categoryId: "cat_other",
  };
  await db.set(COLLECTIONS.products, honeyProduct.id, honeyProduct);
  await db.set(COLLECTIONS.products, jamProduct.id, jamProduct);

  const mkVariant = (over: Partial<ProductVariantDoc> & { id: string; sku: string }): ProductVariantDoc => ({
    productId: honeyProduct.id,
    packLabel: "250 g",
    grams: 250,
    pricePaise: 49_900,
    status: "published",
    stockOnHand: 0,
    reservedQty: 0,
    lowStockThreshold: 5,
    createdAt: NOW,
    updatedAt: NOW,
    isDemo: false,
    ...over,
  });
  honey250 = mkVariant({ id: "var_honey_250", sku: "AN-HNY-001-250G", stockOnHand: 100 });
  honey500 = mkVariant({ id: "var_honey_500", sku: "AN-HNY-001-500G", packLabel: "500 g", grams: 500, stockOnHand: 8, lowStockThreshold: 10 });
  jam250 = mkVariant({
    id: "var_jam_250",
    sku: "AN-JAM-001-250G",
    productId: jamProduct.id,
    stockOnHand: 0,
    status: "draft",
  });
  await db.set(COLLECTIONS.productVariants, honey250.id, honey250);
  await db.set(COLLECTIONS.productVariants, honey500.id, honey500);
  await db.set(COLLECTIONS.productVariants, jam250.id, jam250);
}

function ledgerQuery(over: Partial<InventoryLedgerQueryDto> = {}): InventoryLedgerQueryDto {
  return { stockStatus: "all", sort: "name_asc", page: 1, pageSize: 20, ...over };
}

beforeAll(async () => {
  db = new InMemoryDataClient({ nodeEnv: "test" });
  inventory = new InventoryService(db);
});

beforeEach(async () => {
  db.clear();
  await seedFixture();
});

describe("inventory ledger", () => {
  it("joins product, category and image data and derives stock status", async () => {
    const page = await inventory.ledger(ledgerQuery());
    expect(page.total).toBe(3); // draft jam variant included, archived excluded (none here)
    const honey500Row = page.items.find((r) => r.sku === "AN-HNY-001-500G");
    expect(honey500Row).toBeDefined();
    expect(honey500Row!.productName).toBe("Raw Wild Forest Honey");
    expect(honey500Row!.categoryName).toBe("Honey");
    expect(honey500Row!.productImage).toBe("/demo-images/wild-honey.svg");
    expect(honey500Row!.stockStatus).toBe("low_stock"); // 8 available <= threshold 10
    expect(honey500Row!.available).toBe(8);

    const jamRow = page.items.find((r) => r.sku === "AN-JAM-001-250G");
    expect(jamRow!.stockStatus).toBe("out_of_stock");
    expect(jamRow!.variantStatus).toBe("draft");
  });

  it("computes summary over the same filtered scope as the rows", async () => {
    const all = await inventory.ledger(ledgerQuery());
    expect(all.summary.totalVariants).toBe(3);
    expect(all.summary.totalProducts).toBe(2);
    expect(all.summary.lowStock).toBe(1);
    expect(all.summary.outOfStock).toBe(1);
    expect(all.summary.totalStockOnHand).toBe(108);
    // retail value: 100×49900 + 8×49900 + 0×49900
    expect(all.summary.retailValuePaise).toBe(108 * 49_900);

    const honeyOnly = await inventory.ledger(ledgerQuery({ categoryId: "cat_honey" }));
    expect(honeyOnly.summary.totalVariants).toBe(2);
    expect(honeyOnly.summary.totalStockOnHand).toBe(108);
    expect(honeyOnly.summary.totalProducts).toBe(1);
  });

  it("searches by product name, sku and pack label", async () => {
    const bySku = await inventory.ledger(ledgerQuery({ search: "AN-HNY-001-500" }));
    expect(bySku.items.map((r) => r.sku)).toEqual(["AN-HNY-001-500G"]);

    const byName = await inventory.ledger(ledgerQuery({ search: "wild forest" }));
    expect(bySku.total).toBe(1);
    expect(byName.total).toBe(2);

    const byPack = await inventory.ledger(ledgerQuery({ search: "500 g" }));
    expect(byPack.items.map((r) => r.sku)).toEqual(["AN-HNY-001-500G"]);
  });

  it("filters by stock status and sorts by available stock", async () => {
    const low = await inventory.ledger(ledgerQuery({ stockStatus: "low_stock" }));
    expect(low.items.map((r) => r.sku)).toEqual(["AN-HNY-001-500G"]);

    const out = await inventory.ledger(ledgerQuery({ stockStatus: "out_of_stock" }));
    expect(out.total).toBe(1);

    const asc = await inventory.ledger(ledgerQuery({ sort: "stock_asc" }));
    expect(asc.items.map((r) => r.available)).toEqual([0, 8, 100]);

    const desc = await inventory.ledger(ledgerQuery({ sort: "stock_desc" }));
    expect(desc.items.map((r) => r.available)).toEqual([100, 8, 0]);
  });

  it("paginates and reports totals", async () => {
    const page1 = await inventory.ledger(ledgerQuery({ pageSize: 2, page: 1 }));
    expect(page1.items).toHaveLength(2);
    expect(page1.total).toBe(3);
    expect(page1.totalPages).toBe(2);

    const page2 = await inventory.ledger(ledgerQuery({ pageSize: 2, page: 2 }));
    expect(page2.items).toHaveLength(1);
  });

  it("attaches the latest movement per variant", async () => {
    await inventory.adjust(
      { variantId: honey250.id, mode: "add", qty: 5, type: "received", reason: "New consignment receipt" },
      owner,
    );
    const page = await inventory.ledger(ledgerQuery());
    const row = page.items.find((r) => r.sku === "AN-HNY-001-250G")!;
    expect(row.lastMovement).not.toBeNull();
    expect(row.lastMovement!.type).toBe("received");
    expect(row.lastMovement!.byName).toBe("Test Owner");
  });
});

describe("stock adjustments", () => {
  it("adds stock and records the movement with a composed reason", async () => {
    const movement = await inventory.adjust(
      {
        variantId: honey250.id,
        mode: "add",
        qty: 6,
        type: "received",
        reason: "New consignment receipt",
        note: "Cold-chain verified",
        reference: "PO-PMP-001",
      },
      owner,
    );
    expect(movement.qtyDelta).toBe(6);
    expect(movement.resultingStockOnHand).toBe(106);
    expect(movement.reason).toBe("New consignment receipt — Cold-chain verified");
    expect(movement.referenceType).toBe("admin");
    expect(movement.referenceId).toBe("PO-PMP-001");

    const stored = await db.get<ProductVariantDoc>(COLLECTIONS.productVariants, honey250.id);
    expect(stored!.stockOnHand).toBe(106);
    expect(stored!.reservedQty).toBe(0);
  });

  it("removes stock only up to what is physically on hand", async () => {
    await expect(
      inventory.adjust({ variantId: honey250.id, mode: "remove", qty: 101, type: "damaged", reason: "Spoilage write-off" }, owner),
    ).rejects.toMatchObject({ code: "unprocessable" });

    const ok = await inventory.adjust(
      { variantId: honey250.id, mode: "remove", qty: 40, type: "damaged", reason: "Damaged in cellar" },
      owner,
    );
    expect(ok.qtyDelta).toBe(-40);
    expect(ok.resultingStockOnHand).toBe(60);
  });

  it("refuses to strand units reserved for paid orders", async () => {
    await db.update<ProductVariantDoc>(COLLECTIONS.productVariants, honey250.id, { reservedQty: 12 });
    // removing 95 of 100 leaves 5 < 12 reserved → must refuse
    await expect(
      inventory.adjust({ variantId: honey250.id, mode: "remove", qty: 95, type: "damaged", reason: "Flood damage" }, owner),
    ).rejects.toMatchObject({ code: "unprocessable" });
    // and nothing may have changed
    const v = await db.get<ProductVariantDoc>(COLLECTIONS.productVariants, honey250.id);
    expect(v!.stockOnHand).toBe(100);
    const movements = await db.list<InventoryMovementDoc>(COLLECTIONS.inventoryMovements);
    expect(movements).toHaveLength(0);
  });

  it("set exact quantity means the NEW total, validated against fresh state", async () => {
    const movement = await inventory.adjust(
      { variantId: honey250.id, mode: "set", qty: 24, type: "manual_adjustment", reason: "Physical count correction" },
      owner,
    );
    expect(movement.qtyDelta).toBe(-76); // 100 → 24
    expect(movement.resultingStockOnHand).toBe(24);

    // setting the same count is a friendly error, not a zero-delta ledger row
    await expect(
      inventory.adjust({ variantId: honey250.id, mode: "set", qty: 24, type: "manual_adjustment", reason: "Recount" }, owner),
    ).rejects.toMatchObject({ code: "bad_request" });

    // set to zero is allowed when nothing is reserved
    const toZero = await inventory.adjust(
      { variantId: honey250.id, mode: "set", qty: 0, type: "manual_adjustment", reason: "Full write-off" },
      owner,
    );
    expect(toZero.resultingStockOnHand).toBe(0);
  });

  it("rejects zero quantity for add/remove and type/mode mismatches", async () => {
    await expect(
      inventory.adjust({ variantId: honey250.id, mode: "add", qty: 0, type: "received", reason: "Nothing arrived" }, owner),
    ).rejects.toMatchObject({ code: "bad_request" });
    await expect(
      inventory.adjust({ variantId: honey250.id, mode: "remove", qty: 3, type: "received", reason: "Wrong direction" }, owner),
    ).rejects.toMatchObject({ code: "bad_request" });
    await expect(
      inventory.adjust({ variantId: honey250.id, mode: "add", qty: 3, type: "sold" as never, reason: "Faking a sale" }, owner),
    ).rejects.toMatchObject({ code: "bad_request" });
    await expect(
      inventory.adjust({ variantId: honey250.id, mode: "add", qty: 3, type: "received", reason: "x" }, owner),
    ).rejects.toMatchObject({ code: "bad_request" });
  });

  it("rejects archived variants and unknown variants", async () => {
    await db.update<ProductVariantDoc>(COLLECTIONS.productVariants, honey500.id, { status: "archived" });
    await expect(
      inventory.adjust({ variantId: honey500.id, mode: "add", qty: 1, type: "received", reason: "Late delivery" }, owner),
    ).rejects.toMatchObject({ code: "bad_request" });
    await expect(
      inventory.adjust({ variantId: "var_missing", mode: "add", qty: 1, type: "received", reason: "Ghost stock" }, owner),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});

describe("bulk threshold update", () => {
  it("updates thresholds and flips stock status on the next ledger read", async () => {
    const result = await inventory.updateThresholds({
      items: [
        { variantId: honey250.id, lowStockThreshold: 120 },
        { variantId: jam250.id, lowStockThreshold: 3 },
      ],
    });
    expect(result.updated).toBe(2);

    const v = await db.get<ProductVariantDoc>(COLLECTIONS.productVariants, honey250.id);
    expect(v!.lowStockThreshold).toBe(120);

    const page = await inventory.ledger(ledgerQuery({ stockStatus: "low_stock" }));
    expect(page.items.map((r) => r.sku).sort()).toEqual(["AN-HNY-001-250G", "AN-HNY-001-500G"]);
  });

  it("fails atomically when one variant is missing", async () => {
    await expect(
      inventory.updateThresholds(
        {
          items: [
            { variantId: honey250.id, lowStockThreshold: 9 },
            { variantId: "var_missing", lowStockThreshold: 9 },
          ],
        },
      ),
    ).rejects.toMatchObject({ code: "not_found" });
    const v = await db.get<ProductVariantDoc>(COLLECTIONS.productVariants, honey250.id);
    expect(v!.lowStockThreshold).toBe(5);
  });
});
