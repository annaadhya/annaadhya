/**
 * Product purge (hard delete) tests — DELETE /admin/catalogue/products/:id/purge is
 * the destructive sibling of archive: the product document and ALL of its variant
 * documents are erased from the catalogue entirely, while orders (self-contained
 * snapshots) and the inventory ledger stay untouched. The service must refuse with
 * a conflict while a checkout still holds an ACTIVE, unexpired stock reservation
 * for any of the product's variants — checkout commits by transactionally updating
 * the variant docs, so erasing them mid-checkout would break that order placement.
 * Runs the service directly against the in-memory provider (prod code paths).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryDataClient } from "@annaadhya/data-core";
import {
  COLLECTIONS,
  type CategoryDoc,
  type ProductDoc,
  type ProductVariantDoc,
  type StockReservationDoc,
} from "@annaadhya/contracts";
import { CatalogueService } from "../src/modules/catalogue/catalogue.service";

process.env.NODE_ENV = "test";

const NOW = 1_760_000_000_000;

let db: InMemoryDataClient;
let catalogue: CatalogueService;

function mkProduct(over: Partial<ProductDoc> & { id: string; sku: string; slug: string; name: string }): ProductDoc {
  return {
    subtitle: "",
    description: "",
    categoryId: "cat_honey",
    typeLabel: "",
    status: "published",
    images: [{ url: "/demo-images/witch-honey.svg", alt: "product" }],
    giftItem: false,
    seo: {},
    createdAt: NOW,
    updatedAt: NOW,
    isDemo: false,
    ...over,
  };
}

function mkVariant(over: Partial<ProductVariantDoc> & { id: string; sku: string; productId: string }): ProductVariantDoc {
  return {
    packLabel: "250 g",
    grams: 250,
    pricePaise: 49_900,
    status: "published",
    stockOnHand: 10,
    reservedQty: 0,
    lowStockThreshold: 5,
    createdAt: NOW,
    updatedAt: NOW,
    isDemo: false,
    ...over,
  };
}

function mkReservation(over: Partial<StockReservationDoc> & { id: string; variantId: string }): StockReservationDoc {
  return {
    orderId: "order_test",
    qty: 1,
    status: "active",
    expiresAt: Date.now() + 10 * 60 * 1000, // live by default
    createdAt: NOW,
    updatedAt: NOW,
    isDemo: false,
    ...over,
  };
}

async function seedProductWithVariants(
  over: Partial<ProductDoc> & { id: string; sku: string; slug: string; name: string },
  variantCount = 2,
): Promise<ProductDoc> {
  const p = mkProduct(over);
  await db.set(COLLECTIONS.products, p.id, p);
  for (let i = 1; i <= variantCount; i += 1) {
    await db.set(
      COLLECTIONS.productVariants,
      `var_${p.id}_${i}`,
      mkVariant({ id: `var_${p.id}_${i}`, sku: `${over.sku}-V${i}`, productId: p.id }),
    );
  }
  return p;
}

beforeEach(async () => {
  db = new InMemoryDataClient({ nodeEnv: "test" });
  catalogue = new CatalogueService(db);
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
});

describe("product purge (hard delete)", () => {
  it("erases the product and every one of its variant documents entirely", async () => {
    await seedProductWithVariants({ id: "prod_witch", sku: "AN-WH-001", slug: "witch-honey", name: "Witch Honey" });
    const result = await catalogue.deleteProduct("prod_witch");
    expect(result).toEqual({ deleted: true, variantsDeleted: 2 });
    expect(await db.get(COLLECTIONS.products, "prod_witch")).toBeNull();
    expect(await db.get(COLLECTIONS.productVariants, "var_prod_witch_1")).toBeNull();
    expect(await db.get(COLLECTIONS.productVariants, "var_prod_witch_2")).toBeNull();
  });

  it("404s when the product does not exist", async () => {
    await expect(catalogue.deleteProduct("prod_ghost")).rejects.toThrow(/not found/i);
  });

  it("refuses with a conflict while an active, unexpired checkout reservation holds a variant", async () => {
    await seedProductWithVariants({ id: "prod_witch", sku: "AN-WH-001", slug: "witch-honey", name: "Witch Honey" });
    await db.set(
      COLLECTIONS.stockReservations,
      "res_live",
      mkReservation({ id: "res_live", variantId: "var_prod_witch_1" }),
    );
    await expect(catalogue.deleteProduct("prod_witch")).rejects.toThrow(/reservation/i);
    // Nothing may be erased on a refused purge — the docs stay exactly as they were.
    expect(await db.get(COLLECTIONS.products, "prod_witch")).not.toBeNull();
    expect(await db.get(COLLECTIONS.productVariants, "var_prod_witch_1")).not.toBeNull();
  });

  it("ignores expired and released reservations — checkout no longer holds the product", async () => {
    await seedProductWithVariants({ id: "prod_witch", sku: "AN-WH-001", slug: "witch-honey", name: "Witch Honey" });
    await db.set(
      COLLECTIONS.stockReservations,
      "res_expired",
      mkReservation({ id: "res_expired", variantId: "var_prod_witch_1", expiresAt: Date.now() - 1_000 }),
    );
    await db.set(
      COLLECTIONS.stockReservations,
      "res_released",
      mkReservation({ id: "res_released", variantId: "var_prod_witch_2", status: "released" }),
    );
    const result = await catalogue.deleteProduct("prod_witch");
    expect(result).toEqual({ deleted: true, variantsDeleted: 2 });
    expect(await db.get(COLLECTIONS.products, "prod_witch")).toBeNull();
  });

  it("does not touch reservations belonging to OTHER products", async () => {
    await seedProductWithVariants({ id: "prod_witch", sku: "AN-WH-001", slug: "witch-honey", name: "Witch Honey" });
    await seedProductWithVariants({ id: "prod_other", sku: "AN-OT-001", slug: "other", name: "Other" });
    await db.set(
      COLLECTIONS.stockReservations,
      "res_other",
      mkReservation({ id: "res_other", variantId: "var_prod_other_1" }),
    );
    const result = await catalogue.deleteProduct("prod_witch");
    expect(result).toEqual({ deleted: true, variantsDeleted: 2 });
    expect(await db.get(COLLECTIONS.products, "prod_other")).not.toBeNull();
  });
});
