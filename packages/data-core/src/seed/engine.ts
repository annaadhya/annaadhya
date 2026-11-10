/**
 * Seed engine — validate, plan (dry-run), apply and reset the Annaadhya demo dataset.
 *
 * Safety rules enforced here:
 *  - every written record is `isDemo: true` + `seedBatch`
 *  - ids are deterministic (stableId) so re-running is idempotent
 *  - reset deletes ONLY documents with isDemo === true (optionally filtered by seedBatch)
 *  - the engine refuses to run when explicitly forbidden (see tools/seed-demo-data guard)
 */
import type { DataClient } from "../provider";
import { COLLECTIONS, type CategoryDoc, type CustomerDoc, type ProductDoc, type ProductVariantDoc, type SettingsDoc } from "@annaadhya/contracts";
import { slugify, stableId, toPaise } from "@annaadhya/utils";
import { DEMO_CATEGORIES, DEMO_PRODUCTS, DEMO_SUPPLIERS, variantSkuFor, type SeedProduct } from "./demo-catalogue";
import { buildDemoOrders, DEMO_CUSTOMERS, DEMO_ADMIN_OWNER } from "./demo-orders";

export const DEMO_SEED_BATCH = "demo-2026-10-19";

export interface SeedReport {
  ok: boolean;
  mode: "validate" | "dry-run" | "apply" | "reset";
  counts: Record<string, number>;
  errors: string[];
  warnings: string[];
}

/* --------------------------------- validation -------------------------------- */

export async function validateDataset(): Promise<SeedReport> {
  const errors: string[] = [];
  const warnings: string[] = [];

  const productSkus = new Set<string>();
  const variantSkus = new Set<string>();
  for (const p of DEMO_PRODUCTS) {
    if (productSkus.has(p.sku)) errors.push(`Duplicate product SKU: ${p.sku}`);
    productSkus.add(p.sku);
    if (!DEMO_CATEGORIES.some((c) => c.slug === p.categorySlug)) {
      errors.push(`${p.sku}: unknown category "${p.categorySlug}"`);
    }
    if (!p.description || p.description.length < 20) errors.push(`${p.sku}: description too short`);
    for (const v of p.packs) {
      const vs = variantSkuFor(p.sku, v.packLabel);
      if (variantSkus.has(vs)) errors.push(`Duplicate variant SKU: ${vs}`);
      variantSkus.add(vs);
      if (v.priceRupees <= 0) errors.push(`${vs}: demo price must be positive`);
      if (v.grams <= 0) errors.push(`${vs}: grams must be positive`);
    }
  }
  for (const c of DEMO_CATEGORIES) {
    const slug = slugify(c.slug);
    if (slug !== c.slug) errors.push(`Category slug not normalised: ${c.slug}`);
  }
  warnings.push(
    "All prices are DEMO placeholders from the planning workbook — not verified selling prices.",
    "Product names, descriptions and claims are DRAFT copy pending supplier verification.",
    "Supplier records are fictional demo entities.",
  );

  return {
    ok: errors.length === 0,
    mode: "validate",
    counts: {
      categories: DEMO_CATEGORIES.length,
      products: DEMO_PRODUCTS.length,
      variants: variantSkus.size,
      suppliers: DEMO_SUPPLIERS.length,
      customers: DEMO_CUSTOMERS.length,
      orders: 0, // filled at plan time
    },
    errors,
    warnings,
  };
}

/* ----------------------------------- plan ------------------------------------ */

function buildDocs(seedBatch: string) {
  const now = Date.now();
  const categories: CategoryDoc[] = DEMO_CATEGORIES.map((c) => ({
    id: stableId("cat", c.slug),
    slug: c.slug,
    name: c.name,
    tagline: c.tagline,
    description: c.description,
    sortOrder: c.sortOrder,
    isReady: c.isReady,
    status: "published",
    createdAt: now,
    updatedAt: now,
    isDemo: true,
    seedBatch,
  }));

  const categoryIdBySlug = new Map(categories.map((c) => [c.slug, c.id]));

  const products: ProductDoc[] = [];
  const variants: ProductVariantDoc[] = [];

  for (const p of DEMO_PRODUCTS) {
    const productId = stableId("prod", p.sku);
    products.push({
      id: productId,
      sku: p.sku,
      slug: slugify(p.name),
      name: p.name,
      subtitle: p.subtitle,
      description: p.description,
      categoryId: categoryIdBySlug.get(p.categorySlug)!,
      typeLabel: p.typeLabel,
      status: "published",
      images: [
        {
          url: `/demo-images/${slugify(p.name)}.svg`,
          alt: `${p.name} — demo placeholder image (replace with real product photography)`,
        },
      ],
      giftItem: p.giftItem ?? false,
      bestsellerRank: p.bestsellerRank,
      featuredRank: p.featuredRank,
      seo: {},
      createdAt: now,
      updatedAt: now,
      isDemo: true,
      seedBatch,
    });

    for (const v of p.packs) {
      const sku = variantSkuFor(p.sku, v.packLabel);
      variants.push({
        id: stableId("var", sku),
        productId,
        sku,
        packLabel: v.packLabel,
        grams: v.grams,
        pricePaise: toPaise(v.priceRupees),
        mrpPaise: undefined, // no invented MRP — added only when the business supplies it
        status: "published",
        stockOnHand: p.categorySlug === "kesar" ? 40 : p.categorySlug === "gift-boxes" ? 25 : 120, // small-batch strategy for kesar and curated hampers
        reservedQty: 0,
        lowStockThreshold: p.categorySlug === "kesar" ? 10 : p.categorySlug === "gift-boxes" ? 5 : 20,
        createdAt: now,
        updatedAt: now,
        isDemo: true,
        seedBatch,
      });
    }
  }

  return { categories, products, variants };
}

export async function planSeed(): Promise<SeedReport> {
  const base = await validateDataset();
  const { categories, products, variants } = buildDocs(DEMO_SEED_BATCH);
  const orders = buildDemoOrders(variants);
  return {
    ...base,
    mode: "dry-run",
    counts: {
      categories: categories.length,
      products: products.length,
      variants: variants.length,
      suppliers: DEMO_SUPPLIERS.length,
      customers: DEMO_CUSTOMERS.length,
      orders: orders.length,
      inventoryMovements: variants.length + orders.reduce((n, o) => n + o.items.length, 0),
      adminUsers: 1,
      settings: 1,
    },
  };
}

/* ----------------------------------- apply ------------------------------------ */

export async function applySeed(data: DataClient, seedBatch = DEMO_SEED_BATCH): Promise<SeedReport> {
  const validation = await validateDataset();
  if (!validation.ok) return { ...validation, mode: "apply" };

  const { categories, products, variants } = buildDocs(seedBatch);

  // Settings singleton (NOT demo-marked — it is live configuration).
  const existingSettings = await data.get<SettingsDoc>(COLLECTIONS.settings, "global");
  if (!existingSettings) {
    await data.set(COLLECTIONS.settings, "global", defaultSettings(), { isDemo: false });
  }

  await data.bulkSet(COLLECTIONS.categories, categories);
  await data.bulkSet(COLLECTIONS.products, products);
  await data.bulkSet(COLLECTIONS.productVariants, variants);

  // Suppliers (extended fields feed the Suppliers console; rates are fictional demo costs)
  await data.bulkSet(
    COLLECTIONS.suppliers,
    DEMO_SUPPLIERS.map((s) => ({
      id: stableId("sup", s.name),
      name: s.name,
      type: s.type,
      contactPerson: s.contactPerson,
      phone: s.phone,
      email: s.email,
      location: s.location,
      city: s.city,
      state: s.state,
      status: s.status,
      paymentTerms: s.paymentTerms,
      notes: s.notes,
      rates: (s.rates ?? []).map((r, idx) => ({ id: `${stableId("sup", s.name)}-rt${idx + 1}`, ...r })),
      productSkus: [...s.productSkus],
      isDemo: true,
      seedBatch,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    })),
  );

  // Customers
  const customers: CustomerDoc[] = DEMO_CUSTOMERS.map((c) => ({
    id: stableId("cust", c.uid),
    ...c,
    createdAt: Date.now(),
    updatedAt: Date.now(),
    isDemo: true,
    seedBatch,
  }));
  await data.bulkSet(COLLECTIONS.customers, customers);

  // Initial stock received movements (one per variant)
  const receivedMovements = variants.map((v) => ({
    id: stableId("mv", "received", v.sku),
    variantId: v.id,
    variantSku: v.sku,
    type: "received" as const,
    qtyDelta: v.stockOnHand,
    reservedDelta: 0,
    resultingStockOnHand: v.stockOnHand,
    resultingReservedQty: 0,
    reason: "Demo opening stock (seed tool)",
    referenceType: "seed",
    referenceId: seedBatch,
    performedByName: "seed-tool",
    isDemo: true,
    seedBatch,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  }));
  await data.bulkSet(COLLECTIONS.inventoryMovements, receivedMovements);

  // Demo orders + their `sold` movements
  const orders = buildDemoOrders(variants);
  const soldMovements: ({ id: string } & Record<string, unknown>)[] = [];
  for (const o of orders) {
    for (const item of o.items) {
      const variant = variants.find((v) => v.id === item.variantId);
      if (!variant) continue;
      const stockAfter = variant.stockOnHand - item.qty;
      soldMovements.push({
        id: stableId("mv", "sold", o.orderNumber, item.sku),
        variantId: item.variantId,
        variantSku: item.sku,
        type: "sold",
        qtyDelta: -item.qty,
        reservedDelta: 0,
        resultingStockOnHand: stockAfter,
        resultingReservedQty: 0,
        reason: `Demo order ${o.orderNumber} (seed tool)`,
        referenceType: "order",
        referenceId: o.id,
        performedByName: "seed-tool",
        isDemo: true,
        seedBatch,
        createdAt: o.createdAt,
        updatedAt: o.createdAt,
      });
      variant.stockOnHand = stockAfter; // keep later orders consistent
    }
  }
  await data.bulkSet(COLLECTIONS.orders, orders);
  await data.bulkSet(COLLECTIONS.inventoryMovements, soldMovements);

  // Advance the checkout order-number counter past the demo block. The generator
  // (checkout.service nextOrderNumber) reads `counters/order_number_<year>` and starts
  // at 1 — without this, the first REAL order after a seed collides with demo order
  // AN-<year>-000001. Demo order numbers are AN-<year>-000001..000012 by construction.
  const demoMaxSeq = orders.reduce((max, o) => {
    const seq = Number(o.orderNumber.split("-")[2]);
    return Number.isFinite(seq) ? Math.max(max, seq) : max;
  }, 0);
  if (demoMaxSeq > 0) {
    const counterId = `order_number_${new Date().getFullYear()}`;
    const existing = await data.get<{ value: number }>(COLLECTIONS.counters, counterId);
    if ((existing?.value ?? 0) < demoMaxSeq) {
      await data.set(COLLECTIONS.counters, counterId, { value: demoMaxSeq });
    }
  }

  // Demo admin owner (mock/dev logins only — real owners come from team/bootstrap)
  await data.set(
    COLLECTIONS.adminUsers,
    DEMO_ADMIN_OWNER.uid,
    { ...DEMO_ADMIN_OWNER, isDemo: true, seedBatch },
    { isDemo: true, seedBatch },
  );

  return {
    ok: true,
    mode: "apply",
    counts: {
      categories: categories.length,
      products: products.length,
      variants: variants.length,
      suppliers: DEMO_SUPPLIERS.length,
      customers: customers.length,
      orders: orders.length,
      inventoryMovements: receivedMovements.length + soldMovements.length,
      adminUsers: 1,
      settings: existingSettings ? 0 : 1,
    },
    errors: [],
    warnings: validation.warnings,
  };
}

/* ----------------------------------- reset ------------------------------------ */

/** Deletes ONLY demo records. Live records (isDemo !== true) are never touched. */
export async function resetDemoData(data: DataClient, seedBatch?: string): Promise<SeedReport> {
  const demoCollections: (keyof typeof COLLECTIONS)[] = [
    "orders",
    "customers",
    "inventoryMovements",
    "suppliers",
    "adminUsers",
    "products",
    "productVariants",
    "categories",
  ];
  const counts: Record<string, number> = {};
  for (const name of demoCollections) {
    const col = COLLECTIONS[name];
    const docs = await data.list<{ id: string; isDemo?: boolean; seedBatch?: string }>(col, {
      where: [{ field: "isDemo", op: "==", value: true }],
      limit: 5000,
    });
    const doomed = docs
      .filter((d) => (seedBatch ? d.seedBatch === seedBatch : true))
      .map((d) => d.id);
    if (doomed.length) await data.bulkDelete(col, doomed);
    counts[col] = doomed.length;
  }
  return { ok: true, mode: "reset", counts, errors: [], warnings: [] };
}

/* --------------------------------- settings ----------------------------------- */

export function defaultSettings(): SettingsDoc {
  return {
    id: "global",
    updatedAt: Date.now(),
    store: {
      name: "Annaadhya Products",
      legalName: "Annaadhya Products", // TODO(owner): confirm registered legal name
      supportEmail: "support@annaadhya.example", // TODO(owner): replace before launch
      supportPhone: "", // TODO(owner): add before launch
      addressLines: [],
      socialLinks: {},
      announcement: {
        enabled: true,
        message: "Demo catalogue live — prices are illustrative placeholders pending approval.",
        href: "/shop",
      },
    },
    shipping: {
      mode: "flat_rate",
      flatRatePaise: toPaise(49),
      freeAbovePaise: toPaise(999),
      deliveryEstimateDays: [3, 7], // internal planning figure — shown to customers only when confirmed
      serviceablePincodesNote:
        "We deliver across India. Serviceability for specific pincodes is confirmed at checkout.",
    },
    payments: {
      provider: "mock",
      sandboxMode: true, // hard requirement: payments stay sandboxed until explicit owner approval
      codEnabled: false, // enabled only when the business confirms COD operations
    },
    reporting: {
      includeDemoDataByDefault: false,
    },
    storefront: {
      // Hero fields blank = the storefront renders its approved design default.
      // The owner overrides them in Admin → Settings when real copy is decided.
      heroHeadline: "",
      heroHeadlineAccent: "",
      heroSubcopy: "",
      heroCtaHref: "",
      heroCtaLabel: "",
      newsletterEnabled: true, // explicit footer signup + admin export = the compliant workflow
      giftCollectionEnabled: false, // flip when gift boxes launch
    },
  } satisfies SettingsDoc;
}

export { buildDocs as buildSeedDocs };
export type { SeedProduct };
