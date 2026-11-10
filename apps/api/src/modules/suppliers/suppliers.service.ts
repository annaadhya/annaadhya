/** Suppliers & Purchases — supplier records plus quote→purchase→stock-receipt workflow. */
import { Inject, Injectable } from "@nestjs/common";
import {
  COLLECTIONS,
  type AuthPrincipal,
  type CategoryDoc,
  type ProductDoc,
  type ProductVariantDoc,
  type PurchaseDoc,
  type PurchaseItem,
  type PurchaseLedgerPage,
  type PurchaseLedgerQueryDto,
  type PurchaseLedgerRow,
  type PurchaseLedgerSummary,
  type PurchasePaymentDoc,
  type PurchasePaymentDto,
  type PurchasePaymentStatus,
  type PurchaseReceiveDto,
  type PurchaseStatus,
  type PurchaseUpsertInput,
  type SupplierDoc,
  type SupplierLedgerPage,
  type SupplierLedgerQueryDto,
  type SupplierLedgerRow,
  type SupplierLedgerSummary,
  type SupplierStatus,
  type SupplierUpsertDto,
} from "@annaadhya/contracts";
import { badRequest, conflict, notFound, type DataClient } from "@annaadhya/data-core";
import { newId } from "@annaadhya/utils";
import { DATA_CLIENT } from "../../data/data.module";
import { AuditService } from "../audit/audit.service";
import { InventoryService } from "../inventory/inventory.service";

const IST_OFFSET_MINUTES = 330;

/** Start of the current IST calendar month, as epoch millis. */
function istMonthStart(now: number): number {
  const shifted = new Date(now + IST_OFFSET_MINUTES * 60_000);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - IST_OFFSET_MINUTES * 60_000;
}

@Injectable()
export class SuppliersService {
  constructor(@Inject(DATA_CLIENT) private readonly data: DataClient) {}

  async list(opts: { search?: string } = {}): Promise<SupplierDoc[]> {
    const rows = await this.data.list<SupplierDoc>(COLLECTIONS.suppliers, {
      orderBy: [{ field: "createdAt", direction: "desc" }],
      limit: 500,
    });
    if (!opts.search) return rows;
    const needle = opts.search.toLowerCase();
    return rows.filter((s) => `${s.name} ${s.location ?? ""} ${s.productSkus.join(" ")}`.toLowerCase().includes(needle));
  }

  async get(id: string): Promise<SupplierDoc> {
    const doc = await this.data.get<SupplierDoc>(COLLECTIONS.suppliers, id);
    if (!doc) throw notFound("Supplier not found");
    return doc;
  }

  async upsert(dto: SupplierUpsertDto, id?: string): Promise<SupplierDoc> {
    const existing = id ? await this.data.get<SupplierDoc>(COLLECTIONS.suppliers, id) : null;
    // Defense-in-depth fallbacks: the zod pipe applies schema defaults on the HTTP path,
    // but direct callers (seed/tools) may post the legacy payload without the new keys.
    const productSkus = [...new Set((dto.productSkus ?? []).map((s) => s.toUpperCase()))];
    const ratesIn = dto.rates ?? [];
    const doc: SupplierDoc = {
      id: id ?? newId("sup"),
      name: dto.name,
      type: dto.type ?? "other",
      contactPerson: dto.contactPerson,
      phone: dto.phone,
      email: dto.email || undefined,
      location: dto.location,
      village: dto.village,
      city: dto.city,
      state: dto.state,
      pincode: dto.pincode || undefined,
      addressLines: dto.addressLines,
      status: dto.status ?? "active",
      paymentTerms: dto.paymentTerms,
      licenseNumber: dto.licenseNumber,
      notes: dto.notes,
      productSkus,
      // Normalized rate rows: stable ids so edits can update a line in place; legacy
      // docs that predate rates simply get their first rate list here.
      rates: ratesIn.map((r, idx) => ({
        id: r.id ?? existing?.rates?.[idx]?.id ?? newId("rt"),
        label: r.label,
        productSku: r.productSku,
        variantSku: r.variantSku,
        unitCostPaise: r.unitCostPaise,
        unit: r.unit,
        moqQty: r.moqQty,
        notes: r.notes,
      })),
      createdAt: existing?.createdAt ?? Date.now(),
      updatedAt: Date.now(),
      isDemo: existing?.isDemo ?? false,
    };
    await this.data.set(COLLECTIONS.suppliers, doc.id, doc);
    return doc;
  }

  /**
   * Status change (activate / seasonal pause). Touches ONLY the status field —
   * purchases keep their supplierId linkage and historical records are never touched.
   */
  async setStatus(id: string, status: SupplierStatus): Promise<SupplierDoc> {
    const existing = await this.get(id);
    if ((existing.status ?? "active") === status) return existing;
    return this.data.update<SupplierDoc>(COLLECTIONS.suppliers, id, { status, updatedAt: Date.now() });
  }

  /* --------------------------- suppliers console --------------------------- */

  /**
   * Paginated supplier ledger joined with REAL purchase history (from the purchases
   * collection) and catalogue category context. Summary metrics are computed over
   * the SAME filtered scope as the rows, so cards and table can never disagree.
   */
  async ledger(q: SupplierLedgerQueryDto): Promise<SupplierLedgerPage> {
    const now = Date.now();
    const monthStart = istMonthStart(now);
    const [suppliers, purchases, products, categories] = await Promise.all([
      this.data.list<SupplierDoc>(COLLECTIONS.suppliers, { limit: 2000 }),
      this.data.list<PurchaseDoc>(COLLECTIONS.purchases, {
        orderBy: [{ field: "createdAt", direction: "desc" }],
        limit: 5000,
      }),
      this.data.list<ProductDoc>(COLLECTIONS.products, { limit: 5000 }),
      this.data.list<CategoryDoc>(COLLECTIONS.categories, { limit: 1000 }),
    ]);

    const productBySku = new Map(products.map((p) => [p.sku, p]));
    const categoryById = new Map(categories.map((c) => [c.id, c]));

    // Purchase rollup per supplier — newest purchases first, so "last consignment"
    // is the first hit per supplier; totals accumulate over every record.
    const stats = new Map<string, { count: number; lastAt: number | null; lastRef: string | null; lastValue: number | null; totalValue: number }>();
    for (const p of purchases) {
      // New purchases carry an authoritative total (incl. discount/tax); legacy docs
      // fall back to the items math so the rollup stays meaningful for old records.
      const value = p.totalPaise ?? p.items.reduce((sum, i) => sum + i.unitCostPaise * i.qtyOrdered, 0);
      const s = stats.get(p.supplierId) ?? { count: 0, lastAt: null, lastRef: null, lastValue: null, totalValue: 0 };
      s.count += 1;
      if (s.lastAt === null) {
        s.lastAt = p.createdAt;
        s.lastRef = p.reference;
        s.lastValue = value;
      }
      s.totalValue += value;
      stats.set(p.supplierId, s);
    }

    const rows: SupplierLedgerRow[] = suppliers.map((s) => {
      // Legacy documents predate type/status — render them with the documented fallbacks.
      const type = s.type ?? "other";
      const status: SupplierStatus = s.status ?? "active";
      const rates = s.rates ?? [];
      const linkedCategories: string[] = [];
      const seenCategories = new Set<string>();
      for (const sku of s.productSkus) {
        const product = productBySku.get(sku);
        if (!product || seenCategories.has(product.categoryId)) continue;
        seenCategories.add(product.categoryId);
        linkedCategories.push(categoryById.get(product.categoryId)?.name ?? "Unfiled");
      }
      const st = stats.get(s.id);
      const displayLocation =
        [s.city, s.state].filter(Boolean).join(", ") || s.location || undefined;
      return {
        id: s.id,
        name: s.name,
        type,
        contactPerson: s.contactPerson,
        phone: s.phone,
        email: s.email,
        city: s.city,
        state: s.state,
        location: displayLocation,
        status,
        village: s.village,
        pincode: s.pincode,
        paymentTerms: s.paymentTerms,
        licenseNumber: s.licenseNumber,
        notes: s.notes,
        productSkus: s.productSkus,
        rates,
        categoryNames: linkedCategories,
        createdAt: s.createdAt,
        updatedAt: s.updatedAt,
        purchaseCount: st?.count ?? 0,
        lastPurchaseAt: st?.lastAt ?? null,
        lastPurchaseReference: st?.lastRef ?? null,
        lastPurchaseValuePaise: st?.lastValue ?? null,
        totalPurchaseValuePaise: st?.totalValue ?? 0,
      };
    });

    let filtered = rows;
    if (q.type) filtered = filtered.filter((r) => r.type === q.type);
    if (q.status !== "all") filtered = filtered.filter((r) => r.status === q.status);
    if (q.categoryId) {
      const catName = categoryById.get(q.categoryId)?.name;
      filtered = filtered.filter((r) =>
        r.productSkus.some((sku) => productBySku.get(sku)?.categoryId === q.categoryId) ||
        (catName ? r.categoryNames.includes(catName) : false),
      );
    }
    if (q.search) {
      const needle = q.search.toLowerCase();
      filtered = filtered.filter((r) =>
        [
          r.name,
          r.contactPerson ?? "",
          r.phone ?? "",
          r.email ?? "",
          r.city ?? "",
          r.state ?? "",
          r.location ?? "",
          r.village ?? "",
          r.productSkus.join(" "),
          r.rates.map((rate) => rate.label).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle),
      );
    }

    const summary: SupplierLedgerSummary = {
      totalSuppliers: filtered.length,
      activeSuppliers: filtered.filter((r) => r.status === "active").length,
      inactiveSuppliers: filtered.filter((r) => r.status === "inactive").length,
      categoryCount: new Set(
        filtered.flatMap((r) =>
          r.productSkus.map((sku) => productBySku.get(sku)?.categoryId).filter((id): id is string => Boolean(id)),
        ),
      ).size,
      addedThisMonth: filtered.filter((r) => r.createdAt >= monthStart).length,
      withPurchases: filtered.filter((r) => r.purchaseCount > 0).length,
    };

    switch (q.sort) {
      case "name_asc":
        filtered.sort((a, b) => a.name.localeCompare(b.name));
        break;
      case "recent_purchase":
        filtered.sort(
          (a, b) => (b.lastPurchaseAt ?? 0) - (a.lastPurchaseAt ?? 0) || b.createdAt - a.createdAt,
        );
        break;
      case "value_desc":
        filtered.sort((a, b) => b.totalPurchaseValuePaise - a.totalPurchaseValuePaise || b.createdAt - a.createdAt);
        break;
      default:
        filtered.sort((a, b) => b.createdAt - a.createdAt);
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

  async archive(id: string): Promise<void> {
    await this.get(id);
    await this.data.update(COLLECTIONS.suppliers, id, { updatedAt: Date.now() });
  }
}

@Injectable()
export class PurchasesService {
  constructor(
    @Inject(DATA_CLIENT) private readonly data: DataClient,
    private readonly suppliers: SuppliersService,
    private readonly inventory: InventoryService,
    private readonly audit: AuditService,
  ) {}

  /* ------------------------------ shared helpers ----------------------------- */

  /** Authoritative server-side money for a set of lines. Integer paise throughout. */
  private computeTotals(items: PurchaseItem[]): { subTotal: number; discountTotal: number; taxTotal: number; total: number } {
    let subTotal = 0;
    let discountTotal = 0;
    let taxTotal = 0;
    for (const it of items) {
      const gross = it.unitCostPaise * it.qtyOrdered;
      const discount = Math.min(it.discountPaise ?? 0, gross);
      const tax = Math.round(((gross - discount) * (it.taxPercent ?? 0)) / 100);
      subTotal += gross;
      discountTotal += discount;
      taxTotal += tax;
      it.lineTotalPaise = gross - discount + tax;
    }
    return { subTotal, discountTotal, taxTotal, total: subTotal - discountTotal + taxTotal };
  }

  /** Total of a purchase, with the legacy fallback (docs written before totals existed). */
  private totalOf(p: PurchaseDoc): number {
    if (typeof p.totalPaise === "number") return p.totalPaise;
    return p.items.reduce((sum, i) => sum + i.unitCostPaise * i.qtyOrdered, 0);
  }

  /** Paid amount of a purchase, with the legacy fallback (no payments array → 0). */
  private paidOf(p: PurchaseDoc): number {
    if (typeof p.paidPaise === "number") return p.paidPaise;
    return (p.payments ?? []).reduce((sum, x) => sum + x.amountPaise, 0);
  }

  /** Settlement state derived from persisted payment records only. */
  private paymentStatusOf(p: PurchaseDoc): PurchasePaymentStatus {
    if (p.status === "cancelled") return "unpaid";
    const paid = this.paidOf(p);
    const total = this.totalOf(p);
    if (total > 0 && paid >= total) return "paid";
    if (paid > 0) return "partially_paid";
    return "unpaid";
  }

  /* --------------------------------- reads ---------------------------------- */

  async list(filters: { supplierId?: string; status?: PurchaseStatus } = {}): Promise<PurchaseDoc[]> {
    const where: { field: string; op: "=="; value: unknown }[] = [];
    if (filters.supplierId) where.push({ field: "supplierId", op: "==", value: filters.supplierId });
    if (filters.status) where.push({ field: "status", op: "==", value: filters.status });
    return this.data.list<PurchaseDoc>(COLLECTIONS.purchases, {
      where,
      orderBy: [{ field: "createdAt", direction: "desc" }],
      limit: 500,
    });
  }

  async get(id: string): Promise<PurchaseDoc> {
    const doc = await this.data.get<PurchaseDoc>(COLLECTIONS.purchases, id);
    if (!doc) throw notFound("Purchase not found");
    return doc;
  }

  /* ------------------------------ create / edit ------------------------------ */

  /**
   * Create a purchase, or update one while it is still a draft. Money is ALWAYS
   * recomputed server-side — client-supplied totals are never trusted. Neither
   * creating, editing nor confirming ever touches inventory: stock exists only
   * after goods are actually received.
   */
  async upsert(dto: PurchaseUpsertInput, actor?: AuthPrincipal, id?: string): Promise<PurchaseDoc> {
    const supplier = await this.suppliers.get(dto.supplierId); // must exist
    const existing = id ? await this.data.get<PurchaseDoc>(COLLECTIONS.purchases, id) : null;
    if (id && !existing) throw notFound("Purchase not found");
    if (existing && existing.status !== "draft") {
      throw conflict("Only draft purchases can be edited — confirmed orders are immutable.");
    }

    // Variant references must exist and be receivable (archived variants can never
    // be received — the inventory layer refuses movements on them).
    const resolved: PurchaseItem[] = [];
    for (const it of dto.items) {
      const variants = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
        where: [{ field: "sku", op: "==", value: it.variantSku }],
        limit: 1,
      });
      const variant = variants[0];
      if (!variant) throw badRequest(`Unknown catalogue SKU: ${it.variantSku}`);
      if (variant.status === "archived") throw badRequest(`Variant ${it.variantSku} is archived and cannot be purchased`);
      const products = await this.data.list<ProductDoc>(COLLECTIONS.products, {
        where: [{ field: "sku", op: "==", value: variant.sku.replace(/-[^-]+$/, "") }],
        limit: 1,
      });
      // Fall back to productId lookup when the SKU-suffix heuristic misses.
      const product = products[0] ?? (await this.data.get<ProductDoc>(COLLECTIONS.products, variant.productId));
      resolved.push({
        variantSku: it.variantSku,
        description: it.description ?? "",
        qtyOrdered: it.qtyOrdered,
        qtyReceived: it.qtyReceived ?? 0,
        unitCostPaise: it.unitCostPaise,
        unit: it.unit ?? "unit",
        discountPaise: it.discountPaise ?? 0,
        taxPercent: it.taxPercent ?? 0,
        productId: variant.productId,
        productName: product?.name ?? "Unlinked product",
        variantPackLabel: variant.packLabel,
      });
    }

    // Human-supplied references must stay unique — auto-generated ones already are.
    if (!existing && dto.reference) {
      const duplicates = await this.data.list<PurchaseDoc>(COLLECTIONS.purchases, {
        where: [{ field: "reference", op: "==", value: dto.reference.trim() }],
        limit: 1,
      });
      if (duplicates[0]) throw conflict(`A purchase with reference ${dto.reference.trim()} already exists`);
    }

    const totals = this.computeTotals(resolved);
    const now = Date.now();
    // Edits always stay drafts — draft→ordered goes through the dedicated confirm
    // transition so the state machine (and its audit trail) can never be bypassed.
    const status: PurchaseStatus = existing ? "draft" : (dto.status ?? "draft");
    const reference = existing?.reference ?? (await this.generateReference(dto.reference));

    const doc: PurchaseDoc = {
      id: id ?? newId("pur"),
      supplierId: dto.supplierId,
      reference,
      status,
      items: resolved,
      notes: dto.notes,
      createdByUid: existing?.createdByUid ?? actor?.uid ?? "system",
      createdByName: existing?.createdByName ?? actor?.displayName,
      purchaseDate: dto.purchaseDate ?? existing?.purchaseDate ?? now,
      expectedDeliveryDate: dto.expectedDeliveryDate ?? existing?.expectedDeliveryDate ?? null,
      supplierInvoiceNumber: dto.supplierInvoiceNumber || existing?.supplierInvoiceNumber || undefined,
      supplierInvoiceDate: dto.supplierInvoiceDate ?? existing?.supplierInvoiceDate ?? null,
      internalNotes: dto.internalNotes ?? dto.notes,
      subTotalPaise: totals.subTotal,
      discountTotalPaise: totals.discountTotal,
      taxTotalPaise: totals.taxTotal,
      totalPaise: totals.total,
      paidPaise: existing?.paidPaise ?? 0,
      paymentStatus: this.paymentStatusOf({ ...(existing ?? {}), totalPaise: totals.total, status } as PurchaseDoc),
      payments: existing?.payments ?? [],
      receipts: existing?.receipts ?? [],
      createdAt: existing?.createdAt ?? now,
      updatedAt: now,
      isDemo: existing?.isDemo ?? false,
    };
    // keep supplier name resolved for ledger honesty (supplier must exist — validated above)
    void supplier;
    await this.data.set(COLLECTIONS.purchases, doc.id, doc);
    return doc;
  }

  /**
   * Human-friendly PO reference: PUR-<year>-<seq>, seq = max existing for the year + 1.
   * An explicitly supplied reference is honoured (uniqueness enforced by the caller's
   * duplicate check below).
   */
  private async generateReference(supplied?: string): Promise<string> {
    if (supplied && supplied.trim().length >= 2) return supplied.trim();
    const year = new Date().getFullYear();
    const all = await this.data.list<PurchaseDoc>(COLLECTIONS.purchases, { limit: 5000 });
    const prefix = `PUR-${year}-`;
    let max = 0;
    for (const p of all) {
      if (!p.reference.startsWith(prefix)) continue;
      const n = Number(p.reference.slice(prefix.length));
      if (Number.isInteger(n) && n > max) max = n;
    }
    return `${prefix}${String(max + 1).padStart(3, "0")}`;
  }

  /* ------------------------- state: confirm / cancel ------------------------- */

  /** Draft → Ordered. A pure status transition — inventory is untouched. */
  async confirm(id: string, actor: AuthPrincipal): Promise<PurchaseDoc> {
    return this.data.runTransaction(async (tx) => {
      const purchase = await tx.get<PurchaseDoc>(COLLECTIONS.purchases, id);
      if (!purchase) throw notFound("Purchase not found");
      if (purchase.status !== "draft") throw conflict("Only draft purchases can be confirmed");
      const updated: PurchaseDoc = { ...purchase, status: "ordered", confirmedAt: Date.now(), updatedAt: Date.now() };
      tx.set(COLLECTIONS.purchases, id, updated);
      return updated;
    }).then(async (updated) => {
      await this.audit.record({
        actor,
        action: "purchase.confirm",
        targetType: "purchase",
        targetId: id,
        summary: `Purchase ${updated.reference} confirmed as ordered (${updated.items.length} lines, ${this.paidOf(updated) > 0 ? "paid" : "unpaid"} state preserved)`,
      });
      return updated;
    });
  }

  /**
   * Cancel a purchase. Preserves every historical record: receipts, payments and any
   * stock already received are NEVER rolled back — cancellation only voids the
   * outstanding balance. Fully received purchases are closed, not cancellable.
   */
  async cancel(id: string, reason: string | undefined, actor: AuthPrincipal): Promise<PurchaseDoc> {
    if (reason && reason.trim().length < 3) throw badRequest("A cancellation reason needs at least 3 characters");
    const updated = await this.data.runTransaction(async (tx) => {
      const purchase = await tx.get<PurchaseDoc>(COLLECTIONS.purchases, id);
      if (!purchase) throw notFound("Purchase not found");
      if (purchase.status === "cancelled") return purchase; // idempotent
      if (purchase.status === "received") throw conflict("A fully received purchase cannot be cancelled");
      const next: PurchaseDoc = {
        ...purchase,
        status: "cancelled",
        cancelledAt: Date.now(),
        cancelReason: reason?.trim(),
        updatedAt: Date.now(),
      };
      tx.set(COLLECTIONS.purchases, id, next);
      return next;
    });
    await this.audit.record({
      actor,
      action: "purchase.cancel",
      targetType: "purchase",
      targetId: id,
      summary: `Purchase ${updated.reference} cancelled${reason ? ` — ${reason.trim()}` : ""}; received stock and history preserved`,
    });
    return updated;
  }

  /* --------------------------- receiving (critical) --------------------------- */

  /**
   * Record goods received against a purchase.
   *
   * ATOMICITY + IDEMPOTENCY CONTRACT (the heart of the inventory rule):
   *  1. `receiptId` is a client-generated idempotency key. If a receipt with the same
   *     id is already persisted, the call is a replay — return the purchase untouched
   *     (no stock change, no duplicate event).
   *  2. Everything else happens inside ONE DataClient transaction: outstanding checks,
   *     variant stock updates, inventory movements, the receipt event, the received
     *     counters and the derived status. A failure anywhere rolls the whole thing back,
   *     so the purchase can never be marked received while inventory stayed unchanged,
   *     and inventory can never increase without its receipt record.
   *  3. Inventory increases by exactly the confirmed received quantities — never by
   *     the ordered quantities, never on create/confirm/open-form.
   */
  async receive(purchaseId: string, dto: PurchaseReceiveDto, actor: AuthPrincipal): Promise<PurchaseDoc> {
    // Resolve variant ids by SKU up-front (single-field equality reads; ids are stable).
    // Inside the transaction the variants are re-read for their CURRENT stock state.
    const variantIdBySku = new Map<string, string>();
    for (const sku of new Set(dto.receipts.map((r) => r.variantSku))) {
      const found = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
        where: [{ field: "sku", op: "==", value: sku }],
        limit: 1,
      });
      if (found[0]) variantIdBySku.set(sku, found[0].id);
    }

    const outcome = await this.data.runTransaction(async (tx) => {
      const purchase = await tx.get<PurchaseDoc>(COLLECTIONS.purchases, purchaseId);
      if (!purchase) throw notFound("Purchase not found");

      // Idempotent replay: the receipt id is already persisted — return as-is.
      if (purchase.receipts?.some((r) => r.id === dto.receiptId)) {
        return { purchase, replay: true as const };
      }

      if (purchase.status === "draft") throw badRequest("Confirm the purchase order before receiving goods");
      if (purchase.status === "cancelled") throw badRequest("Cannot receive a cancelled purchase");
      if (purchase.status === "received") throw badRequest("Purchase is already fully received");

      // Merge duplicate SKUs within the payload, then validate against the latest
      // persisted outstanding quantities.
      const qtyBySku = new Map<string, number>();
      for (const r of dto.receipts) {
        qtyBySku.set(r.variantSku, (qtyBySku.get(r.variantSku) ?? 0) + r.qty);
      }
      const items = purchase.items.map((i) => ({ ...i }));
      for (const [sku, qty] of qtyBySku) {
        const item = items.find((i) => i.variantSku === sku);
        if (!item) throw badRequest(`Purchase does not include ${sku}`);
        const outstanding = item.qtyOrdered - item.qtyReceived;
        if (outstanding <= 0) throw conflict(`${sku} has no outstanding quantity on this purchase`);
        if (qty > outstanding) throw conflict(`Receiving ${qty} of ${sku} exceeds the outstanding ${outstanding}`);
      }

      // Apply stock + movements (same transaction — atomic with the purchase update).
      const movementIds: string[] = [];
      for (const [sku, qty] of qtyBySku) {
        const variantId = variantIdBySku.get(sku);
        if (!variantId) throw badRequest(`Unknown catalogue SKU: ${sku}`);
        const variant = await tx.get<ProductVariantDoc>(COLLECTIONS.productVariants, variantId);
        if (!variant) throw notFound(`Variant ${sku} not found`);
        if (variant.status === "archived") throw badRequest(`Variant ${sku} is archived — stock cannot be received onto it`);

        const newStock = variant.stockOnHand + qty;
        tx.update(COLLECTIONS.productVariants, variantId, { stockOnHand: newStock });

        const movementId = newId("mv");
        movementIds.push(movementId);
        const movement = {
          id: movementId,
          variantId: variant.id,
          variantSku: variant.sku,
          type: "received",
          qtyDelta: qty,
          reservedDelta: 0,
          resultingStockOnHand: newStock,
          resultingReservedQty: variant.reservedQty,
          reason: `Purchase ${purchase.reference} — goods received (${dto.receiptId.slice(0, 12)})`,
          referenceType: "purchase",
          referenceId: purchase.id,
          performedByUid: actor.uid,
          performedByName: actor.displayName,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          isDemo: false,
        };
        tx.set(COLLECTIONS.inventoryMovements, movementId, movement);
      }

      // Persist the receipt event + received counters + derived status.
      const receipt = {
        id: dto.receiptId,
        receivedAt: Date.now(),
        receivedByUid: actor.uid,
        receivedByName: actor.displayName,
        lines: [...qtyBySku.entries()].map(([variantSku, qty]) => ({
          variantSku,
          qty,
          unit: items.find((i) => i.variantSku === variantSku)?.unit,
        })),
        note: dto.note,
        movementIds,
      };
      for (const [sku, qty] of qtyBySku) {
        const item = items.find((i) => i.variantSku === sku)!;
        item.qtyReceived += qty;
      }
      const fullyReceived = items.every((i) => i.qtyReceived >= i.qtyOrdered);
      const updated: PurchaseDoc = {
        ...purchase,
        items,
        receipts: [...(purchase.receipts ?? []), receipt],
        status: fullyReceived ? "received" : "partially_received",
        updatedAt: Date.now(),
      };
      tx.set(COLLECTIONS.purchases, purchaseId, updated);
      return { purchase: updated, replay: false as const };
    });

    if (!outcome.replay) {
      await this.audit.record({
        actor,
        action: "purchase.receive",
        targetType: "purchase",
        targetId: purchaseId,
        summary: `Goods received on ${outcome.purchase.reference}: ${dto.receipts
          .map((r) => `${r.qty} × ${r.variantSku}`)
          .join(", ")} → stock updated`,
      });
    }
    return outcome.purchase;
  }

  /* ------------------------------- payments --------------------------------- */

  /**
   * Record a real supplier payment. Settlement is ALWAYS derived from these persisted
   * records — receiving goods never marks a purchase paid, and no payment is invented.
   */
  async recordPayment(purchaseId: string, dto: PurchasePaymentDto, actor: AuthPrincipal): Promise<PurchaseDoc> {
    const updated = await this.data.runTransaction(async (tx) => {
      const purchase = await tx.get<PurchaseDoc>(COLLECTIONS.purchases, purchaseId);
      if (!purchase) throw notFound("Purchase not found");
      if (purchase.status === "draft") throw badRequest("Payments can only be recorded on a confirmed purchase");
      if (purchase.status === "cancelled") throw badRequest("Cannot record payments on a cancelled purchase");

      const total = this.totalOf(purchase);
      const alreadyPaid = this.paidOf(purchase);
      const newPaid = alreadyPaid + dto.amountPaise;
      if (newPaid > total) {
        throw conflict(`Payment exceeds the outstanding balance — ${((total - alreadyPaid) / 100).toFixed(2)} INR due`);
      }

      const payment: PurchasePaymentDoc = {
        id: newId("pay"),
        amountPaise: dto.amountPaise,
        method: dto.method,
        reference: dto.reference,
        paidAt: dto.paidAt ?? Date.now(),
        recordedByUid: actor.uid,
        recordedByName: actor.displayName,
        note: dto.note,
      };
      const payments = [...(purchase.payments ?? []), payment];
      const paymentStatus: PurchasePaymentStatus = newPaid >= total && total > 0 ? "paid" : "partially_paid";
      const next: PurchaseDoc = {
        ...purchase,
        payments,
        paidPaise: newPaid,
        paymentStatus,
        updatedAt: Date.now(),
      };
      tx.set(COLLECTIONS.purchases, purchaseId, next);
      return next;
    });
    await this.audit.record({
      actor,
      action: "purchase.payment",
      targetType: "purchase",
      targetId: purchaseId,
      summary: `Payment of ₹${(dto.amountPaise / 100).toFixed(2)} (${dto.method}) recorded on ${updated.reference} — ${updated.paymentStatus}`,
    });
    return updated;
  }

  /* --------------------------- purchases console ---------------------------- */

  /**
   * Paginated purchases ledger joined with supplier display data. Summary metrics are
   * computed over the SAME filtered scope as the rows, so cards and table never disagree.
   * Money always comes from the persisted purchase records (legacy docs fall back to
   * item math); nothing here is hard-coded.
   */
  async ledger(q: PurchaseLedgerQueryDto): Promise<PurchaseLedgerPage> {
    const [purchases, suppliers] = await Promise.all([
      this.data.list<PurchaseDoc>(COLLECTIONS.purchases, { limit: 5000 }),
      this.data.list<SupplierDoc>(COLLECTIONS.suppliers, { limit: 2000 }),
    ]);
    const supplierById = new Map(suppliers.map((s) => [s.id, s]));

    const rows: PurchaseLedgerRow[] = purchases.map((p) => {
      const supplier = supplierById.get(p.supplierId);
      const subTotal =
        p.subTotalPaise ?? p.items.reduce((sum, i) => sum + i.unitCostPaise * i.qtyOrdered, 0);
      const discountTotal = p.discountTotalPaise ?? 0;
      const taxTotal = p.taxTotalPaise ?? 0;
      const total = this.totalOf(p);
      const paid = this.paidOf(p);
      const orderedUnits = p.items.reduce((sum, i) => sum + i.qtyOrdered, 0);
      const receivedUnits = p.items.reduce((sum, i) => sum + i.qtyReceived, 0);
      const preview = p.items
        .slice(0, 2)
        .map((i) => i.description || i.productName || i.variantSku)
        .join(", ");
      return {
        id: p.id,
        reference: p.reference,
        status: p.status,
        paymentStatus: this.paymentStatusOf(p),
        supplierId: p.supplierId,
        purchaseDate: p.purchaseDate ?? p.createdAt,
        expectedDeliveryDate: p.expectedDeliveryDate ?? null,
        supplierInvoiceNumber: p.supplierInvoiceNumber,
        supplierName: supplier?.name ?? "Unknown supplier",
        supplierLocation:
          [supplier?.city, supplier?.state].filter(Boolean).join(", ") || supplier?.location || undefined,
        supplierStatus: supplier?.status ?? "active",
        itemCount: p.items.length,
        itemsPreview: p.items.length > 2 ? `${preview} +${p.items.length - 2} more` : preview,
        orderedUnits,
        receivedUnits,
        unitLabel: p.items[0]?.unit ?? "unit",
        subTotalPaise: subTotal,
        discountTotalPaise: discountTotal,
        taxTotalPaise: taxTotal,
        totalPaise: total,
        paidPaise: paid,
        outstandingPaise: Math.max(0, total - paid),
        createdByName: p.createdByName,
        createdAt: p.createdAt,
        updatedAt: p.updatedAt,
      };
    });

    let filtered = rows;
    if (q.supplierId) filtered = filtered.filter((r) => r.supplierId === q.supplierId);
    if (q.status !== "all") filtered = filtered.filter((r) => r.status === q.status);
    if (q.paymentStatus !== "all") filtered = filtered.filter((r) => r.paymentStatus === q.paymentStatus);
    if (q.dateFrom !== undefined) filtered = filtered.filter((r) => r.purchaseDate >= q.dateFrom!);
    if (q.dateTo !== undefined) filtered = filtered.filter((r) => r.purchaseDate <= q.dateTo!);
    if (q.search) {
      const needle = q.search.toLowerCase();
      filtered = filtered.filter((r) => {
        const p = purchases.find((x) => x.id === r.id)!;
        return [
          r.reference,
          r.supplierName,
          r.supplierInvoiceNumber ?? "",
          r.itemsPreview,
          p.items.map((i) => `${i.variantSku} ${i.description} ${i.productName ?? ""}`).join(" "),
        ]
          .join(" ")
          .toLowerCase()
          .includes(needle);
      });
    }

    // Money metrics count COMMITTED procurement only — drafts are unsent quotations and
    // cancelled orders are void, so neither belongs in spend/outstanding.
    const committed = filtered.filter((r) => r.status !== "cancelled" && r.status !== "draft");
    const pending = filtered.filter((r) => r.status === "ordered" || r.status === "partially_received");
    const docById = new Map(purchases.map((p) => [p.id, p]));

    // Most urgent pending consignment: partially received first, then earliest due date
    // (missing dates last), then oldest purchase — all real values, null when none pending.
    let priority: PurchaseLedgerSummary["priority"] = null;
    const candidates = [...pending].sort((a, b) => {
      const partialScore = (r: PurchaseLedgerRow) => (r.status === "partially_received" ? 0 : 1);
      const due = (r: PurchaseLedgerRow) => r.expectedDeliveryDate ?? Number.MAX_SAFE_INTEGER;
      return partialScore(a) - partialScore(b) || due(a) - due(b) || a.purchaseDate - b.purchaseDate;
    });
    const top = candidates[0];
    if (top) {
      const doc = docById.get(top.id)!;
      const outstandingUnits = doc.items.reduce((sum, i) => sum + Math.max(0, i.qtyOrdered - i.qtyReceived), 0);
      priority = {
        id: top.id,
        reference: top.reference,
        supplierName: top.supplierName,
        outstandingUnits,
        unitLabel: top.unitLabel,
        expectedDeliveryDate: top.expectedDeliveryDate,
        partiallyReceived: top.status === "partially_received",
      };
    }

    const summary: PurchaseLedgerSummary = {
      totalPurchases: filtered.length,
      draftCount: filtered.filter((r) => r.status === "draft").length,
      orderedCount: filtered.filter((r) => r.status === "ordered").length,
      partiallyReceivedCount: filtered.filter((r) => r.status === "partially_received").length,
      pendingDeliveries: pending.length,
      goodsReceived: filtered.filter((r) => r.status === "received").length,
      cancelledCount: filtered.filter((r) => r.status === "cancelled").length,
      spendPaise: committed.reduce((sum, r) => sum + r.totalPaise, 0),
      paidPaise: committed.reduce((sum, r) => sum + r.paidPaise, 0),
      outstandingPaise: committed.reduce((sum, r) => sum + r.outstandingPaise, 0),
      priority,
    };

    switch (q.sort) {
      case "oldest_first":
        filtered.sort((a, b) => a.purchaseDate - b.purchaseDate || a.createdAt - b.createdAt);
        break;
      case "value_desc":
        filtered.sort((a, b) => b.totalPaise - a.totalPaise || b.purchaseDate - a.purchaseDate);
        break;
      default:
        filtered.sort((a, b) => b.purchaseDate - a.purchaseDate || b.createdAt - a.createdAt);
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
}
