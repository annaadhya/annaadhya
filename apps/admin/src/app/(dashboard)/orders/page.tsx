"use client";
/**
 * /orders — the Orders console per the approved "Modern Indian Heritage" design.
 *
 * Everything on this page is real: no demo records are invented, no unsupported
 * operations are offered. Feature map (design → implementation):
 *  - summary cards (Total Orders / Pending Fulfilment / Payment Attention / Net Sales)
 *    come from GET /admin/dashboard/metrics with the SAME date scope as the table
 *    below them, so the two never disagree; definitions are the platform's own
 *    (net sales = gross − discounts − refunds; payment attention = created/pending/failed);
 *  - search (⌘K, debounced) filters server-side across order number, name, email, phone;
 *  - filters: order status + payment status + payment gateway (real enums) + date range
 *    (All time / Today / Last 7 days / Last 30 days / Custom — from/to epoch millis);
 *  - Export Orders → the established audited XLSX export (GET /admin/reports/exports/orders)
 *    carrying the current filters; needs reports:export — honestly disabled otherwise;
 *  - row selection → Export Selected (CSV) built client-side from real rows (the same
 *    RFC-4180 helpers the catalogue uses). Bulk STATUS changes are deliberately NOT
 *    offered: the API only exposes per-order transitions with validation, and a fake
 *    bulk action would bypass that.
 *  - View navigates to the existing order detail page (status/tracking/refund live there);
 *  - fulfilment shows the REAL tracking record only — no invented AWBs or carriers.
 *
 * Data: GET /admin/orders?search=&status=&paymentStatus=&paymentProvider=&from=&to=&page=&pageSize=
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet, can, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { formatDateTime, formatINR, formatNumber, humanize, istDayEnd, istDayStart, millisToDateInput, dateInputToMillis } from "@/lib/format";
import { relativeDayTime } from "@/lib/relative-time";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { useToast } from "@/lib/toast";
import type { DashboardMetrics, OrderDoc, OrderStatus, Page, PaymentProviderName, PaymentStatus } from "@/lib/types";
import { ORDER_STATUSES, PAYMENT_STATUSES, PAYMENT_PROVIDERS } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CardsSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { IconBag, IconClock, IconDownload, IconRupee, IconTruck, IconTrendDown, IconTrendUp, IconWallet } from "@/components/dashboard-icons";

const PAGE_SIZES = [10, 25, 50] as const;
const SEARCH_DEBOUNCE_MS = 350;

type RangePreset = "30d" | "7d" | "today" | "all" | "custom";

const RANGE_PRESETS: { value: RangePreset; label: string }[] = [
  { value: "30d", label: "Last 30 days" },
  { value: "7d", label: "Last 7 days" },
  { value: "today", label: "Today" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range…" },
];

/** Resolved date scope shared by the table, the summary cards and the export. */
interface DateWindow {
  from?: number;
  to?: number;
  label: string;
}

function resolveWindow(preset: RangePreset, customFrom: string, customTo: string): DateWindow {
  const now = Date.now();
  switch (preset) {
    case "today":
      return { from: istDayStart(now), to: istDayEnd(now), label: "Today" };
    case "7d":
      return { from: istDayStart(now - 6 * 86_400_000), to: istDayEnd(now), label: "Last 7 days" };
    case "30d":
      return { from: istDayStart(now - 29 * 86_400_000), to: istDayEnd(now), label: "Last 30 days" };
    case "all":
      return { label: "All time" };
    case "custom": {
      if (!customFrom || !customTo) return { label: "Custom range — pick dates" };
      const from = istDayStart(dateInputToMillis(customFrom));
      const to = istDayEnd(dateInputToMillis(customTo));
      if (from > to) return { label: "Custom range — from must be before to" };
      return { from, to, label: `${millisToDateInput(from)} → ${millisToDateInput(to)}` };
    }
  }
}

/* ------------------------------- small pieces ------------------------------ */

function MetricCard({
  label,
  value,
  note,
  tone,
  icon,
  loading,
}: {
  label: string;
  value: string;
  note: React.ReactNode;
  tone: "primary" | "secondary" | "error" | "neutral";
  icon: React.ReactNode;
  loading?: boolean;
}) {
  const tones = {
    primary: { text: "text-primary", chip: "bg-primary-fixed text-on-primary-fixed-variant" },
    secondary: { text: "text-secondary", chip: "bg-secondary-fixed text-on-secondary-fixed-variant" },
    error: { text: "text-error", chip: "bg-error-container text-on-error-container" },
    neutral: { text: "text-on-surface", chip: "bg-tertiary-fixed text-on-tertiary-fixed-variant" },
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)] transition-shadow hover:shadow-[0_2px_12px_rgba(39,24,16,0.08)]">
      <span aria-hidden className="absolute -right-4 -top-4 -z-0 h-20 w-20 rounded-full bg-surface-container-high/50" />
      <div className="relative flex items-start justify-between gap-2">
        <span className="label-eyebrow text-on-surface-variant">{label}</span>
        <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones.chip}`}>
          {icon}
        </span>
      </div>
      {loading ? (
        <div className="relative mt-2 h-8 w-24 animate-pulse rounded bg-surface-container-high" aria-hidden />
      ) : (
        <p className={`relative mt-1 font-display text-[28px] font-semibold leading-9 ${tones.text}`}>{value}</p>
      )}
      <div className="relative mt-2 flex items-center gap-1.5 text-xs text-on-surface-variant">{note}</div>
    </div>
  );
}

function DeltaNote({ current, previous, scope }: { current: number; previous: number | null; scope: string }) {
  if (previous === null || previous === 0) {
    return <span>no orders in the {scope}</span>;
  }
  const pct = Math.round(((current - previous) / previous) * 1000) / 10;
  const up = pct >= 0;
  return (
    <>
      {up ? (
        <IconTrendUp className="h-3.5 w-3.5 shrink-0 text-secondary" />
      ) : (
        <IconTrendDown className="h-3.5 w-3.5 shrink-0 text-error" />
      )}
      <span className={`font-bold ${up ? "text-secondary" : "text-error"}`}>
        {up ? "+" : ""}
        {pct}%
      </span>
      <span>vs {scope}</span>
    </>
  );
}

function FulfilmentCell({ order, onCopy }: { order: OrderDoc; onCopy: (awb: string) => void }) {
  if (order.status === "cancelled" || order.status === "refunded") {
    return <span className="text-xs italic text-outline">Not fulfilled</span>;
  }
  if (order.tracking) {
    return (
      <div className="flex flex-col items-start gap-0.5">
        <span className="flex items-center gap-1 text-[13px] font-semibold text-on-surface">
          <IconTruck className="h-3.5 w-3.5 shrink-0 text-secondary" />
          {order.tracking.carrier}
        </span>
        <button
          type="button"
          title="Copy tracking number"
          onClick={() => onCopy(order.tracking!.trackingNumber)}
          className="font-mono text-[11px] tracking-wider text-secondary hover:text-primary hover:underline"
        >
          {order.tracking.trackingNumber}
        </button>
      </div>
    );
  }
  if (order.status === "shipped" || order.status === "delivered") {
    return <span className="text-xs text-on-surface-variant">No AWB recorded yet</span>;
  }
  return <span className="text-xs text-on-surface-variant">Awaiting dispatch</span>;
}

/** Windowed page list: 1 … c-1 c c+1 … last (design's numbered pagination). */
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

/* ---------------------------------- page ----------------------------------- */

export default function OrdersPage() {
  usePageTitle("Orders");
  const { principal } = useAuth();
  const toast = useToast();

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus | "">("");
  const [provider, setProvider] = useState<PaymentProviderName | "">("");
  const [gift, setGift] = useState<"" | "true" | "false">("");
  const [preset, setPreset] = useState<RangePreset>("30d");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [exporting, setExporting] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);
  const headerCheckboxRef = useRef<HTMLInputElement>(null);

  // Deep links: the dashboard attention cards preselect a status (?status=shipped);
  // ?q= prefills the search. Unknown values are ignored.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    const s = params.get("status");
    if (q) {
      setSearchInput(q);
      setSearch(q.trim());
    }
    if (s && (ORDER_STATUSES as readonly string[]).includes(s)) {
      setStatus(s as OrderStatus);
    }
  }, []);

  // ⌘K / Ctrl+K focuses search — matches the design's keyboard hint.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced search — typing never fires one request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const dateWindow = useMemo(() => resolveWindow(preset, customFrom, customTo), [preset, customFrom, customTo]);
  const hasCustomWindow = dateWindow.from !== undefined && dateWindow.to !== undefined;

  const { data, loading, error, reload } = useApiQuery<Page<OrderDoc>>(
    () =>
      apiGet<Page<OrderDoc>>("/admin/orders", {
        search: search || undefined,
        status: status || undefined,
        paymentStatus: paymentStatus || undefined,
        paymentProvider: provider || undefined,
        gift: gift === "" ? undefined : gift,
        from: dateWindow.from,
        to: dateWindow.to,
        page,
        pageSize,
      }),
    [search, status, paymentStatus, provider, gift, dateWindow.from, dateWindow.to, page, pageSize],
  );

  // Summary cards share the table's exact date scope AND demo inclusion via the metrics
  // endpoint — the table lists demo rows (DEMO chips), so the cards must count them too.
  const metrics = useApiQuery<DashboardMetrics>(
    () =>
      apiGet<DashboardMetrics>("/admin/dashboard/metrics", {
        from: dateWindow.from ?? 1,
        to: dateWindow.to ?? Date.now(),
        includeDemo: "true",
      }),
    [dateWindow.from, dateWindow.to],
  );

  // Any change of scope invalidates the selection (it is page-scoped by design).
  useEffect(() => {
    setSelected(new Set());
  }, [search, status, paymentStatus, provider, gift, preset, customFrom, customTo, page, pageSize]);

  const orders = data?.items ?? [];
  const allOnPageSelected = orders.length > 0 && orders.every((o) => selected.has(o.id));
  const someOnPageSelected = orders.some((o) => selected.has(o.id));

  useEffect(() => {
    if (headerCheckboxRef.current) {
      headerCheckboxRef.current.indeterminate = someOnPageSelected && !allOnPageSelected;
    }
  }, [someOnPageSelected, allOnPageSelected]);

  const toggleAll = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allOnPageSelected) orders.forEach((o) => next.delete(o.id));
      else orders.forEach((o) => next.add(o.id));
      return next;
    });
  };

  const toggleOne = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const copyAwb = useCallback(
    (awb: string) => {
      void navigator.clipboard
        ?.writeText(awb)
        .then(() => toast.success("Tracking number copied", awb))
        .catch(() => toast.error("Copy failed", "Your browser blocked clipboard access."));
    },
    [toast],
  );

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setStatus("");
    setPaymentStatus("");
    setProvider("");
    setGift("");
    setPreset("30d");
    setCustomFrom("");
    setCustomTo("");
    setPage(1);
  }

  const canExport = can(principal, "reports:export");

  async function exportOrders() {
    setExporting(true);
    try {
      await downloadFile("/admin/reports/exports/orders", {
        includeDemo: "true", // the table shows demo rows (DEMO chip) — the export matches the screen
        from: dateWindow.from,
        to: dateWindow.to,
        status: status || undefined,
        paymentStatus: paymentStatus || undefined,
        paymentProvider: provider || undefined,
        search: search || undefined,
      });
      toast.success("Export ready", "annaadhya-orders .xlsx downloaded with the current filters.");
    } catch (err) {
      toast.error("Export failed", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setExporting(false);
    }
  }

  function exportSelectedCsv() {
    if (!data) return;
    const rows = data.items.filter((o) => selected.has(o.id));
    if (rows.length === 0) return;
    const csv = toCsv([
      [
        "Order no", "Placed (IST)", "Customer", "Email", "Phone", "City", "State", "Pincode",
        "Items", "Subtotal (₹)", "Shipping (₹)", "Total (₹)", "Refunded (₹)", "Status", "Payment status",
        "Provider", "Carrier", "AWB",
      ],
      ...rows.map((o) => [
        o.orderNumber,
        formatDateTime(o.createdAt),
        o.customerContact.displayName,
        o.customerContact.email,
        o.customerContact.phone,
        o.shippingAddress.city,
        o.shippingAddress.state,
        o.shippingAddress.pincode,
        o.items.reduce((n, i) => n + i.qty, 0),
        (o.subtotalPaise / 100).toFixed(2),
        (o.shippingPaise / 100).toFixed(2),
        (o.totalPaise / 100).toFixed(2),
        o.refundPaise ? (o.refundPaise / 100).toFixed(2) : "",
        o.status,
        o.paymentStatus,
        o.paymentProvider,
        o.tracking?.carrier ?? "",
        o.tracking?.trackingNumber ?? "",
      ]),
    ]);
    downloadTextFile(`annaadhya-orders-selected-${new Date().toISOString().slice(0, 10)}.csv`, csv);
    toast.success("CSV ready", `${rows.length} selected order${rows.length === 1 ? "" : "s"} exported.`);
  }

  const metricsData = metrics.data;
  const pendingFulfilment = metricsData
    ? (metricsData.statusCounts.confirmed ?? 0) + (metricsData.statusCounts.processing ?? 0)
    : 0;
  const paymentAttention = metricsData
    ? (metricsData.paymentStatusCounts.created ?? 0) +
      (metricsData.paymentStatusCounts.pending ?? 0) +
      (metricsData.paymentStatusCounts.failed ?? 0)
    : 0;
  const metricsScope = metricsData?.range.label ?? "";

  const selectedNumbers = orders.filter((o) => selected.has(o.id)).map((o) => o.orderNumber);
  const hasActiveFilters = Boolean(search || status || paymentStatus || provider) || preset !== "30d" || Boolean(customFrom || customTo);
  const isTrulyEmpty = data && data.total === 0 && !hasActiveFilters;

  return (
    <div>
      <PageHeader
        eyebrow={
          <span className="rounded-full bg-secondary-fixed px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest text-on-secondary-fixed">
            Order Book
          </span>
        }
        title="Orders"
        description="Review orders, manage fulfillment, and keep every delivery moving."
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-surface-container-lowest px-3 py-2 shadow-[0_1px_6px_rgba(39,24,16,0.06)] transition-colors hover:bg-surface-container-low">
              <IconClock className="h-4 w-4 shrink-0 text-outline" />
              <Select
                aria-label="Date range"
                className="cursor-pointer border-0 bg-transparent p-0 pr-5 text-xs font-semibold text-on-surface shadow-none focus:ring-0"
                value={preset}
                onChange={(e) => {
                  setPreset(e.target.value as RangePreset);
                  setPage(1);
                }}
              >
                {RANGE_PRESETS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.value === "custom" && hasCustomWindow && customFrom && customTo
                      ? `${customFrom} → ${customTo}`
                      : r.label}
                  </option>
                ))}
              </Select>
            </label>
            <span
              title={canExport ? "Download the current view as XLSX" : "Needs the reports:export permission"}
            >
              <Button variant="secondary" onClick={() => void exportOrders()} disabled={!canExport || exporting} loading={exporting}>
                <IconDownload className="h-4 w-4" />
                Export Orders
              </Button>
            </span>
          </>
        }
      />

      {/* ------------------------------ summary cards ------------------------------ */}
      {metrics.error ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2 rounded-xl bg-surface-container-low px-4 py-3 text-sm text-on-surface-variant">
          <span>
            Summary cards need the dashboard:read permission — the order table below is unaffected.
            {metrics.error.status === 403 ? "" : ` (${metrics.error.message})`}
          </span>
          <Button variant="outline" size="sm" onClick={metrics.reload}>
            Retry
          </Button>
        </div>
      ) : metrics.loading && !metricsData ? (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <CardsSkeleton count={4} />
        </div>
      ) : metricsData ? (
        <div className="mb-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Order summary">
          <MetricCard
            label="Total Orders"
            value={formatNumber(metricsData.orders.count)}
            tone="primary"
            icon={<IconBag className="h-5 w-5" />}
            note={
              <DeltaNote
                current={metricsData.orders.count}
                previous={metricsData.comparison ? metricsData.comparison.ordersCount : null}
                scope={metricsData.comparison?.label ?? "previous window"}
              />
            }
          />
          <MetricCard
            label="Pending Fulfilment"
            value={formatNumber(pendingFulfilment)}
            tone="neutral"
            icon={<IconTruck className="h-5 w-5" />}
            note={
              <span>
                <span className="font-bold text-primary">{metricsData.statusCounts.confirmed ?? 0}</span> confirmed
                <span className="mx-1.5 text-outline">•</span>
                <span className="font-bold text-secondary">{metricsData.statusCounts.processing ?? 0}</span> processing
              </span>
            }
          />
          <MetricCard
            label="Payment Attention"
            value={`${formatNumber(paymentAttention)} order${paymentAttention === 1 ? "" : "s"}`}
            tone="error"
            icon={<IconWallet className="h-5 w-5" />}
            note={
              <span>
                <span className="font-bold text-error">{metricsData.paymentStatusCounts.failed ?? 0}</span> failed
                <span className="mx-1.5 text-outline">•</span>
                <span className="font-bold text-on-surface">
                  {(metricsData.paymentStatusCounts.created ?? 0) + (metricsData.paymentStatusCounts.pending ?? 0)}
                </span>{" "}
                awaiting
              </span>
            }
          />
          <MetricCard
            label={`Net Sales · ${metricsScope}`}
            value={formatINR(metricsData.netSalesPaise)}
            tone="secondary"
            icon={<IconRupee className="h-5 w-5" />}
            note={
              <span>
                {metricsData.averageOrderValuePaise !== null ? (
                  <>
                    AOV <span className="font-bold text-on-surface">{formatINR(metricsData.averageOrderValuePaise)}</span>
                    <span className="mx-1.5 text-outline">•</span>
                  </>
                ) : null}
                <span>{formatNumber(metricsData.orders.paidCount)} paid</span>
              </span>
            }
          />
          </div>
          {metricsData.demoDataIncluded ? (
            <p className="mt-2 text-[11px] text-outline">
              Cards include demo records — the same rows shown with DEMO chips in the table. Live-only figures live in Reports.
            </p>
          ) : null}
        </div>
      ) : null}

      {/* ---------------------------- search + filters ---------------------------- */}
      <div className="mb-4 rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          <div className="relative min-w-[240px] flex-1">
            <svg
              aria-hidden
              viewBox="0 0 24 24"
              className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-outline"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" strokeLinecap="round" />
            </svg>
            <input
              ref={searchInputRef}
              type="search"
              value={searchInput}
              onChange={(e) => {
                setSearchInput(e.target.value);
                setPage(1);
              }}
              placeholder="Search by order ID, customer name, email or phone…"
              aria-label="Search orders"
              className="w-full rounded-lg bg-surface-container-low py-2.5 pl-11 pr-16 text-[13px] text-on-surface shadow-inner placeholder:text-on-surface-variant/70 focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <span
              aria-hidden
              className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded bg-surface-container-lowest px-1.5 py-0.5 text-[11px] text-outline shadow-sm"
            >
              <kbd>⌘</kbd>
              <kbd>K</kbd>
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="w-44">
              <Select
                aria-label="Filter by order status"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as OrderStatus | "");
                  setPage(1);
                }}
              >
                <option value="">All Order Statuses</option>
                {ORDER_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Select
                aria-label="Filter by payment status"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={paymentStatus}
                onChange={(e) => {
                  setPaymentStatus(e.target.value as PaymentStatus | "");
                  setPage(1);
                }}
              >
                <option value="">All Payment Statuses</option>
                {PAYMENT_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {humanize(s)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select
                aria-label="Filter by payment gateway"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={provider}
                onChange={(e) => {
                  setProvider(e.target.value as PaymentProviderName | "");
                  setPage(1);
                }}
              >
                <option value="">All Gateways</option>
                {PAYMENT_PROVIDERS.map((p) => (
                  <option key={p} value={p}>
                    {humanize(p)}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-36">
              <Select
                aria-label="Filter by gift orders"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={gift}
                onChange={(e) => {
                  setGift(e.target.value as "" | "true" | "false");
                  setPage(1);
                }}
              >
                <option value="">All Order Types</option>
                <option value="true">Gift orders</option>
                <option value="false">Standard orders</option>
              </Select>
            </div>
            <button
              type="button"
              title="Reset filters"
              aria-label="Reset filters"
              onClick={resetFilters}
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary"
            >
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                <path d="M4 6h9m7 0h-3M4 12h3m13 0h-9M4 18h9m5 0h-1" strokeLinecap="round" />
                <circle cx="16" cy="6" r="2" />
                <circle cx="10" cy="12" r="2" />
                <circle cx="15" cy="18" r="2" />
              </svg>
            </button>
          </div>
        </div>
        {preset === "custom" ? (
          <div className="mt-3 flex flex-wrap items-end gap-3 border-t border-outline-variant/30 pt-3">
            <label className="text-xs font-semibold text-on-surface-variant">
              From
              <input
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setPage(1);
                }}
                className="ml-2 rounded-lg bg-surface-container-low px-2 py-1.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <label className="text-xs font-semibold text-on-surface-variant">
              To
              <input
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setPage(1);
                }}
                className="ml-2 rounded-lg bg-surface-container-low px-2 py-1.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </label>
            <span className="text-xs text-outline">Dates are IST calendar days.</span>
          </div>
        ) : null}
      </div>

      {/* ------------------------------ bulk action bar ---------------------------- */}
      {selected.size > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary-container px-5 py-2.5 text-on-primary-container shadow-[0_1px_8px_rgba(39,24,16,0.08)]">
          <p className="text-xs font-semibold">
            <span className="font-bold">{selected.size} order{selected.size === 1 ? "" : "s"} selected:</span>{" "}
            <span className="underline decoration-on-primary-container/40">
              {selectedNumbers.slice(0, 3).join(", ")}
              {selectedNumbers.length > 3 ? ` +${selectedNumbers.length - 3} more` : ""}
            </span>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={exportSelectedCsv} className="bg-surface-container-lowest text-primary hover:bg-surface-container-low">
              <IconDownload className="h-3.5 w-3.5" />
              Export Selected (CSV)
            </Button>
            <button
              type="button"
              onClick={() => setSelected(new Set())}
              className="text-xs font-semibold underline decoration-on-primary-container/40 hover:text-on-primary"
            >
              Clear Selection
            </button>
          </div>
        </div>
      ) : null}

      {/* -------------------------------- orders table ------------------------------ */}
      <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        {loading ? (
          <TableSkeleton rows={8} cols={9} />
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : !data || data.items.length === 0 ? (
          isTrulyEmpty ? (
            <EmptyState
              title="No orders yet"
              description="Orders appear here the moment customers check out on the storefront."
            />
          ) : (
            <EmptyState
              title="No orders match"
              description="Try widening the date range, or clear the search and filters."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              }
            />
          )
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH scope="col" className="w-12 text-center">
                    <input
                      ref={headerCheckboxRef}
                      type="checkbox"
                      checked={allOnPageSelected}
                      onChange={toggleAll}
                      aria-label="Select all orders on this page"
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                  </TH>
                  <TH scope="col">Order Ref</TH>
                  <TH scope="col">Customer</TH>
                  <TH scope="col">Placed</TH>
                  <TH scope="col">Items</TH>
                  <TH scope="col">Total</TH>
                  <TH scope="col">Payment</TH>
                  <TH scope="col">Order Status</TH>
                  <TH scope="col">Fulfilment</TH>
                  <TH scope="col" className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {data.items.map((o) => {
                  const city = [o.shippingAddress.city, o.shippingAddress.state].filter(Boolean).join(", ");
                  const itemCount = o.items.reduce((n, i) => n + i.qty, 0);
                  const itemSummary = o.items
                    .map((i) => (i.qty > 1 ? `${i.name} ×${i.qty}` : i.name))
                    .join(", ");
                  return (
                    <TR key={o.id} className={selected.has(o.id) ? "bg-surface-container/40" : undefined}>
                      <TD className="text-center">
                        <input
                          type="checkbox"
                          checked={selected.has(o.id)}
                          onChange={() => toggleOne(o.id)}
                          aria-label={`Select order ${o.orderNumber}`}
                          className="h-4 w-4 cursor-pointer accent-primary"
                        />
                      </TD>
                      <TD>
                        <Link
                          href={`/orders/${o.id}`}
                          className="font-display text-[15px] font-bold text-primary hover:underline"
                        >
                          {o.orderNumber}
                        </Link>
                        {o.isGiftOrder ? (
                          <span
                            className="ml-2 rounded bg-primary-fixed px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-primary-fixed-variant"
                            title={`Gift order — ships to ${o.gift?.recipientName ?? o.shippingAddress.fullName}`}
                          >
                            Gift
                          </span>
                        ) : null}
                        {o.isDemo ? (
                          <span className="ml-2 rounded bg-tertiary-fixed px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-tertiary-fixed-variant">
                            Demo
                          </span>
                        ) : null}
                      </TD>
                      <TD className="max-w-[12rem]">
                        <span className="block truncate font-semibold text-on-surface" title={o.customerContact.displayName}>
                          {o.customerContact.displayName}
                        </span>
                        <span className="block truncate text-xs text-on-surface-variant" title={o.customerContact.email}>
                          {o.customerContact.email || "—"}
                        </span>
                        {city ? <span className="block truncate text-[11px] text-outline">{city}</span> : null}
                      </TD>
                      <TD className="whitespace-nowrap">
                        <span className="block font-medium text-on-surface">{relativeDayTime(o.createdAt)}</span>
                        <span className="block text-[11px] text-outline">IST</span>
                      </TD>
                      <TD className="max-w-[13rem]">
                        <span className="block font-semibold text-on-surface">
                          {itemCount} item{itemCount === 1 ? "" : "s"}
                        </span>
                        <span className="block truncate text-xs text-on-surface-variant" title={itemSummary}>
                          {itemSummary}
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap">
                        <span className="block font-display text-[15px] font-bold text-on-surface">{formatINR(o.totalPaise)}</span>
                        {o.refundPaise > 0 ? (
                          <span className="block text-[11px] font-semibold text-error">
                            −{formatINR(o.refundPaise)} refunded
                          </span>
                        ) : null}
                      </TD>
                      <TD className="whitespace-nowrap">
                        <StatusBadge status={o.paymentStatus} />
                        <span className="mt-0.5 block pl-1 text-[11px] text-outline">{humanize(o.paymentProvider)}</span>
                      </TD>
                      <TD className="whitespace-nowrap">
                        <StatusBadge status={o.status} />
                        {o.cancelledReason ? (
                          <span className="mt-0.5 block max-w-[10rem] truncate text-[11px] text-error" title={o.cancelledReason}>
                            {o.cancelledReason}
                          </span>
                        ) : null}
                      </TD>
                      <TD>
                        <FulfilmentCell order={o} onCopy={copyAwb} />
                      </TD>
                      <TD className="text-right">
                        <Link
                          href={`/orders/${o.id}`}
                          className="inline-block rounded bg-surface-container-low px-2.5 py-1 text-xs font-bold text-primary shadow-sm transition-colors hover:bg-surface-container"
                        >
                          View
                        </Link>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            {/* --------------------------- pagination footer --------------------------- */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[13px] text-on-surface-variant sm:flex-row sm:px-6">
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  Showing{" "}
                  <strong className="text-on-surface">
                    {(data.page - 1) * data.pageSize + 1}–{Math.min(data.page * data.pageSize, data.total)}
                  </strong>{" "}
                  of <strong className="text-on-surface">{formatNumber(data.total)}</strong> orders
                </span>
                <label className="flex items-center gap-2 text-xs">
                  <span className="text-xs font-semibold uppercase tracking-wider text-outline">Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="cursor-pointer rounded bg-surface-container-lowest px-2 py-1 text-xs font-semibold text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                    aria-label="Orders per page"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n} per page
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <nav aria-label="Orders pagination" className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                  className="rounded-lg bg-surface-container-lowest p-1.5 text-outline shadow-sm transition-colors hover:text-on-surface disabled:opacity-40"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {pageWindow(data.page, data.totalPages).map((p, i) =>
                  p === "…" ? (
                    <span key={`gap-${i}`} className="px-1 text-outline">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      aria-current={p === data.page ? "page" : undefined}
                      className={`h-8 w-8 rounded-lg text-xs font-bold shadow-sm transition-colors ${
                        p === data.page
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  disabled={page >= data.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                  className="rounded-lg bg-surface-container-lowest p-1.5 text-outline shadow-sm transition-colors hover:text-on-surface disabled:opacity-40"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m10 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </nav>
            </div>
          </>
        )}
      </div>

      <p className="pt-3 text-center text-[11px] text-outline sm:text-right">
        All timestamps recorded in Indian Standard Time (IST — UTC+05:30).
      </p>
    </div>
  );
}
