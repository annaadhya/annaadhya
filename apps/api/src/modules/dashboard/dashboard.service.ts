/**
 * DashboardService — metric definitions are explicit and date-ranged.
 *
 * Definitions (documented in docs/api-specification.md):
 *  - gross sales        = sum of order totals for orders in range with paymentStatus succeeded (excl. refunds)
 *  - discounts          = sum of discountTotalPaise (currently 0 until campaign discounts ship)
 *  - refunds            = sum of refundPaise on refunded/refund-initiated orders in range
 *  - net sales          = gross − discounts − refunds
 *  - payments collected = sum of succeeded payment attempts in range (cash basis)
 *  - AOV                = net sales / paid order count
 *  - units sold         = sum of order-item quantities across paid orders in range (units, not listings)
 *  - status counts      = orders in range grouped by their actual lifecycle status
 *  - category sales     = paid-order line revenue grouped via the product's category (unmapped lines → "Uncategorised")
 *  - comparison         = the same definitions recomputed over the immediately preceding equivalent window
 *  - profit             = NOT CALCULATED until landed costs + expenses coverage is approved; reported as unavailable, never zero.
 *
 * Demo records are excluded from live reporting by default (settings.reporting).
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  availableQty,
  COLLECTIONS,
  ORDER_STATUSES,
  PAYMENT_STATUSES,
  type CategoryDoc,
  type OrderDoc,
  type PaymentAttemptDoc,
  type ProductDoc,
  type ProductVariantDoc,
  type SettingsDoc,
} from "@annaadhya/contracts";
import { addDays, istDateKey, startOfIstDay } from "@annaadhya/utils";
import type { DataClient } from "@annaadhya/data-core";
import { DATA_CLIENT } from "../../data/data.module";
import { SettingsService } from "../settings/settings.service";

export interface DashboardLowStockRow {
  variantId: string;
  productId: string;
  sku: string;
  name: string;
  packLabel: string;
  available: number;
  threshold: number;
}

export interface DashboardRecentOrderRow {
  id: string;
  orderNumber: string;
  customerName: string | null;
  totalPaise: number;
  status: string;
  paymentStatus: string;
  paymentProvider: string;
  createdAt: number;
}

export interface DashboardCategorySale {
  categoryId: string;
  name: string;
  revenuePaise: number;
}

export interface DashboardComparison {
  label: string;
  ordersCount: number;
  paidCount: number;
  netSalesPaise: number;
  averageOrderValuePaise: number | null;
  unitsSold: number;
}

export interface DashboardMetrics {
  range: { from: number; to: number; label: string };
  orders: { count: number; paidCount: number };
  statusCounts: Record<string, number>;
  /** Orders in range grouped by payment status — drives the honest "payment attention" card. */
  paymentStatusCounts: Record<string, number>;
  grossSalesPaise: number;
  discountsPaise: number;
  refundsPaise: number;
  netSalesPaise: number;
  paymentsCollectedPaise: number;
  averageOrderValuePaise: number | null;
  unitsSold: number;
  comparison: DashboardComparison | null;
  profitPaise: null;
  profitNote: string;
  bestsellers: { sku: string; name: string; qty: number; revenuePaise: number }[];
  categorySales: DashboardCategorySale[];
  lowStock: DashboardLowStockRow[];
  recentOrders: DashboardRecentOrderRow[];
  salesTrend: { date: string; netSalesPaise: number; orders: number }[];
  demoDataIncluded: boolean;
}

@Injectable()
export class DashboardService {
  constructor(
    @Inject(DATA_CLIENT) private readonly data: DataClient,
    @Inject(SettingsService) private readonly settings: SettingsService,
  ) {}

  /**
   * Console metrics over a window. Default window: the last `days` IST days.
   * `range.from`/`range.to` (epoch millis) override the window entirely — the Orders
   * console uses this so its summary cards share the EXACT date scope as the table
   * below them. Definitions are unchanged; only the window edges move.
   */
  async metrics(days = 30, range?: { from?: number; to?: number }, includeDemoOverride?: boolean): Promise<DashboardMetrics> {
    const settings: SettingsDoc = await this.settings.get();
    const includeDemo = includeDemoOverride ?? settings.reporting.includeDemoDataByDefault;
    const custom = range?.from !== undefined && range?.to !== undefined;
    const to = custom ? Math.max(range!.to!, range!.from! + 1) : Date.now();
    const from = custom ? range!.from! : startOfIstDay(addDays(to, -Math.max(1, days) + 1));
    // Span length drives the honest period-over-period comparison window below.
    const spanMillis = Math.max(60_000, to - from);

    const orders = (await this.data.list<OrderDoc>(COLLECTIONS.orders, {
      where: [{ field: "createdAt", op: ">=", value: from }],
      limit: 5000,
    })).filter((o) => (includeDemo ? true : !o.isDemo) && o.createdAt <= to);

    const paid = orders.filter((o) => o.paymentStatus === "succeeded");
    const grossSales = paid.reduce((s, o) => s + o.totalPaise, 0);
    const discounts = paid.reduce((s, o) => s + o.discountTotalPaise, 0);
    const refunds = orders.reduce((s, o) => s + o.refundPaise, 0);
    const netSales = grossSales - discounts - refunds;
    const unitsSold = paid.reduce((s, o) => s + o.items.reduce((n, item) => n + item.qty, 0), 0);

    const attempts = (await this.data.list<PaymentAttemptDoc>(COLLECTIONS.paymentAttempts, {
      where: [{ field: "createdAt", op: ">=", value: from }],
      limit: 5000,
    })).filter((a) => (includeDemo ? true : !a.isDemo) && a.createdAt <= to);
    const collected = attempts
      .filter((a) => a.status === "succeeded")
      .reduce((s, a) => s + a.amountPaise, 0);

    // Bestsellers by qty across paid orders
    const bySku = new Map<string, { sku: string; name: string; qty: number; revenuePaise: number }>();
    for (const o of paid) {
      for (const item of o.items) {
        const agg = bySku.get(item.sku) ?? { sku: item.sku, name: item.name, qty: 0, revenuePaise: 0 };
        agg.qty += item.qty;
        agg.revenuePaise += item.lineTotalPaise;
        bySku.set(item.sku, agg);
      }
    }
    const bestsellers = [...bySku.values()].sort((a, b) => b.qty - a.qty).slice(0, 5);

    // Category sales — paid-order line revenue grouped by the product's category.
    const [products, categories] = await Promise.all([
      this.data.list<ProductDoc>(COLLECTIONS.products, { limit: 5000 }),
      this.data.list<CategoryDoc>(COLLECTIONS.categories, { limit: 500 }),
    ]);
    const productsById = new Map(products.map((p) => [p.id, p]));
    const categoryName = new Map(categories.map((c) => [c.id, c.name]));
    const byCategory = new Map<string, DashboardCategorySale>();
    for (const o of paid) {
      for (const item of o.items) {
        const catId = productsById.get(item.productId)?.categoryId ?? "";
        const key = catId || "uncategorised";
        const agg = byCategory.get(key) ?? {
          categoryId: catId,
          name: (catId && categoryName.get(catId)) || "Uncategorised",
          revenuePaise: 0,
        };
        agg.revenuePaise += item.lineTotalPaise;
        byCategory.set(key, agg);
      }
    }
    const categorySales = [...byCategory.values()].sort((a, b) => b.revenuePaise - a.revenuePaise);

    // Low stock — published variants at or below their OWN threshold (per-variant, same
    // rule as InventoryService.lowStock), enriched with product names for the dashboard.
    const lowStockVariants = await this.data.list<ProductVariantDoc>(COLLECTIONS.productVariants, {
      where: [{ field: "status", op: "==", value: "published" }],
    });
    const lowStock: DashboardLowStockRow[] = lowStockVariants
      .map((v) => ({ variant: v, available: availableQty(v) }))
      .filter(({ variant, available }) => available <= variant.lowStockThreshold)
      .sort((a, b) => a.available - b.available)
      .slice(0, 8)
      .map(({ variant, available }) => ({
        variantId: variant.id,
        productId: variant.productId,
        sku: variant.sku,
        name: productsById.get(variant.productId)?.name ?? variant.sku,
        packLabel: variant.packLabel,
        available,
        threshold: variant.lowStockThreshold,
      }));

    // Daily IST trend — buckets keyed by the IST calendar date so every in-range order
    // lands in exactly one bucket and chart totals reconcile with the headline figures.
    const spanDays = Math.max(1, Math.ceil(spanMillis / 86_400_000));
    const trend = new Map<string, { date: string; netSalesPaise: number; orders: number }>();
    for (let i = 0; i < spanDays; i++) {
      const key = istDateKey(addDays(from, i));
      trend.set(key, { date: key, netSalesPaise: 0, orders: 0 });
    }
    for (const o of paid) {
      const bucket = trend.get(istDateKey(o.createdAt));
      if (bucket) {
        bucket.netSalesPaise += o.totalPaise - o.discountTotalPaise - o.refundPaise;
        bucket.orders += 1;
      }
    }

    // Status counts over the same in-range orders (actual lifecycle enum — no invented states).
    const statusCounts: Record<string, number> = {};
    for (const status of ORDER_STATUSES) statusCounts[status] = 0;
    for (const o of orders) statusCounts[o.status] = (statusCounts[o.status] ?? 0) + 1;

    const paymentStatusCounts: Record<string, number> = {};
    for (const s of PAYMENT_STATUSES) paymentStatusCounts[s] = 0;
    for (const o of orders) paymentStatusCounts[o.paymentStatus] = (paymentStatusCounts[o.paymentStatus] ?? 0) + 1;

    // Previous equivalent window ([from - spanMillis, from)) with identical definitions so
    // the dashboard can show honest period-over-period deltas. IST has no DST, so a raw
    // millis shift of an IST-aligned `from` lands exactly on the previous IST day boundary.
    const prevFrom = from - spanMillis;
    const prevOrders = (await this.data.list<OrderDoc>(COLLECTIONS.orders, {
      where: [{ field: "createdAt", op: ">=", value: prevFrom }],
      limit: 5000,
    })).filter((o) => o.createdAt < from && (includeDemo ? true : !o.isDemo));
    const prevPaid = prevOrders.filter((o) => o.paymentStatus === "succeeded");
    const prevNet =
      prevPaid.reduce((s, o) => s + o.totalPaise, 0) -
      prevPaid.reduce((s, o) => s + o.discountTotalPaise, 0) -
      prevPaid.reduce((s, o) => s + o.refundPaise, 0);
    const prevUnits = prevPaid.reduce((s, o) => s + o.items.reduce((n, item) => n + item.qty, 0), 0);
    const comparison: DashboardComparison = {
      label: custom ? "previous window" : `previous ${Math.max(1, days)} ${Math.max(1, days) === 1 ? "day" : "days"}`,
      ordersCount: prevOrders.length,
      paidCount: prevPaid.length,
      netSalesPaise: prevNet,
      averageOrderValuePaise: prevPaid.length > 0 ? Math.round(prevNet / prevPaid.length) : null,
      unitsSold: prevUnits,
    };

    const aov = paid.length > 0 ? Math.round(netSales / paid.length) : null;

    return {
      range: { from, to, label: custom ? "selected range" : `last ${Math.max(1, days)} ${Math.max(1, days) === 1 ? "day" : "days"}` },
      orders: { count: orders.length, paidCount: paid.length },
      statusCounts,
      paymentStatusCounts,
      grossSalesPaise: grossSales,
      discountsPaise: discounts,
      refundsPaise: refunds,
      netSalesPaise: netSales,
      paymentsCollectedPaise: collected,
      averageOrderValuePaise: aov,
      unitsSold,
      comparison,
      profitPaise: null,
      profitNote:
        "Profit requires confirmed landed costs, expense coverage and a costing policy — shown as unavailable until the business supplies cost data.",
      bestsellers,
      categorySales,
      lowStock,
      recentOrders: orders
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 8)
        .map((o) => ({
          id: o.id,
          orderNumber: o.orderNumber,
          customerName: o.customerContact?.displayName ?? null,
          totalPaise: o.totalPaise,
          status: o.status,
          paymentStatus: o.paymentStatus,
          paymentProvider: o.paymentProvider,
          createdAt: o.createdAt,
        })),
      salesTrend: [...trend.values()],
      demoDataIncluded: includeDemo,
    };
  }
}
