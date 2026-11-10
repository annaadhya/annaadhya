/** Catalogue service — public browsing (published only) + admin CRUD with SKU uniqueness. */
import { Inject, Injectable } from "@nestjs/common";
import {
  COLLECTIONS,
  availableQty,
  backorderPolicyOf,
  searchVisibleOf,
  trackInventoryOf,
  type CategoryDoc,
  type ListQueryDto,
  type Page,
  type ProductDoc,
  type ProductUpsertDto,
  type CategoryUpsertDto,
  type ProductVariantDoc,
} from "@annaadhya/contracts";
import { conflict, notFound, validationFailed, type DataClient } from "@annaadhya/data-core";
import { DATA_CLIENT } from "../../data/data.module";
import { sanitizeRichText, slugify, stripHtml } from "@annaadhya/utils";

export interface ProductWithVariants extends ProductDoc {
  variants: ProductVariantDoc[];
}

@Injectable()
export class CatalogueService {
  constructor(@Inject(DATA_CLIENT) private readonly data: DataClient) {}

  /* ------------------------------- public -------------------------------- */

  async listCategories(includeNotReady = false): Promise<CategoryDoc[]> {
    const rows = await this.data.list<CategoryDoc>(COLLECTIONS.categories, {
      where: [{ field: "status", op: "==", value: "published" }],
      orderBy: [{ field: "sortOrder", direction: "asc" }],
    });
    return includeNotReady ? rows : rows.filter((c) => c.isReady);
  }

  /**
   * Admin read: every category across its whole lifecycle — drafts and archived
   * included, published first-class. The admin console's status filters (Drafts /
   * Archived / restore flows) are driven by this; the public list above stays
   * published-only. No status where-clause: a plain ordered read serves from the
   * automatic single-field index, so no composite index is needed.
   */
  async listAllCategories(): Promise<CategoryDoc[]> {
    return this.data.list<CategoryDoc>(COLLECTIONS.categories, {
      orderBy: [{ field: "sortOrder", direction: "asc" }],
    });
  }

  /**
   * Shop-page overview: every published category with its sellable product count, plus the
   * total — computed in a SINGLE pass (3 collection reads) instead of one products query per
   * category. This is what lets the storefront render category pills without an N+1 fan-out.
   * Counting semantics match listProducts with includeUnavailable=true: published products
   * with at least one published variant, regardless of stock.
   */
  async overview(): Promise<{
    categories: Array<CategoryDoc & { productCount: number }>;
    totalProducts: number;
  }> {
    const [categories, products, variantRows] = await Promise.all([
      this.data.list<CategoryDoc>(COLLECTIONS.categories, {
        where: [{ field: "status", op: "==", value: "published" }],
        orderBy: [{ field: "sortOrder", direction: "asc" }],
      }),
      this.data.list<ProductDoc>(COLLECTIONS.products, {
        where: [{ field: "status", op: "==", value: "published" }],
      }),
      this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
        where: [{ field: "status", op: "==", value: "published" }],
      }),
    ]);

    const sellable = new Set(variantRows.map((v) => v.productId));
    const countByCategory = new Map<string, number>();
    let total = 0;
    for (const p of products) {
      if (!sellable.has(p.id)) continue;
      total += 1;
      countByCategory.set(p.categoryId, (countByCategory.get(p.categoryId) ?? 0) + 1);
    }

    return {
      categories: categories.map((c) => ({ ...c, productCount: countByCategory.get(c.id) ?? 0 })),
      totalProducts: total,
    };
  }

  async getCategoryBySlug(slug: string): Promise<CategoryDoc | null> {
    const rows = await this.data.list<CategoryDoc>(COLLECTIONS.categories, {
      where: [{ field: "slug", op: "==", value: slug }],
      limit: 1,
    });
    return rows[0] ?? null;
  }

  async getCategoryById(id: string): Promise<CategoryDoc | null> {
    return this.data.get<CategoryDoc>(COLLECTIONS.categories, id);
  }

  async listProducts(q: ListQueryDto): Promise<Page<ProductWithVariants>> {
    // Admin view (includeUnavailable): ALL statuses and variants, including products
    // that are still drafts or have no sellable packs yet — nothing may silently
    // disappear from the console. Public browsing stays strictly published-only.
    const adminView = q.includeUnavailable === true;
    const where: { field: string; op: "==" | ">=" | "<=" | "in"; value: unknown }[] = adminView
      ? []
      : [{ field: "status", op: "==", value: "published" }];

    let categoryId: string | undefined;
    if (q.category) {
      const cat = await this.getCategoryBySlug(q.category);
      if (!cat || (!cat.isReady && !q.includeUnavailable)) {
        return emptyPage(q.page, q.pageSize);
      }
      categoryId = cat.id;
    }

    let products = await this.data.list<ProductDoc>(COLLECTIONS.products, { where });
    if (categoryId) products = products.filter((p) => p.categoryId === categoryId);

    // Load all variants of matching products, then filter/sort on the min variant price.
    const variantRows = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
      where: adminView ? [] : [{ field: "status", op: "==", value: "published" }],
    });
    const variantsByProduct = new Map<string, ProductVariantDoc[]>();
    for (const v of variantRows) {
      const list = variantsByProduct.get(v.productId) ?? [];
      list.push(v);
      variantsByProduct.set(v.productId, list);
    }

    let rows: ProductWithVariants[] = [];
    for (const p of products) {
      const variants = variantsByProduct.get(p.id) ?? [];
      if (!adminView && variants.length === 0) continue; // public: products without variants are not sellable yet
      if (!q.includeUnavailable && variants.every((v) => !variantPurchasable(v, p))) continue;
      if (q.search) {
        // Search-visibility toggle: hidden products stay browsable but never match search.
        if (!searchVisibleOf(p)) continue;
        const needle = q.search.toLowerCase();
        const haystack = `${p.name} ${p.subtitle} ${p.typeLabel} ${stripHtml(p.description)} ${p.sku}`.toLowerCase();
        if (!haystack.includes(needle)) continue;
      }
      rows.push({ ...p, variants: sortVariants(variants) });
    }

    const minPrice = (r: ProductWithVariants) => Math.min(...r.variants.map((v) => v.pricePaise));
    const maxPrice = (r: ProductWithVariants) => Math.max(...r.variants.map((v) => v.pricePaise));
    if (q.minPricePaise !== undefined) rows = rows.filter((r) => minPrice(r) >= q.minPricePaise!);
    if (q.maxPricePaise !== undefined) rows = rows.filter((r) => maxPrice(r) <= q.maxPricePaise!);

    switch (q.sort) {
      case "price_asc":
        rows.sort((a, b) => minPrice(a) - minPrice(b));
        break;
      case "price_desc":
        rows.sort((a, b) => maxPrice(b) - maxPrice(a));
        break;
      case "newest":
        rows.sort((a, b) => b.createdAt - a.createdAt);
        break;
      default:
        rows.sort((a, b) => (a.bestsellerRank ?? 9999) - (b.bestsellerRank ?? 9999) || b.createdAt - a.createdAt);
    }

    const total = rows.length;
    const start = (q.page - 1) * q.pageSize;
    return {
      items: rows.slice(start, start + q.pageSize),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
    };
  }

  async getProductBySlug(slug: string, opts: { onlyPublished?: boolean } = {}): Promise<ProductWithVariants | null> {
    const rows = await this.data.list<ProductDoc>(COLLECTIONS.products, {
      where: [{ field: "slug", op: "==", value: slug }],
      limit: 1,
    });
    const product = rows[0];
    if (!product) return null;
    if (opts.onlyPublished !== false && product.status !== "published") return null;
    return this.attachVariants(product);
  }

  async getProductById(id: string): Promise<ProductWithVariants | null> {
    const product = await this.data.get<ProductDoc>(COLLECTIONS.products, id);
    if (!product) return null;
    return this.attachVariants(product);
  }

  /**
   * One query for ALL published variants, grouped by product (grams-ordered), replacing the
   * per-product attachVariants loop that cost one Firestore read per product.
   */
  private async variantsByProduct(): Promise<Map<string, ProductVariantDoc[]>> {
    const rows = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
      where: [{ field: "status", op: "==", value: "published" }],
    });
    const map = new Map<string, ProductVariantDoc[]>();
    for (const v of rows) {
      const list = map.get(v.productId) ?? [];
      list.push(v);
      map.set(v.productId, list);
    }
    for (const [productId, list] of map) map.set(productId, sortVariants(list));
    return map;
  }

  async relatedProducts(product: ProductWithVariants, limit = 4): Promise<ProductWithVariants[]> {
    const [sameCategory, variantsMap] = await Promise.all([
      this.data.list<ProductDoc>(COLLECTIONS.products, {
        where: [
          { field: "status", op: "==", value: "published" },
          { field: "categoryId", op: "==", value: product.categoryId },
        ],
        limit: limit + 1,
      }),
      this.variantsByProduct(),
    ]);
    const rows: ProductWithVariants[] = [];
    for (const p of sameCategory) {
      if (p.id === product.id) continue;
      const variants = variantsMap.get(p.id) ?? [];
      if (variants.length === 0) continue; // products without variants are not sellable yet
      rows.push({ ...p, variants });
    }
    return rows.slice(0, limit);
  }

  async bestsellers(limit = 8): Promise<ProductWithVariants[]> {
    const [rows, variantsMap] = await Promise.all([
      this.data.list<ProductDoc>(COLLECTIONS.products, {
        where: [{ field: "status", op: "==", value: "published" }],
      }),
      this.variantsByProduct(),
    ]);
    return rows
      .map((p) => ({ ...p, variants: variantsMap.get(p.id) ?? [] }))
      .filter((p) => p.variants.length > 0 && p.bestsellerRank !== undefined)
      .sort((a, b) => a.bestsellerRank! - b.bestsellerRank!)
      .slice(0, limit);
  }

  async featured(limit = 8): Promise<ProductWithVariants[]> {
    const [rows, variantsMap] = await Promise.all([
      this.data.list<ProductDoc>(COLLECTIONS.products, {
        where: [{ field: "status", op: "==", value: "published" }],
      }),
      this.variantsByProduct(),
    ]);
    return rows
      .map((p) => ({ ...p, variants: variantsMap.get(p.id) ?? [] }))
      .filter((p) => p.variants.length > 0 && p.featuredRank !== undefined)
      .sort((a, b) => a.featuredRank! - b.featuredRank!)
      .slice(0, limit);
  }

  private async attachVariants(product: ProductDoc): Promise<ProductWithVariants | null> {
    const variants = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
      where: [{ field: "productId", op: "==", value: product.id }],
      orderBy: [{ field: "grams", direction: "asc" }],
    });
    return { ...product, variants: sortVariants(variants) };
  }

  /* -------------------------------- admin --------------------------------- */

  async upsertProduct(dto: ProductUpsertDto, productId?: string): Promise<ProductWithVariants> {
    // Category must exist
    const category = await this.data.get<CategoryDoc>(COLLECTIONS.categories, dto.categoryId);
    if (!category) throw conflict(`Category ${dto.categoryId} does not exist`);

    // SKU uniqueness (excluding this product)
    const bySku = await this.data.list<ProductDoc>(COLLECTIONS.products, {
      where: [{ field: "sku", op: "==", value: dto.sku }],
      limit: 2,
    });
    const clash = bySku.find((p) => p.id !== productId);
    if (clash) throw conflict(`SKU ${dto.sku} is already used by another product`);

    // Variant SKU uniqueness
    const variantSkus = dto.variants.map((v) => v.sku);
    const dupVariant = variantSkus.find((s, i) => variantSkus.indexOf(s) !== i);
    if (dupVariant) throw conflict(`Duplicate variant SKU in request: ${dupVariant}`);
    for (const vs of variantSkus) {
      const existing = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
        where: [{ field: "sku", op: "==", value: vs }],
        limit: 2,
      });
      const foreign = existing.find((v) => v.productId !== productId);
      if (foreign) throw conflict(`Variant SKU ${vs} is already used by another product`);
    }
    // MRP sanity
    for (const v of dto.variants) {
      if (v.mrpPaise !== undefined && v.mrpPaise < v.pricePaise) {
        throw conflict(`MRP must be >= selling price for variant ${v.sku}`);
      }
    }

    const now = Date.now();
    const id = productId ?? `prod_${slugify(dto.sku)}`;
    const existingDoc = await this.data.get<ProductDoc>(COLLECTIONS.products, id);

    // Slug: an explicit custom slug wins; otherwise keep the existing slug on update,
    // or derive one from the name on create. Either way it must stay unique — the
    // storefront routes every product through /product/{slug}.
    const slug = dto.slug && dto.slug.trim() !== "" ? dto.slug.trim() : existingDoc?.slug ?? slugify(dto.name);
    const bySlug = await this.data.list<ProductDoc>(COLLECTIONS.products, {
      where: [{ field: "slug", op: "==", value: slug }],
      limit: 2,
    });
    const slugClash = bySlug.find((p) => p.id !== id);
    if (slugClash) throw conflict(`Slug ${slug} is already used by another product`);

    // Rich-text descriptions are sanitised once at the boundary — stored docs are always safe to render.
    const description = sanitizeRichText(dto.description);
    if (stripHtml(description).length < 10) {
      throw conflict("Description must be at least 10 characters of visible text");
    }

    const product: ProductDoc = {
      id,
      sku: dto.sku,
      slug,
      name: dto.name,
      subtitle: dto.subtitle,
      description,
      categoryId: dto.categoryId,
      typeLabel: dto.typeLabel,
      status: dto.status,
      // Field-level normalization: compiles identically under strict and
      // non-strict (Vercel's node builder checks with strict:false, which makes
      // zod-inferred props appear optional). Values are already validated.
      images: dto.images.map((im) => ({
        url: im.url ?? "",
        cloudinaryPublicId: im.cloudinaryPublicId,
        alt: im.alt ?? "",
        width: im.width,
        height: im.height,
      })),
      origin: dto.origin || undefined,
      shelfLife: dto.shelfLife || undefined,
      specs: (dto.specs ?? []).filter((s) => s.value.trim() !== "" && s.label.trim() !== ""),
      ingredients: dto.ingredients,
      netQuantityLabel: dto.netQuantityLabel,
      storageInstructions: dto.storageInstructions,
      allergenInfo: dto.allergenInfo,
      manufacturerDetails: dto.manufacturerDetails,
      fssaiLicense: dto.fssaiLicense,
      bestsellerRank: dto.bestsellerRank,
      featuredRank: dto.featuredRank,
      giftItem: dto.giftItem,
      // Storefront controls — omit-in-payload preserves the stored value (quick toggles etc.),
      // a brand-new product gets the documented default.
      searchVisible: dto.searchVisible ?? existingDoc?.searchVisible ?? true,
      trackInventory: dto.trackInventory ?? existingDoc?.trackInventory ?? true,
      backorderPolicy: dto.backorderPolicy ?? existingDoc?.backorderPolicy ?? "deny",
      seo: dto.seo,
      createdAt: existingDoc?.createdAt ?? now,
      updatedAt: now,
      isDemo: existingDoc?.isDemo ?? false,
    };
    await this.data.set(COLLECTIONS.products, id, product);

    // Variants: upsert by sku; existing stock is preserved on update
    const existingVariants = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
      where: [{ field: "productId", op: "==", value: id }],
    });
    const existingBySku = new Map(existingVariants.map((v) => [v.sku, v]));

    for (const [idx, v] of dto.variants.entries()) {
      const prev = existingBySku.get(v.sku);
      const variant: ProductVariantDoc = {
        id: prev?.id ?? `var_${slugify(v.sku)}`,
        productId: id,
        sku: v.sku,
        packLabel: v.packLabel,
        grams: v.grams,
        pricePaise: v.pricePaise,
        mrpPaise: v.mrpPaise,
        status: v.status,
        stockOnHand: v.stockOnHand ?? prev?.stockOnHand ?? 0,
        reservedQty: prev?.reservedQty ?? 0,
        lowStockThreshold: v.lowStockThreshold,
        sortOrder: v.sortOrder ?? prev?.sortOrder ?? idx,
        createdAt: prev?.createdAt ?? now,
        updatedAt: now,
        isDemo: prev?.isDemo ?? false,
      };
      await this.data.set(COLLECTIONS.productVariants, variant.id, variant);
      existingBySku.delete(v.sku);
    }
    // Variants removed from the payload get archived (never hard-deleted — orders reference them)
    for (const leftover of existingBySku.values()) {
      await this.data.update(COLLECTIONS.productVariants, leftover.id, { status: "archived" });
    }

    const result = await this.getProductById(id);
    if (!result) throw conflict("Product upsert failed");
    return result;
  }

  async upsertCategory(dto: CategoryUpsertDto, categoryId?: string): Promise<CategoryDoc> {
    const id = categoryId ?? `cat_${dto.slug}`;
    const existing = await this.data.get<CategoryDoc>(COLLECTIONS.categories, id);
    const now = Date.now();
    const doc: CategoryDoc = {
      id,
      slug: dto.slug,
      name: dto.name,
      tagline: dto.tagline,
      description: dto.description,
      sortOrder: dto.sortOrder,
      isReady: dto.isReady,
      heroImage: dto.heroImage,
      status: dto.status,
      seo: dto.seo,
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      isDemo: existing?.isDemo ?? false,
    };
    await this.data.set(COLLECTIONS.categories, id, doc);
    return doc;
  }

  /**
   * Safe delete: a category with assigned products is refused unless the caller
   * explicitly reassigns them to another existing category. Products (including
   * archived ones and their order-history snapshots) are never silently lost.
   */
  async deleteCategory(
    categoryId: string,
    reassignTo?: string,
  ): Promise<{ deleted: true; reassignedProducts: number }> {
    const category = await this.data.get<CategoryDoc>(COLLECTIONS.categories, categoryId);
    if (!category) throw notFound("Category not found");
    const assigned = await this.data.list<ProductDoc>(COLLECTIONS.products, {
      where: [{ field: "categoryId", op: "==", value: categoryId }],
    });
    if (assigned.length > 0 && !reassignTo) {
      throw conflict(
        `${assigned.length} product(s) are still assigned to "${category.name}". ` +
          "Reassign them to another category or archive them first.",
      );
    }
    if (reassignTo) {
      if (reassignTo === categoryId) {
        throw validationFailed("Cannot reassign products to the category being deleted");
      }
      const target = await this.data.get<CategoryDoc>(COLLECTIONS.categories, reassignTo);
      if (!target) throw notFound("Reassignment target category not found");
      for (const p of assigned) {
        await this.data.update(COLLECTIONS.products, p.id, { categoryId: reassignTo });
      }
    }
    await this.data.delete(COLLECTIONS.categories, categoryId);
    return { deleted: true, reassignedProducts: assigned.length };
  }

  async archiveProduct(productId: string): Promise<void> {
    const product = await this.data.get<ProductDoc>(COLLECTIONS.products, productId);
    if (!product) throw notFound("Product not found");
    await this.data.update(COLLECTIONS.products, productId, { status: "archived" });
    const variants = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
      where: [{ field: "productId", op: "==", value: productId }],
    });
    for (const v of variants) {
      await this.data.update(COLLECTIONS.productVariants, v.id, { status: "archived" });
    }
  }
}

function emptyPage(page: number, pageSize: number): Page<ProductWithVariants> {
  return { items: [], page, pageSize, total: 0, totalPages: 1 };
}

/** A variant is purchasable when untracked (unlimited) or when the product's stock policy admits the sale. */
export function variantPurchasable(v: ProductVariantDoc, product: Pick<ProductDoc, "trackInventory" | "backorderPolicy">): boolean {
  if (!trackInventoryOf(product)) return true;
  if (backorderPolicyOf(product) !== "deny") return true;
  return availableQty(v) > 0;
}

/** Display order: explicit sortOrder first (admin drag-reorder), grams as legacy fallback, pack label as tiebreak. */
export function sortVariants(variants: ProductVariantDoc[]): ProductVariantDoc[] {
  return [...variants].sort(
    (a, b) =>
      (a.sortOrder ?? Number.MAX_SAFE_INTEGER) - (b.sortOrder ?? Number.MAX_SAFE_INTEGER) ||
      a.grams - b.grams ||
      a.packLabel.localeCompare(b.packLabel),
  );
}
