/**
 * InventoryService — the stock ledger. Every stock change goes through here,
 * carries a mandatory reason, and lands an audit-friendly movement record.
 * Concurrency safety: reserve/adjust run inside DataClient transactions.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  COLLECTIONS,
  availableQty,
  type CategoryDoc,
  type InventoryLedgerPage,
  type InventoryLedgerQueryDto,
  type InventoryLedgerRow,
  type InventoryLedgerSummary,
  type InventoryMovementDoc,
  type InventoryMovementType,
  type ProductDoc,
  type ProductVariantDoc,
  type StockAdjustmentDto,
  type StockMovementDto,
  type InventoryThresholdsDto,
} from "@annaadhya/contracts";
import { badRequest, notFound, unprocessable, type DataClient } from "@annaadhya/data-core";
import { newId } from "@annaadhya/utils";
import { DATA_CLIENT } from "../../data/data.module";
import type { AuthPrincipal } from "@annaadhya/contracts";

@Injectable()
export class InventoryService {
  constructor(@Inject(DATA_CLIENT) private readonly data: DataClient) {}

  async applyMovement(dto: StockMovementDto, actor: AuthPrincipal): Promise<InventoryMovementDoc> {
    // Server-side defense-in-depth: every movement needs a meaningful reason (the DTO also enforces this).
    if (!dto.reason || dto.reason.trim().length < 3) {
      throw badRequest("A reason of at least 3 characters is required for every stock movement");
    }
    // Movement semantics: which counters change and in which direction.
    const plan = movementPlan(dto.type, dto.qty);
    if (!plan) throw badRequest(`Unsupported movement type: ${dto.type}`);

    const movementId = newId("mv");
    await this.data.runTransaction(async (tx) => {
      const variant = await tx.get<ProductVariantDoc>(COLLECTIONS.productVariants, dto.variantId);
      if (!variant) throw notFound("Variant not found");
      if (variant.status === "archived") throw badRequest("Cannot move stock on an archived variant");

      const newStock = Math.max(0, variant.stockOnHand + plan.stockDelta);
      const newReserved = Math.max(0, variant.reservedQty + plan.reservedDelta);

      // Guard: cannot sell/commit more than available
      if (availableQty({ ...variant, stockOnHand: newStock, reservedQty: newReserved }) < 0) {
        throw unprocessable(`Movement would make ${variant.sku} oversold`);
      }
      if (plan.reservedDelta < 0 && variant.reservedQty + plan.reservedDelta < 0) {
        throw badRequest("Release would exceed current reserved quantity");
      }

      tx.update(COLLECTIONS.productVariants, variant.id, {
        stockOnHand: newStock,
        reservedQty: newReserved,
      });
      const movement: InventoryMovementDoc = {
        id: movementId,
        variantId: variant.id,
        variantSku: variant.sku,
        type: dto.type,
        qtyDelta: plan.stockDelta,
        reservedDelta: plan.reservedDelta,
        resultingStockOnHand: newStock,
        resultingReservedQty: newReserved,
        reason: dto.reason,
        referenceType: dto.referenceType,
        referenceId: dto.referenceId,
        performedByUid: actor.uid,
        performedByName: actor.displayName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDemo: false,
      };
      tx.set(COLLECTIONS.inventoryMovements, movementId, movement as object);
    });
    const doc = await this.data.get<InventoryMovementDoc>(COLLECTIONS.inventoryMovements, movementId);
    if (!doc) throw notFound("Movement missing after commit");
    return doc;
  }

  async movements(opts: { variantId?: string; type?: InventoryMovementType; limit?: number } = {}) {
    const where: { field: string; op: "=="; value: unknown }[] = [];
    if (opts.variantId) where.push({ field: "variantId", op: "==", value: opts.variantId });
    if (opts.type) where.push({ field: "type", op: "==", value: opts.type });
    return this.data.list<InventoryMovementDoc>(COLLECTIONS.inventoryMovements, {
      where,
      orderBy: [{ field: "createdAt", direction: "desc" }],
      limit: opts.limit ?? 100,
    });
  }

  async lowStock(thresholdOverride?: number) {
    const variants = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
      where: [{ field: "status", op: "==", value: "published" }],
    });
    return variants
      .map((v) => ({ variant: v, available: availableQty(v) }))
      .filter(({ variant, available }) => available <= (thresholdOverride ?? variant.lowStockThreshold))
      .sort((a, b) => a.available - b.available);
  }

  async balances() {
    const variants = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
      orderBy: [{ field: "sku", direction: "asc" }],
      limit: 5000,
    });
    return variants.map((v) => ({
      variantId: v.id,
      sku: v.sku,
      packLabel: v.packLabel,
      productId: v.productId,
      stockOnHand: v.stockOnHand,
      reservedQty: v.reservedQty,
      available: availableQty(v),
      lowStockThreshold: v.lowStockThreshold,
      status: v.status,
    }));
  }

  /* --------------------------- inventory console --------------------------- */

  /**
   * Paginated inventory ledger joined with product/category display data.
   * Summary metrics are computed over the SAME filtered scope as the rows,
   * so cards and table can never disagree.
   */
  async ledger(q: InventoryLedgerQueryDto): Promise<InventoryLedgerPage> {
    const [variants, products, categories] = await Promise.all([
      this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, { limit: 5000 }),
      this.data.list<ProductDoc>(COLLECTIONS.products, { limit: 5000 }),
      this.data.list<CategoryDoc>(COLLECTIONS.categories, { limit: 1000 }),
    ]);
    const productById = new Map(products.map((p) => [p.id, p]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    const rows: InventoryLedgerRow[] = [];
    for (const v of variants) {
      // Archived variants have left the catalogue; orders still reference them but
      // they are not live stock the console should keep surfacing.
      if (v.status === "archived") continue;
      const product = productById.get(v.productId);
      const available = availableQty(v);
      const stockStatus: InventoryLedgerRow["stockStatus"] =
        available <= 0 ? "out_of_stock" : available <= v.lowStockThreshold ? "low_stock" : "in_stock";
      rows.push({
        variantId: v.id,
        sku: v.sku,
        packLabel: v.packLabel,
        productId: v.productId,
        productName: product?.name ?? "Unlinked product",
        productSlug: product?.slug,
        productImage: product?.images?.[0]?.url,
        categoryName: product ? (categoryById.get(product.categoryId)?.name ?? "—") : "—",
        variantStatus: v.status,
        productStatus: product?.status ?? "archived",
        stockOnHand: v.stockOnHand,
        reservedQty: v.reservedQty,
        available,
        lowStockThreshold: v.lowStockThreshold,
        pricePaise: v.pricePaise,
        updatedAt: v.updatedAt,
        stockStatus,
        lastMovement: null,
      });
    }

    let filtered = rows;
    if (q.categoryId) {
      filtered = filtered.filter((r) => productById.get(r.productId)?.categoryId === q.categoryId);
    }
    if (q.stockStatus !== "all") {
      filtered = filtered.filter((r) => r.stockStatus === q.stockStatus);
    }
    if (q.search) {
      const needle = q.search.toLowerCase();
      filtered = filtered.filter((r) =>
        `${r.productName} ${r.sku} ${r.packLabel}`.toLowerCase().includes(needle),
      );
    }

    const summary: InventoryLedgerSummary = {
      totalVariants: filtered.length,
      totalProducts: new Set(filtered.map((r) => r.productId)).size,
      lowStock: filtered.filter((r) => r.stockStatus === "low_stock").length,
      outOfStock: filtered.filter((r) => r.stockStatus === "out_of_stock").length,
      totalStockOnHand: filtered.reduce((sum, r) => sum + r.stockOnHand, 0),
      // stock × selling price — labelled "retail value at selling price" in the UI, never cost.
      retailValuePaise: filtered.reduce((sum, r) => sum + r.stockOnHand * r.pricePaise, 0),
    };

    switch (q.sort) {
      case "stock_asc":
        filtered.sort((a, b) => a.available - b.available || a.sku.localeCompare(b.sku));
        break;
      case "stock_desc":
        filtered.sort((a, b) => b.available - a.available || a.sku.localeCompare(b.sku));
        break;
      case "recently_updated":
        filtered.sort((a, b) => b.updatedAt - a.updatedAt);
        break;
      default:
        filtered.sort((a, b) => a.productName.localeCompare(b.productName) || a.sku.localeCompare(b.sku));
    }

    // Latest movement per variant: one scan of recent movements (newest first).
    const movements = await this.data.list<InventoryMovementDoc>(COLLECTIONS.inventoryMovements, {
      orderBy: [{ field: "createdAt", direction: "desc" }],
      limit: 2000,
    });
    const lastByVariant = new Map<string, InventoryMovementDoc>();
    for (const m of movements) {
      if (!lastByVariant.has(m.variantId)) lastByVariant.set(m.variantId, m);
    }
    for (const row of filtered) {
      const m = lastByVariant.get(row.variantId);
      if (m) row.lastMovement = { at: m.createdAt, byName: m.performedByName, type: m.type };
    }

    const total = filtered.length;
    const start = (q.page - 1) * q.pageSize;
    return {
      items: filtered.slice(start, start + q.pageSize),
      page: q.page,
      pageSize: q.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / q.pageSize)),
      summary,
    };
  }

  /**
   * Guided stock adjustment behind the console drawer.
   * Reads the variant INSIDE the transaction, so the delta for `set` mode (and the
   * remove/strand guards) are validated against the latest authoritative state —
   * concurrent orders or admins cannot be silently overwritten.
   */
  async adjust(dto: StockAdjustmentDto, actor: AuthPrincipal): Promise<InventoryMovementDoc> {
    // Ledger semantics: the movement type must make sense for the direction.
    const allowedTypes: Record<StockAdjustmentDto["mode"], readonly InventoryMovementType[]> = {
      add: ["received", "returned", "other"],
      remove: ["damaged", "manual_adjustment", "other"],
      set: ["manual_adjustment", "other"],
    };
    if (!allowedTypes[dto.mode].includes(dto.type)) {
      throw badRequest(`Movement type "${dto.type}" is not allowed for a ${dto.mode} adjustment`);
    }

    const reason = dto.note ? `${dto.reason} — ${dto.note}` : dto.reason;
    if (reason.trim().length < 3) {
      throw badRequest("A reason of at least 3 characters is required for every stock adjustment");
    }
    // Defense-in-depth (the DTO also enforces this): add/remove need a positive amount.
    if (dto.mode !== "set" && dto.qty < 1) {
      throw badRequest("Quantity must be a positive whole number for add/remove adjustments");
    }

    const movementId = newId("mv");
    await this.data.runTransaction(async (tx) => {
      const variant = await tx.get<ProductVariantDoc>(COLLECTIONS.productVariants, dto.variantId);
      if (!variant) throw notFound("Variant not found");
      if (variant.status === "archived") throw badRequest("Cannot adjust stock on an archived variant");

      const current = variant.stockOnHand;
      let stockDelta: number;
      if (dto.mode === "add") {
        stockDelta = Math.abs(dto.qty);
      } else if (dto.mode === "remove") {
        stockDelta = -Math.abs(dto.qty);
      } else {
        stockDelta = dto.qty - current; // "set exact": submitted value is the NEW total
        if (stockDelta === 0) {
          throw badRequest(`Stock is already at ${current} units — nothing to adjust`);
        }
      }

      const newStock = current + stockDelta;
      if (newStock < 0) {
        throw unprocessable(`Cannot remove ${Math.abs(stockDelta)} units — ${variant.sku} has only ${current} on hand`);
      }
      // Reserved units belong to verified orders; stranding them would break commit.
      if (newStock - variant.reservedQty < 0) {
        throw unprocessable(
          `Adjustment would strand ${variant.reservedQty} units reserved for paid orders on ${variant.sku}`,
        );
      }

      tx.update(COLLECTIONS.productVariants, variant.id, { stockOnHand: newStock });
      const movement: InventoryMovementDoc = {
        id: movementId,
        variantId: variant.id,
        variantSku: variant.sku,
        type: dto.type,
        qtyDelta: stockDelta,
        reservedDelta: 0,
        resultingStockOnHand: newStock,
        resultingReservedQty: variant.reservedQty,
        reason: reason.trim(),
        referenceType: dto.reference ? "admin" : undefined,
        referenceId: dto.reference,
        performedByUid: actor.uid,
        performedByName: actor.displayName,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        isDemo: false,
      };
      tx.set(COLLECTIONS.inventoryMovements, movementId, movement as object);
    });

    const doc = await this.data.get<InventoryMovementDoc>(COLLECTIONS.inventoryMovements, movementId);
    if (!doc) throw notFound("Movement missing after commit");
    return doc;
  }

  /** Bulk low-stock-threshold update (safe: touches only the threshold, never quantities). */
  async updateThresholds(dto: InventoryThresholdsDto): Promise<{ updated: number }> {
    await this.data.runTransaction(async (tx) => {
      for (const item of dto.items) {
        const variant = await tx.get<ProductVariantDoc>(COLLECTIONS.productVariants, item.variantId);
        if (!variant) throw notFound(`Variant ${item.variantId} not found`);
        if (variant.lowStockThreshold !== item.lowStockThreshold) {
          tx.update(COLLECTIONS.productVariants, variant.id, { lowStockThreshold: item.lowStockThreshold });
        }
      }
    });
    return { updated: dto.items.length };
  }
}

interface MovementPlan {
  stockDelta: number;
  reservedDelta: number;
}

/** Map a movement type to its effect on (stockOnHand, reservedQty). */
function movementPlan(type: InventoryMovementType, qty: number): MovementPlan | null {
  const abs = Math.abs(qty);
  switch (type) {
    case "received":
      return { stockDelta: abs, reservedDelta: 0 };
    case "sold":
      return { stockDelta: -abs, reservedDelta: 0 };
    case "damaged":
      return { stockDelta: -abs, reservedDelta: 0 };
    case "returned":
      return { stockDelta: abs, reservedDelta: 0 };
    case "reserved":
      return { stockDelta: 0, reservedDelta: abs };
    case "released":
      return { stockDelta: 0, reservedDelta: -abs };
    case "manual_adjustment":
      return { stockDelta: qty, reservedDelta: 0 }; // signed: +3 / -2
    case "other":
      return { stockDelta: qty, reservedDelta: 0 };
    default:
      return null;
  }
}
