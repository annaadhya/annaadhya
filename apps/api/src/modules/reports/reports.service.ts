/**
 * ReportsService — server-generated Excel exports via ExcelJS.
 *  - every export is permission-checked (reports:export) at the controller
 *  - demo records are excluded unless explicitly requested AND allowed by settings
 *  - demo exports are visibly labelled
 *  - sync exports are capped; larger datasets must move to the export-job queue (documented)
 */
import { Inject, Injectable } from "@nestjs/common";
import type * as ExcelJS from "exceljs";
import { COLLECTIONS, type CustomerActivityFilter, type CustomerDirectorySort, type CustomerDoc, type ExpenseDoc, type InventoryMovementDoc, type NewsletterSubscriberDoc, type OrderDoc, type ProductVariantDoc, type PurchaseDoc, type SupplierDoc, type ProductDoc, type SettingsDoc } from "@annaadhya/contracts";
import { badRequest, type DataClient } from "@annaadhya/data-core";
import { formatINR, formatDateIN } from "@annaadhya/utils";
import { DATA_CLIENT } from "../../data/data.module";
import { SettingsService } from "../settings/settings.service";
import {
  aggregateOrdersByCustomer,
  matchesDirectoryFilters,
  sortDirectoryRows,
} from "../customers/customers.service";
import { normalizeExpense } from "../expenses/expenses.service";

/** "partially_paid" → "Partially paid" for spreadsheet cells. */
function humanizeEnum(value: string): string {
  return value
    .split(/[ _-]+/)
    .map((p) => p.charAt(0).toUpperCase() + p.slice(1))
    .join(" ");
}

export type ExportType =
  | "products"
  | "variants"
  | "orders"
  | "customers"
  | "inventory_balances"
  | "inventory_movements"
  | "suppliers"
  | "purchases"
  | "expenses"
  | "sales_summary"
  | "newsletter_subscribers";

export const EXPORT_TYPES: ExportType[] = [
  "products",
  "variants",
  "orders",
  "customers",
  "inventory_balances",
  "inventory_movements",
  "suppliers",
  "purchases",
  "expenses",
  "sales_summary",
  "newsletter_subscribers",
];

interface ExportContext {
  includeDemo: boolean;
  from?: number;
  to?: number;
  /** Optional order-list filters so an export matches what the caller sees on screen. */
  orderFilters?: {
    status?: OrderDoc["status"];
    paymentStatus?: OrderDoc["paymentStatus"];
    paymentProvider?: OrderDoc["paymentProvider"];
    search?: string;
  };
  /** Customer-directory filters so the Customers export matches the console's screen. */
  customerFilters?: {
    search?: string;
    activity?: CustomerActivityFilter;
    status?: "all" | "active" | "suspended";
    registeredFrom?: number;
    registeredTo?: number;
    sort?: CustomerDirectorySort;
  };
}

@Injectable()
export class ReportsService {
  constructor(
    @Inject(DATA_CLIENT) private readonly data: DataClient,
    private readonly settings: SettingsService,
  ) {}

  /**
   * ExcelJS is loaded lazily on first export: it is a heavy CommonJS dependency that
   * must not execute during serverless cold start (bundle import cost + fragile
   * dynamic requires). Type annotations keep the static type-only import.
   */
  private async newWorkbook(): Promise<ExcelJS.Workbook> {
    const mod = await import("exceljs");
    const ExcelJS = ("default" in mod ? mod.default : mod) as typeof mod;
    return new ExcelJS.Workbook();
  }

  async generate(
    type: ExportType,
    opts: {
      includeDemo?: boolean;
      from?: number;
      to?: number;
      orderFilters?: ExportContext["orderFilters"];
      customerFilters?: ExportContext["customerFilters"];
    } = {},
  ): Promise<Buffer> {
    const settings: SettingsDoc = await this.settings.get();
    const includeDemo = opts.includeDemo ?? settings.reporting.includeDemoDataByDefault;
    const ctx: ExportContext = {
      includeDemo,
      from: opts.from,
      to: opts.to,
      orderFilters: opts.orderFilters,
      customerFilters: opts.customerFilters,
    };

    const wb = await this.newWorkbook();
    wb.creator = "Annaadhya Products Admin";
    wb.created = new Date();

    switch (type) {
      case "products":
        await this.exportProducts(wb, ctx);
        break;
      case "variants":
        await this.exportVariants(wb, ctx);
        break;
      case "orders":
        await this.exportOrders(wb, ctx);
        break;
      case "customers":
        await this.exportCustomers(wb, ctx);
        break;
      case "inventory_balances":
        await this.exportInventoryBalances(wb, ctx);
        break;
      case "inventory_movements":
        await this.exportMovements(wb, ctx);
        break;
      case "suppliers":
        await this.exportSuppliers(wb, ctx);
        break;
      case "purchases":
        await this.exportPurchases(wb, ctx);
        break;
      case "expenses":
        await this.exportExpenses(wb, ctx);
        break;
      case "sales_summary":
        await this.exportSalesSummary(wb, ctx);
        break;
      case "newsletter_subscribers":
        await this.exportNewsletterSubscribers(wb, ctx);
        break;
      default:
        throw badRequest(`Unknown export type: ${type as string}`);
    }

    const buffer = await wb.xlsx.writeBuffer();
    return Buffer.from(buffer);
  }

  /* ------------------------------ sheet helpers --------------------------- */

  private styleSheet(ws: ExcelJS.Worksheet, title: string, subtitle: string, isDemo: boolean): void {
    ws.mergeCells(1, 1, 1, ws.columnCount || 8);
    const titleCell = ws.getCell(1, 1);
    titleCell.value = `${title}${isDemo ? " — DEMO DATA" : ""}`;
    titleCell.font = { bold: true, size: 14, color: { argb: "FF1E4D3B" } };
    ws.mergeCells(2, 1, 2, ws.columnCount || 8);
    const subCell = ws.getCell(2, 1);
    subCell.value =
      subtitle + (isDemo ? " (Demo records — not for financial use)" : "");
    subCell.font = { italic: true, size: 10, color: { argb: "FF666666" } };
    ws.getRow(4).font = { bold: true };
    ws.views = [{ state: "frozen", ySplit: 4 }];
  }

  private inRange(doc: { createdAt?: number; date?: number }, ctx: ExportContext): boolean {
    const t = doc.date ?? doc.createdAt;
    if (t === undefined) return true;
    if (ctx.from && t < ctx.from) return false;
    if (ctx.to && t > ctx.to) return false;
    return true;
  }

  private currencyCol(ws: ExcelJS.Worksheet, col: string): void {
    ws.getColumn(col).numFmt = '₹#,##,##0.00';
    ws.getColumn(col).width = 14;
  }

  /* --------------------------------- exports ------------------------------ */

  private async exportProducts(wb: ExcelJS.Workbook, ctx: ExportContext): Promise<void> {
    const rows = (await this.data.list<ProductDoc>(COLLECTIONS.products, { orderBy: [{ field: "createdAt", direction: "desc" }], limit: 5000 })).filter(
      (p) => (ctx.includeDemo ? true : !p.isDemo) && p.status !== "archived",
    );
    const ws = wb.addWorksheet("Products");
    ws.columns = [
      { header: "SKU", key: "sku", width: 16 },
      { header: "Name", key: "name", width: 34 },
      { header: "Category ID", key: "cat", width: 22 },
      { header: "Type", key: "type", width: 28 },
      { header: "Status", key: "status", width: 12 },
      { header: "Gift item", key: "gift", width: 10 },
      { header: "Variants", key: "variants", width: 10 },
      { header: "Created", key: "created", width: 14 },
    ];
    this.styleSheet(ws, "Product catalogue", "Live + draft products (excludes archived)", rows.some((r) => r.isDemo));
    for (const p of rows) {
      const variantCount = await this.data.count(COLLECTIONS.productVariants, [
        { field: "productId", op: "==", value: p.id },
      ]);
      ws.addRow({ sku: p.sku, name: p.name, cat: p.categoryId, type: p.typeLabel, status: p.status, gift: p.giftItem ? "yes" : "no", variants: variantCount, created: formatDateIN(p.createdAt) });
    }
  }

  private async exportVariants(wb: ExcelJS.Workbook, ctx: ExportContext): Promise<void> {
    const rows = (await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, { orderBy: [{ field: "createdAt", direction: "desc" }], limit: 10000 })).filter(
      (v) => (ctx.includeDemo ? true : !v.isDemo) && v.status !== "archived",
    );
    const ws = wb.addWorksheet("Variants");
    ws.columns = [
      { header: "Variant SKU", key: "sku", width: 22 },
      { header: "Product ID", key: "pid", width: 22 },
      { header: "Pack", key: "pack", width: 10 },
      { header: "Grams", key: "grams", width: 8 },
      { header: "Selling price", key: "price", width: 14 },
      { header: "MRP", key: "mrp", width: 14 },
      { header: "Stock on hand", key: "soh", width: 14 },
      { header: "Reserved", key: "res", width: 10 },
      { header: "Available", key: "avail", width: 12 },
      { header: "Status", key: "status", width: 12 },
    ];
    this.styleSheet(ws, "Product variants", "Prices are the authoritative server records", rows.some((r) => r.isDemo));
    for (const v of rows) {
      ws.addRow({
        sku: v.sku,
        pid: v.productId,
        pack: v.packLabel,
        grams: v.grams,
        price: formatINR(v.pricePaise),
        mrp: v.mrpPaise ? formatINR(v.mrpPaise) : "",
        soh: v.stockOnHand,
        res: v.reservedQty,
        avail: v.stockOnHand - v.reservedQty,
        status: v.status,
      });
    }
  }

  private async exportOrders(wb: ExcelJS.Workbook, ctx: ExportContext): Promise<void> {
    const f = ctx.orderFilters;
    const needle = f?.search?.toLowerCase();
    const rows = (await this.data.list<OrderDoc>(COLLECTIONS.orders, { orderBy: [{ field: "createdAt", direction: "desc" }], limit: 10000 })).filter(
      (o) =>
        (ctx.includeDemo ? true : !o.isDemo) &&
        this.inRange(o, ctx) &&
        (!f?.status || o.status === f.status) &&
        (!f?.paymentStatus || o.paymentStatus === f.paymentStatus) &&
        (!f?.paymentProvider || o.paymentProvider === f.paymentProvider) &&
        (!needle ||
          o.orderNumber.toLowerCase().includes(needle) ||
          o.customerContact.email?.toLowerCase().includes(needle) ||
          o.customerContact.phone?.includes(needle) ||
          o.customerContact.displayName.toLowerCase().includes(needle)),
    );
    const ws = wb.addWorksheet("Orders");
    ws.columns = [
      { header: "Order no", key: "no", width: 18 },
      { header: "Date", key: "date", width: 14 },
      { header: "Customer", key: "cust", width: 24 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Status", key: "status", width: 16 },
      { header: "Payment status", key: "pay", width: 14 },
      { header: "Items", key: "items", width: 8 },
      { header: "Subtotal", key: "sub", width: 14 },
      { header: "Shipping", key: "ship", width: 12 },
      { header: "Total", key: "total", width: 14 },
      { header: "Refunded", key: "ref", width: 14 },
    ];
    this.styleSheet(ws, "Orders", `Orders ${ctx.from ? `from ${formatDateIN(ctx.from)} ` : ""}to ${ctx.to ? formatDateIN(ctx.to) : "present"}`, rows.some((r) => r.isDemo));
    for (const o of rows) {
      ws.addRow({
        no: o.orderNumber,
        date: formatDateIN(o.createdAt),
        cust: o.customerContact.displayName,
        phone: o.customerContact.phone,
        status: o.status,
        pay: o.paymentStatus,
        items: o.items.reduce((n, i) => n + i.qty, 0),
        sub: formatINR(o.subtotalPaise),
        ship: formatINR(o.shippingPaise),
        total: formatINR(o.totalPaise),
        ref: o.refundPaise ? formatINR(o.refundPaise) : "",
      });
    }
  }

  private async exportCustomers(wb: ExcelJS.Workbook, ctx: ExportContext): Promise<void> {
    // Same metric pipeline as the admin directory (shared pure helpers) so the export
    // matches the screen: identical filters, identical spend/order definitions.
    const [customers, orders] = await Promise.all([
      this.data.list<CustomerDoc>(COLLECTIONS.customers, {
        orderBy: [{ field: "createdAt", direction: "desc" }],
        limit: 5000,
      }),
      this.data.list<OrderDoc>(COLLECTIONS.orders, {
        orderBy: [{ field: "createdAt", direction: "desc" }],
        limit: 1000,
      }),
    ]);
    const aggregates = aggregateOrdersByCustomer(orders);
    const f = ctx.customerFilters;
    let rows = customers
      .filter((c) => (ctx.includeDemo ? true : !c.isDemo))
      .map((c) => ({
        ...c,
        ...(aggregates.get(c.uid) ?? { orderCount: 0, completedOrderCount: 0, totalSpendPaise: 0 }),
      }))
      .filter((row) =>
        f
          ? matchesDirectoryFilters(row, row, {
              search: f.search,
              activity: f.activity ?? "all",
              status: f.status ?? "all",
              registeredFrom: f.registeredFrom,
              registeredTo: f.registeredTo,
            })
          : true,
      );
    if (f?.sort) {
      rows = sortDirectoryRows(rows, f.sort);
    }
    const ws = wb.addWorksheet("Customers");
    ws.columns = [
      { header: "Customer", key: "name", width: 26 },
      { header: "Customer ID", key: "cid", width: 24 },
      { header: "Email", key: "email", width: 30 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Status", key: "status", width: 12 },
      { header: "Sign-in methods", key: "prov", width: 22 },
      { header: "Addresses", key: "addr", width: 12 },
      { header: "Joined", key: "joined", width: 14 },
      { header: "Orders", key: "orders", width: 10 },
      { header: "Completed orders", key: "corders", width: 16 },
      { header: "Total spend", key: "spend", width: 14 },
      { header: "Last order", key: "lastorder", width: 22 },
      { header: "Marketing opt-in", key: "mkt", width: 14 },
    ];
    this.styleSheet(ws, "Customers", "Personal data — handle per privacy policy; do not share externally", rows.some((r) => r.isDemo));
    for (const c of rows) {
      ws.addRow({
        name: c.displayName,
        cid: c.id,
        email: c.email ?? "",
        phone: c.phone ?? "",
        status: c.accountStatus,
        prov: c.providers.join(", "),
        addr: c.addresses.length,
        joined: formatDateIN(c.createdAt),
        orders: c.orderCount,
        corders: c.completedOrderCount,
        spend: c.totalSpendPaise > 0 ? formatINR(c.totalSpendPaise) : "",
        lastorder: c.lastOrderAt ? `${formatDateIN(c.lastOrderAt)}${c.lastOrderNumber ? ` (${c.lastOrderNumber})` : ""}` : "",
        mkt: c.marketingOptIn ? "yes" : "no",
      });
    }
  }

  private async exportInventoryBalances(wb: ExcelJS.Workbook, _ctx: ExportContext): Promise<void> {
    const rows = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, { orderBy: [{ field: "createdAt", direction: "desc" }], limit: 10000 });
    const ws = wb.addWorksheet("Inventory");
    ws.columns = [
      { header: "Variant SKU", key: "sku", width: 22 },
      { header: "Pack", key: "pack", width: 10 },
      { header: "Stock on hand", key: "soh", width: 14 },
      { header: "Reserved", key: "res", width: 10 },
      { header: "Available", key: "avail", width: 12 },
      { header: "Low-stock threshold", key: "thr", width: 18 },
      { header: "Alert", key: "alert", width: 10 },
    ];
    this.styleSheet(ws, "Inventory balances", "Stock on hand minus reservations", rows.some((r) => r.isDemo));
    for (const v of rows) {
      const avail = v.stockOnHand - v.reservedQty;
      ws.addRow({
        sku: v.sku,
        pack: v.packLabel,
        soh: v.stockOnHand,
        res: v.reservedQty,
        avail,
        thr: v.lowStockThreshold,
        alert: avail <= v.lowStockThreshold ? "LOW" : "",
      });
    }
  }

  private async exportMovements(wb: ExcelJS.Workbook, ctx: ExportContext): Promise<void> {
    const rows = (await this.data.list<InventoryMovementDoc>(COLLECTIONS.inventoryMovements, { orderBy: [{ field: "createdAt", direction: "desc" }], limit: 20000 })).filter(
      (m) => (ctx.includeDemo ? true : !m.isDemo) && this.inRange(m, ctx),
    );
    const ws = wb.addWorksheet("Movements");
    ws.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Variant SKU", key: "sku", width: 22 },
      { header: "Type", key: "type", width: 16 },
      { header: "Stock Δ", key: "q", width: 8 },
      { header: "Reserved Δ", key: "rq", width: 10 },
      { header: "Resulting stock", key: "rs", width: 14 },
      { header: "Reason", key: "reason", width: 40 },
      { header: "Reference", key: "ref", width: 18 },
      { header: "By", key: "by", width: 16 },
    ];
    this.styleSheet(ws, "Inventory movements", "Full ledger of stock changes", rows.some((r) => r.isDemo));
    for (const m of rows) {
      ws.addRow({
        date: formatDateIN(m.createdAt),
        sku: m.variantSku,
        type: m.type,
        q: m.qtyDelta,
        rq: m.reservedDelta,
        rs: m.resultingStockOnHand,
        reason: m.reason,
        ref: m.referenceId ?? "",
        by: m.performedByName ?? "",
      });
    }
  }

  private async exportSuppliers(wb: ExcelJS.Workbook, ctx: ExportContext): Promise<void> {
    const rows = (await this.data.list<SupplierDoc>(COLLECTIONS.suppliers, { orderBy: [{ field: "createdAt", direction: "desc" }], limit: 2000 })).filter(
      (s) => (ctx.includeDemo ? true : !s.isDemo),
    );
    const ws = wb.addWorksheet("Suppliers");
    ws.columns = [
      { header: "Supplier", key: "name", width: 34 },
      { header: "Type", key: "type", width: 18 },
      { header: "Status", key: "status", width: 12 },
      { header: "Contact person", key: "contact", width: 22 },
      { header: "Location", key: "loc", width: 28 },
      { header: "Phone", key: "phone", width: 16 },
      { header: "Email", key: "email", width: 28 },
      { header: "Products", key: "skus", width: 40 },
      { header: "Rate lines", key: "rates", width: 10 },
      { header: "Lowest rate (INR)", key: "lo", width: 16 },
      { header: "Highest rate (INR)", key: "hi", width: 16 },
      { header: "Licence #", key: "lic", width: 20 },
      { header: "Notes", key: "notes", width: 50 },
    ];
    this.styleSheet(ws, "Suppliers", "Supplier directory — rates are procurement costs, not selling prices", rows.some((r) => r.isDemo));
    for (const s of rows) {
      const costs = (s.rates ?? []).map((r) => r.unitCostPaise);
      ws.addRow({
        name: s.name,
        type: s.type ?? "other",
        status: s.status ?? "active",
        contact: s.contactPerson ?? "",
        loc: [s.city, s.state].filter(Boolean).join(", ") || (s.location ?? ""),
        phone: s.phone ?? "",
        email: s.email ?? "",
        skus: s.productSkus.join(", "),
        rates: (s.rates ?? []).length,
        lo: costs.length ? Math.min(...costs) / 100 : "",
        hi: costs.length ? Math.max(...costs) / 100 : "",
        lic: s.licenseNumber ?? "",
        notes: s.notes ?? "",
      });
    }
  }

  private async exportPurchases(wb: ExcelJS.Workbook, ctx: ExportContext): Promise<void> {
    const rows = (await this.data.list<PurchaseDoc>(COLLECTIONS.purchases, { orderBy: [{ field: "createdAt", direction: "desc" }], limit: 5000 })).filter(
      (p) => (ctx.includeDemo ? true : !p.isDemo) && this.inRange(p, ctx),
    );
    const ws = wb.addWorksheet("Purchases");
    ws.columns = [
      { header: "Reference", key: "ref", width: 18 },
      { header: "Supplier ID", key: "sup", width: 24 },
      { header: "Status", key: "status", width: 18 },
      { header: "Lines", key: "lines", width: 8 },
      { header: "Qty ordered", key: "qo", width: 12 },
      { header: "Qty received", key: "qr", width: 12 },
      { header: "Total cost", key: "cost", width: 16 },
      { header: "Created", key: "date", width: 14 },
    ];
    this.styleSheet(ws, "Purchases", "Purchase orders and receipts", rows.some((r) => r.isDemo));
    for (const p of rows) {
      const totalCost = p.items.reduce((s, i) => s + i.qtyReceived * i.unitCostPaise, 0);
      ws.addRow({
        ref: p.reference,
        sup: p.supplierId,
        status: p.status,
        lines: p.items.length,
        qo: p.items.reduce((s, i) => s + i.qtyOrdered, 0),
        qr: p.items.reduce((s, i) => s + i.qtyReceived, 0),
        cost: formatINR(totalCost),
        date: formatDateIN(p.createdAt),
      });
    }
  }

  private async exportExpenses(wb: ExcelJS.Workbook, ctx: ExportContext): Promise<void> {
    const rows = (
      await this.data.list<ExpenseDoc>(COLLECTIONS.expenses, { orderBy: [{ field: "createdAt", direction: "desc" }], limit: 10000 })
    )
      .map(normalizeExpense) // legacy rows get the same settlement view as the console
      .filter((e) => (ctx.includeDemo ? true : !e.isDemo) && this.inRange(e, ctx));
    const ws = wb.addWorksheet("Expenses");
    ws.columns = [
      { header: "Date", key: "date", width: 14 },
      { header: "Category", key: "cat", width: 20 },
      { header: "Description", key: "desc", width: 40 },
      { header: "Payee", key: "payee", width: 24 },
      { header: "Amount", key: "amt", width: 14 },
      { header: "Status", key: "status", width: 14 },
      { header: "Paid", key: "paid", width: 14 },
      { header: "Balance", key: "balance", width: 14 },
      { header: "Method", key: "method", width: 16 },
      { header: "Reference", key: "ref", width: 20 },
      { header: "Recorded by", key: "by", width: 18 },
    ];
    this.styleSheet(ws, "Expenses", "Business expense records (settlement view matches the console)", rows.some((r) => r.isDemo));
    this.currencyCol(ws, "amt" as never);
    this.currencyCol(ws, "paid" as never);
    this.currencyCol(ws, "balance" as never);
    for (const e of rows) {
      ws.addRow({
        date: formatDateIN(e.date),
        cat: e.category,
        desc: e.description,
        payee: e.payee ?? "",
        amt: formatINR(e.amountPaise),
        status: humanizeEnum(e.status ?? "paid"),
        paid: formatINR(e.amountPaidPaise ?? 0),
        balance: formatINR(Math.max(0, e.amountPaise - (e.amountPaidPaise ?? 0))),
        method: e.paymentMethod ? humanizeEnum(e.paymentMethod) : "",
        ref: e.reference ?? "",
        by: e.createdByName ?? "",
      });
    }
  }

  private async exportSalesSummary(wb: ExcelJS.Workbook, ctx: ExportContext): Promise<void> {
    const orders = (await this.data.list<OrderDoc>(COLLECTIONS.orders, { orderBy: [{ field: "createdAt", direction: "desc" }], limit: 20000 })).filter(
      (o) => (ctx.includeDemo ? true : !o.isDemo) && this.inRange(o, ctx),
    );
    const paid = orders.filter((o) => o.paymentStatus === "succeeded");
    const gross = paid.reduce((s, o) => s + o.totalPaise, 0);
    const discounts = paid.reduce((s, o) => s + o.discountTotalPaise, 0);
    const refunds = orders.reduce((s, o) => s + o.refundPaise, 0);

    const ws = wb.addWorksheet("Summary");
    ws.columns = [
      { header: "Metric", key: "m", width: 34 },
      { header: "Value", key: "v", width: 22 },
    ];
    this.styleSheet(ws, "Sales summary", "Definitions per docs/api-specification.md", orders.some((r) => r.isDemo));
    ws.addRow({ m: "Paid orders", v: paid.length });
    ws.addRow({ m: "All orders in range", v: orders.length });
    ws.addRow({ m: "Gross sales", v: formatINR(gross) });
    ws.addRow({ m: "Discounts", v: formatINR(discounts) });
    ws.addRow({ m: "Refunds", v: formatINR(refunds) });
    ws.addRow({ m: "Net sales", v: formatINR(gross - discounts - refunds) });
    ws.addRow({ m: "Average order value", v: paid.length ? formatINR(Math.round((gross - discounts - refunds) / paid.length)) : "—" });
    ws.addRow({ m: "Profit", v: "Unavailable (requires cost data)" });
  }

  private async exportNewsletterSubscribers(wb: ExcelJS.Workbook, ctx: ExportContext): Promise<void> {
    const rows = (await this.data.list<NewsletterSubscriberDoc>(COLLECTIONS.newsletterSubscribers, { orderBy: [{ field: "createdAt", direction: "desc" }], limit: 20000 })).filter(
      (n) => (ctx.includeDemo ? true : !n.isDemo),
    );
    const ws = wb.addWorksheet("Subscribers");
    ws.columns = [
      { header: "Email", key: "email", width: 34 },
      { header: "Status", key: "status", width: 14 },
      { header: "Source", key: "src", width: 18 },
      { header: "Subscribed", key: "sub", width: 14 },
      { header: "Unsubscribed", key: "unsub", width: 14 },
    ];
    this.styleSheet(
      ws,
      "Newsletter subscribers",
      "Marketing opt-in list — personal data; import only into tools that honour unsubscribe",
      rows.some((r) => r.isDemo),
    );
    for (const n of rows) {
      ws.addRow({
        email: n.email,
        status: n.status,
        src: n.source,
        sub: formatDateIN(n.createdAt),
        unsub: n.unsubscribedAt ? formatDateIN(n.unsubscribedAt) : "",
      });
    }
  }
}
