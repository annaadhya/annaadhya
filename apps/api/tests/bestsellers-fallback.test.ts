/**
 * Bestsellers shelf fallback tests — admin-ranked products lead in rank order;
 * whenever fewer than the limit carry a rank the tail is padded with random
 * published products, so the storefront favourites shelf never renders empty
 * while the catalogue has anything sellable (owner request 2026-11-11:
 * "if there are not any best selling, still show any random 4 products").
 * Runs the service directly against the in-memory provider (prod code paths).
 */
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryDataClient } from "@annaadhya/data-core";
import {
  COLLECTIONS,
  type CategoryDoc,
  type ProductDoc,
  type ProductVariantDoc,
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

async function seedProduct(over: Partial<ProductDoc> & { id: string; sku: string; slug: string; name: string }): Promise<ProductDoc> {
  const p = mkProduct(over);
  await db.set(COLLECTIONS.products, p.id, p);
  await db.set(
    COLLECTIONS.productVariants,
    `var_${p.id}`,
    mkVariant({ id: `var_${p.id}`, sku: `${over.sku}-250G`, productId: p.id }),
  );
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

describe("bestsellers shelf fallback", () => {
  it("returns the only sellable product when nothing is ranked (1-product store)", async () => {
    await seedProduct({ id: "prod_witch", sku: "AN-WH-001", slug: "witch-honey", name: "Witch Honey" });
    const rows = await catalogue.bestsellers(4);
    expect(rows).toHaveLength(1);
    expect(rows[0].name).toBe("Witch Honey");
    expect(rows[0].variants.length).toBe(1);
  });

  it("leads with ranked products in rank order, then pads random unranked products", async () => {
    await seedProduct({ id: "prod_a", sku: "AN-A-001", slug: "ranked-a", name: "Ranked A", bestsellerRank: 2 });
    await seedProduct({ id: "prod_b", sku: "AN-B-001", slug: "ranked-b", name: "Ranked B", bestsellerRank: 1 });
    await seedProduct({ id: "prod_c", sku: "AN-C-001", slug: "filler-c", name: "Filler C" });
    const rows = await catalogue.bestsellers(4);
    expect(rows.map((r) => r.name).slice(0, 2)).toEqual(["Ranked B", "Ranked A"]);
    expect(rows).toHaveLength(3);
    expect(rows.map((r) => r.name)).toContain("Filler C");
  });

  it("caps at the limit and never pads with draft or variant-less products", async () => {
    await seedProduct({ id: "prod_a", sku: "AN-A-001", slug: "ranked-a", name: "Ranked A", bestsellerRank: 1 });
    await seedProduct({ id: "prod_d", sku: "AN-D-001", slug: "draft-d", name: "Draft D", status: "draft" });
    const p = await seedProduct({ id: "prod_e", sku: "AN-E-001", slug: "bare-e", name: "Bare E" });
    await db.delete(COLLECTIONS.productVariants, `var_${p.id}`);
    const rows = await catalogue.bestsellers(4);
    expect(rows).toHaveLength(1);
    expect(rows.map((r) => r.name)).toEqual(["Ranked A"]);
  });

  it("returns exactly the limit when the catalogue can fill it with ranked products", async () => {
    for (let i = 1; i <= 5; i += 1) {
      await seedProduct({
        id: `prod_r${i}`,
        sku: `AN-R${i}-001`,
        slug: `ranked-${i}`,
        name: `Ranked ${i}`,
        bestsellerRank: i,
      });
    }
    const rows = await catalogue.bestsellers(4);
    expect(rows).toHaveLength(4);
    expect(rows.map((r) => r.bestsellerRank)).toEqual([1, 2, 3, 4]);
  });
});
