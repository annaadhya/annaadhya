"use client";
/**
 * /dashboard — Overview, styled to the approved Stitch heritage design
 * ("Modern Indian Heritage Editorial"), rendering inside the existing guarded
 * shell (sidebar/topbar are the shared AppShell's — never duplicated here).
 *
 * Tokens: the additive heritage system in globals.css (surface containers,
 * primary maroon #541620, secondary #476554, gold #d3a955 accents, outline
 * #867273) + .font-heritage-display / .font-heritage-sans and the DESIGN.md
 * type scale (text-headline-*, text-body-*, text-label-*).
 *
 * Data: GET /admin/dashboard/metrics?days=N (single source for every widget)
 * plus GET /admin/audit?limit=4 for the activity shelf (only when the principal
 * holds audit:read — the API enforces the same gate server-side).
 *
 * Honesty rules: every figure is real API data; trend deltas only render against
 * the backend's previous-window comparison; statuses are the platform's real
 * lifecycle enum; empty ranges render empty states, never fabricated numbers.
 */
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { apiGet, can, downloadFile } from "@/lib/api";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { formatDateTime, formatDateTimeCompact, formatINR, formatINRRounded, formatNumber, humanize } from "@/lib/format";
import type { AuditLogDoc, DashboardMetrics, OrderStatus } from "@/lib/types";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/lib/toast";
import { Select } from "@/components/ui/form";
import { IconAudit, IconDashboard, IconInventory, IconOrders } from "@/components/nav-items";
import { RevenueChart } from "@/components/revenue-chart";
import { CategoryDonut } from "@/components/category-donut";
import {
  IconArrowRight,
  IconBag,
  IconBoxes,
  IconCartCheckout,
  IconCheckCircle,
  IconClock,
  IconDownload,
  IconEye,
  IconRefresh,
  IconRupee,
  IconTruck,
  IconWallet,
  IconWarning,
} from "@/components/dashboard-icons";

/** The Stitch card recipe used across the page. */
const CARD = "rounded-xl bg-surface-container-lowest p-space-md sm:p-space-lg shadow-[0_1px_8px_rgba(39,24,16,0.04)]";

const istTimeFmt = new Intl.DateTimeFormat("en-IN", { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: "Asia/Kolkata" });

/** "Good morning/afternoon/evening, {first name}" — presentational only, IST clock. */
function greetingOf(name: string | undefined): string {
  const hour = Number(new Intl.DateTimeFormat("en-IN", { hour: "numeric", hourCycle: "h23", timeZone: "Asia/Kolkata" }).format(new Date()));
  const part = hour < 12 ? "Good morning" : hour < 17 ? "Good afternoon" : "Good evening";
  const first = (name ?? "").trim().split(/\s+/)[0];
  return first ? `${part}, ${first}` : part;
}

function initials(name: string | null): string {
  if (!name) return "·";
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/** Period-over-period delta, shown ONLY when the backend's previous window has data. */
function TrendBadge({ current, previous, label }: { current?: number | null; previous?: number | null; label?: string }) {
  if (current === undefined || current === null || previous === undefined || previous === null || previous <= 0) return null;
  const pct = ((current - previous) / previous) * 100;
  const up = pct >= 0;
  return (
    <div className={`mt-1 flex items-center gap-1 font-label-md text-label-md font-bold ${up ? "text-secondary" : "text-error"}`}>
      <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        {up ? <path d="m3 17 6-6 4 4 8-8M15 7h6v6" /> : <path d="m3 7 6 6 4-4 8 8M15 17h6v-6" />}
      </svg>
      <span>
        {up ? "+" : "-"}
        {Math.abs(pct).toFixed(1)}%
      </span>
      {label ? <span className="font-normal text-on-surface-variant">vs {label}</span> : null}
    </div>
  );
}

interface MetricCardProps {
  label: string;
  icon: React.ReactNode;
  chipClasses: string;
  glowClasses: string;
  value: string;
  unit?: string;
  trendCurrent?: number | null;
  trendPrevious?: number | null;
  trendLabel?: string;
  foot: React.ReactNode;
}

function MetricCard({ label, icon, chipClasses, glowClasses, value, unit, trendCurrent, trendPrevious, trendLabel, foot }: MetricCardProps) {
  return (
    <div className={`${CARD} relative flex flex-col justify-between overflow-hidden transition-shadow hover:shadow-[0_4px_16px_rgba(39,24,16,0.10)]`}>
      <div aria-hidden className={`pointer-events-none absolute -right-4 -bottom-4 h-24 w-24 rounded-full ${glowClasses}`} />
      <div className="flex items-center justify-between gap-2">
        <span className="font-label-sm text-label-sm tracking-widest text-outline uppercase">{label}</span>
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg [&>svg]:h-[22px] [&>svg]:w-[22px] ${chipClasses}`}>{icon}</span>
      </div>
      <div className="my-space-md">
        <p className="font-heritage-display text-headline-md font-bold text-primary">
          {value}
          {unit ? <span className="ml-1 text-label-lg font-medium text-on-surface-variant">{unit}</span> : null}
        </p>
        <TrendBadge current={trendCurrent} previous={trendPrevious} label={trendLabel} />
      </div>
      <p className="border-t border-outline-variant/30 pt-space-xs text-[11px] text-on-surface-variant">{foot}</p>
    </div>
  );
}

const RANGES = [
  { value: 1, label: "Today" },
  { value: 7, label: "Last 7 days" },
  { value: 30, label: "Last 30 days" },
  { value: 90, label: "Last 90 days" },
  { value: 365, label: "Last 365 days" },
];

/* --------------------------------- page ---------------------------------- */

export default function DashboardPage() {
  usePageTitle("Overview");
  const { principal } = useAuth();
  const toast = useToast();
  const [days, setDays] = useState(30);
  const [spinning, setSpinning] = useState(false);
  const [exporting, setExporting] = useState(false);

  const metrics = useApiQuery<DashboardMetrics>(() => apiGet("/admin/dashboard/metrics", { days }), [days]);

  const canAudit = can(principal, "audit:read");
  const activity = useApiQuery<AuditLogDoc[]>(
    () => (canAudit ? apiGet<AuditLogDoc[]>("/admin/audit", { limit: 4 }) : Promise.resolve([])),
    [canAudit],
  );

  // While the metrics response is in flight, the "Updated" stamp shows the last known value.
  const data = metrics.data;
  const [updatedLabel, setUpdatedLabel] = useState<string>("-");
  useEffect(() => {
    if (data) setUpdatedLabel(istTimeFmt.format(new Date(data.range.to)));
  }, [data]);

  async function handleExport() {
    if (!data || exporting) return;
    setExporting(true);
    try {
      await downloadFile("/admin/reports/exports/sales_summary", {
        from: data.range.from,
        to: data.range.to,
        includeDemo: data.demoDataIncluded ? "true" : undefined,
      });
      toast.success("Export ready", `Sales summary for the ${data.range.label} downloaded.`);
    } catch (err) {
      toast.error("Export failed", err instanceof Error ? err.message : "Try again shortly.");
    } finally {
      setExporting(false);
    }
  }

  function handleRefresh() {
    setSpinning(true);
    metrics.reload();
    activity.reload();
    window.setTimeout(() => setSpinning(false), 650);
  }

  const canOrders = can(principal, "orders:read");
  const canInventory = can(principal, "inventory:read");
  const canPurchases = can(principal, "purchases:read");
  const canExport = can(principal, "reports:export");
  const canReports = can(principal, "reports:read");

  const cmp = data?.comparison ?? null;
  const actionable = data
    ? (data.statusCounts.pending_payment ?? 0) + (data.statusCounts.confirmed ?? 0) + (data.statusCounts.processing ?? 0)
    : 0;

  const bestDay = useMemo(() => {
    if (!data || data.salesTrend.length === 0) return null;
    return data.salesTrend.reduce((best, p) => (p.netSalesPaise > best.netSalesPaise ? p : best), data.salesTrend[0]);
  }, [data]);

  const trendTotal = data ? data.salesTrend.reduce((s, p) => s + p.netSalesPaise, 0) : 0;

  return (
    <div className="mx-auto w-full max-w-7xl">
      {/* ------------------------------ loading ------------------------------ */}
      {metrics.loading ? (
        <div className="flex flex-col gap-space-xl" role="status" aria-label="Loading dashboard">
          <div className="flex flex-col justify-between gap-3 pb-space-sm sm:flex-row sm:items-end">
            <div className="space-y-2">
              <div className="h-4 w-44 animate-pulse rounded bg-surface-container-highest" />
              <div className="h-10 w-72 animate-pulse rounded bg-surface-container-highest" />
              <div className="h-4 w-96 max-w-full animate-pulse rounded bg-surface-container-highest" />
            </div>
            <div className="flex gap-2">
              <div className="h-10 w-36 animate-pulse rounded-lg bg-surface-container-highest" />
              <div className="h-10 w-32 animate-pulse rounded-lg bg-surface-container-highest" />
            </div>
          </div>
          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className={`${CARD} flex h-40 flex-col justify-between`}>
                <div className="h-4 w-24 animate-pulse rounded bg-surface-container-highest" />
                <div className="h-8 w-32 animate-pulse rounded bg-surface-container-highest" />
                <div className="h-3 w-40 animate-pulse rounded bg-surface-container-highest" />
              </div>
            ))}
          </div>
          <div className={`${CARD} flex h-48 flex-col justify-between`}>
            <div className="h-6 w-56 animate-pulse rounded bg-surface-container-highest" />
            <div className="grid grid-cols-2 gap-space-md lg:grid-cols-5">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-24 animate-pulse rounded-lg bg-surface-container-low" />
              ))}
            </div>
          </div>
          <div className="grid grid-cols-1 gap-space-md lg:grid-cols-12">
            <div className={`${CARD} h-80 lg:col-span-8`}>
              <div className="mb-4 h-6 w-48 animate-pulse rounded bg-surface-container-highest" />
              <div className="h-56 w-full animate-pulse rounded-lg bg-surface-container-low" />
            </div>
            <div className={`${CARD} h-80 lg:col-span-4`}>
              <div className="mb-4 h-6 w-40 animate-pulse rounded bg-surface-container-highest" />
              <div className="mx-auto h-40 w-40 animate-pulse rounded-full bg-surface-container-low" />
            </div>
          </div>
        </div>
      ) : metrics.error ? (
        /* ------------------------------- error ------------------------------- */
        <div className="mx-auto my-8 flex max-w-xl flex-col items-center justify-center rounded-xl border-l-4 border-error bg-surface-container-lowest px-6 py-16 text-center shadow-[0_1px_8px_rgba(39,24,16,0.04)]">
          <div aria-hidden className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-error-container text-on-error-container">
            <IconWarning className="h-9 w-9" />
          </div>
          <h2 className="font-heritage-display text-headline-md font-medium text-on-surface">
            {metrics.error.status === 403 ? "Not allowed" : metrics.error.status === 401 ? "Session expired" : "Failed to load console feeds"}
          </h2>
          <p className="mb-6 mt-2 max-w-md text-body-md text-on-surface-variant">{metrics.error.message}</p>
          <button
            type="button"
            onClick={metrics.reload}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-space-lg py-2.5 font-label-md text-label-md font-bold text-on-primary shadow-sm transition-colors hover:bg-primary-container"
          >
            <IconRefresh className="h-[18px] w-[18px]" />
            Retry now
          </button>
        </div>
      ) : data ? (
        <>
          {/* --------------------------- demo-data notice --------------------------- */}
          {data.demoDataIncluded ? (
            <div className="mb-4 flex items-center gap-2 rounded-lg bg-error-container px-3.5 py-2 font-label-sm text-label-sm font-bold text-on-error-container">
              <IconWarning className="h-4 w-4 shrink-0" />
              Reporting includes demo records (settings.reporting.includeDemoDataByDefault) — figures below mix demo and live data.
            </div>
          ) : null}

          {/* ------------------------------ 1. welcome ------------------------------ */}
          <header className="flex flex-col justify-between gap-space-md pb-space-sm lg:flex-row lg:items-end">
            <div className="min-w-0">
              <p className="mb-1 flex items-center gap-space-xs font-label-sm text-label-sm font-bold uppercase tracking-widest text-secondary">
                <span className="inline-block h-2 w-2 rounded-full bg-secondary" aria-hidden />
                Heritage Produce Console · Annaadhya Products
              </p>
              <h1 className="font-heritage-display text-[28px] leading-9 font-semibold tracking-tight text-primary sm:text-headline-lg sm:leading-12">{greetingOf(principal?.displayName ?? principal?.uid)}</h1>
              <p className="mt-1 text-body-md text-on-surface-variant">Here&rsquo;s what&rsquo;s happening with your store for the {data.range.label}.</p>
            </div>
            <div className="flex flex-wrap items-center gap-space-sm">
              <label className="flex items-center gap-2 text-[13px] text-on-surface-variant">
                <span className="sr-only">Reporting range</span>
                <Select
                  value={String(days)}
                  onChange={(e) => setDays(Number(e.target.value))}
                  className="h-10 w-40 rounded-lg border border-outline-variant/40 bg-surface-container-lowest text-label-md font-semibold text-on-surface"
                >
                  {RANGES.map((r) => (
                    <option key={r.value} value={r.value}>
                      {r.label}
                    </option>
                  ))}
                </Select>
              </label>
              <button
                type="button"
                onClick={handleRefresh}
                className="inline-flex h-10 items-center gap-space-xs rounded-lg bg-surface-container-lowest px-space-md text-on-surface shadow-sm ring-1 ring-outline-variant/40 transition-colors hover:bg-surface-container-high"
              >
                <IconRefresh className={`h-[18px] w-[18px] text-secondary ${spinning ? "animate-spin" : ""}`} />
                <span className="text-label-md font-medium text-on-surface-variant">Updated {updatedLabel}</span>
              </button>
              {canExport ? (
                <button
                  type="button"
                  onClick={handleExport}
                  disabled={exporting}
                  className="inline-flex h-10 items-center gap-space-xs rounded-lg bg-secondary-container px-space-md font-label-md text-label-md font-semibold text-on-secondary-container shadow-sm transition-colors hover:bg-secondary-fixed disabled:opacity-60"
                >
                  <IconDownload className="h-[18px] w-[18px]" />
                  {exporting ? "Preparing…" : "Export Report"}
                </button>
              ) : null}
            </div>
          </header>

          {/* ---------------------------- 2. metric cards ---------------------------- */}
          <section aria-label="Key metrics" className="mt-space-md grid grid-cols-1 gap-space-md sm:grid-cols-2 xl:grid-cols-4">
            <MetricCard
              label="Total Orders"
              icon={<IconBag />}
              chipClasses="bg-surface-container-low text-primary"
              glowClasses="bg-primary-fixed/30"
              value={formatNumber(data.orders.count)}
              trendCurrent={data.orders.count}
              trendPrevious={cmp?.ordersCount}
              trendLabel={cmp?.label}
              foot={
                <>
                  {formatNumber(data.orders.paidCount)} paid · {data.range.label}
                </>
              }
            />
            <MetricCard
              label="Total Revenue"
              icon={<IconRupee />}
              chipClasses="bg-tertiary-fixed/40 text-on-tertiary-fixed-variant"
              glowClasses="bg-tertiary-fixed/30"
              value={formatINRRounded(data.netSalesPaise)}
              trendCurrent={data.netSalesPaise}
              trendPrevious={cmp?.netSalesPaise}
              trendLabel={cmp?.label}
              foot={<>Net of discounts &amp; refunds · gross {formatINRRounded(data.grossSalesPaise)}</>}
            />
            <MetricCard
              label="Average Order Value"
              icon={<IconCartCheckout />}
              chipClasses="bg-secondary-container text-secondary"
              glowClasses="bg-secondary-fixed/40"
              value={data.averageOrderValuePaise === null ? "—" : formatINRRounded(data.averageOrderValuePaise)}
              trendCurrent={data.averageOrderValuePaise}
              trendPrevious={cmp?.averageOrderValuePaise}
              trendLabel={cmp?.label}
              foot="Net sales ÷ paid orders — em dash when there were none"
            />
            <MetricCard
              label="Products Sold"
              icon={<IconBoxes />}
              chipClasses="bg-surface-container-high text-primary"
              glowClasses="bg-surface-container-high/60"
              value={formatNumber(data.unitsSold)}
              unit="units"
              trendCurrent={data.unitsSold}
              trendPrevious={cmp?.unitsSold}
              trendLabel={cmp?.label}
              foot={
                data.bestsellers.length > 0 ? (
                  <>
                    Top: <span className="font-bold text-primary">{data.bestsellers[0].name}</span> · {formatNumber(data.bestsellers[0].qty)} units
                  </>
                ) : (
                  "No paid units in range yet"
                )
              }
            />
          </section>

          {/* ------------------------ 3. orders requiring attention ------------------------ */}
          <section className={`${CARD} mt-space-md`}>
            <div className="mb-space-md flex flex-col justify-between gap-space-xs sm:flex-row sm:items-center">
              <div>
                <h2 className="font-heritage-display text-headline-sm font-medium text-primary">Orders Requiring Attention</h2>
                <p className="text-body-sm text-on-surface-variant">Counts by real order lifecycle status inside the selected range</p>
              </div>
              <span className="inline-flex w-fit items-center gap-1.5 rounded-full bg-primary-fixed px-space-sm py-1 font-label-sm text-label-sm font-bold text-primary">
                <span className="h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
                {formatNumber(actionable)} awaiting action
              </span>
            </div>
            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
              {ATTENTION_CARDS.map((card) => {
                const count = data.statusCounts[card.status] ?? 0;
                const Icon = card.icon;
                const body = (
                  <>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <span className={`rounded-full px-2 py-0.5 font-label-sm text-label-sm font-bold uppercase tracking-wider ${card.chipClasses}`}>{card.tag}</span>
                      <Icon className="h-5 w-5 text-outline transition-colors group-hover:text-primary" />
                    </div>
                    <p className="font-heritage-display text-headline-sm font-bold text-primary">{formatNumber(count)}</p>
                    <p className="mt-0.5 font-label-md font-semibold text-on-surface">{card.label}</p>
                    <p className="mt-1 text-[12px] leading-4.5 text-on-surface-variant">{card.description}</p>
                    <span className="mt-3 flex items-center gap-1 font-label-sm font-bold text-primary group-hover:underline">
                      View in orders <IconArrowRight className="h-3.5 w-3.5" />
                    </span>
                  </>
                );
                const classes =
                  "group flex flex-col rounded-xl bg-surface-container-high/50 p-space-md transition-all duration-200 hover:bg-surface-container-high";
                return canOrders ? (
                  <Link key={card.status} href={`/orders?status=${card.status}`} className={classes} aria-label={`${card.label}: ${count} orders`}>
                    {body}
                  </Link>
                ) : (
                  <div key={card.status} className={classes}>
                    {body}
                  </div>
                );
              })}
            </div>
          </section>

          {/* -------------------- 4. revenue overview + category sales -------------------- */}
          <div className="mt-space-md grid grid-cols-1 gap-space-md lg:grid-cols-12">
            <section className={`${CARD} flex flex-col justify-between lg:col-span-8`}>
              <div>
                <div className="mb-space-md flex flex-col justify-between gap-space-sm sm:flex-row sm:items-center">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-heritage-display text-headline-sm font-medium text-primary">Revenue Overview</h2>
                      {cmp && data.netSalesPaise > 0 && cmp.netSalesPaise > 0 ? (
                        <span className={`rounded-full px-2 py-0.5 font-label-sm text-label-sm font-bold ${data.netSalesPaise >= cmp.netSalesPaise ? "bg-secondary-container text-on-secondary-container" : "bg-error-container text-on-error-container"}`}>
                          {data.netSalesPaise >= cmp.netSalesPaise ? "+" : "-"}
                          {Math.abs(((data.netSalesPaise - cmp.netSalesPaise) / cmp.netSalesPaise) * 100).toFixed(1)}% vs Prev
                        </span>
                      ) : null}
                    </div>
                    <p className="text-body-sm text-on-surface-variant">
                      Daily transaction run-rate · {data.demoDataIncluded ? "includes demo records" : "live data only"}
                    </p>
                  </div>
                  <div className="inline-flex w-fit gap-1 self-start rounded-lg bg-surface-container-high p-1 sm:self-auto" role="tablist" aria-label="Chart period">
                    {[7, 30, 90].map((d) => (
                      <button
                        key={d}
                        type="button"
                        role="tab"
                        aria-selected={days === d}
                        onClick={() => setDays(d)}
                        className={`rounded px-space-sm py-1 font-label-sm text-label-sm transition-all ${
                          days === d ? "bg-surface-container-lowest font-bold text-primary shadow-sm" : "text-on-surface-variant hover:text-on-surface"
                        }`}
                      >
                        {d} Days
                      </button>
                    ))}
                  </div>
                </div>

                {/* comparison banner */}
                <div className="mb-space-md flex flex-wrap items-center gap-space-lg rounded-lg bg-surface-container-low p-space-md">
                  <div>
                    <p className="font-label-sm uppercase text-outline">Current window</p>
                    <p className="font-heritage-display text-headline-sm font-bold text-primary">{formatINRRounded(data.netSalesPaise)}</p>
                  </div>
                  <div className="hidden h-8 w-px bg-outline-variant/40 sm:block" aria-hidden />
                  <div>
                    <p className="font-label-sm uppercase text-outline capitalize">{cmp?.label ?? "Previous window"}</p>
                    <p className="font-heritage-display text-headline-sm font-medium text-on-surface">{formatINRRounded(cmp?.netSalesPaise ?? 0)}</p>
                  </div>
                  <div className="hidden h-8 w-px bg-outline-variant/40 sm:block" aria-hidden />
                  <div>
                    <p className="font-label-sm uppercase text-outline">Single day record</p>
                    <p className="font-heritage-display text-headline-sm font-bold text-secondary">
                      {bestDay && bestDay.netSalesPaise > 0 ? (
                        <>
                          {formatINRRounded(bestDay.netSalesPaise)} <span className="text-body-sm font-normal text-on-surface-variant">({shortDateLabel(bestDay.date)})</span>
                        </>
                      ) : (
                        "—"
                      )}
                    </p>
                  </div>
                </div>

                <RevenueChart points={data.salesTrend} />

                <div className="flex flex-wrap items-center justify-between gap-space-sm border-t border-outline-variant/30 pt-space-md text-body-sm text-on-surface-variant">
                  <div className="flex items-center gap-space-md">
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-full bg-primary" aria-hidden /> Daily revenue curve
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="inline-block h-3 w-3 rounded-sm bg-tertiary-fixed" aria-hidden /> Order volume bar
                    </span>
                  </div>
                  <span className="font-label-sm font-bold text-secondary">Average daily: {formatINRRounded(Math.round(trendTotal / Math.max(1, data.salesTrend.length)))}</span>
                </div>
              </div>
            </section>

            <section className={`${CARD} flex flex-col justify-between lg:col-span-4`}>
              <div>
                <div className="mb-space-xs flex items-center justify-between gap-2">
                  <h2 className="font-heritage-display text-headline-sm font-medium text-primary">Category Sales</h2>
                  {canReports ? (
                    <Link href="/reports" className="font-label-sm text-label-sm font-medium text-primary hover:underline">
                      View Report
                    </Link>
                  ) : null}
                </div>
                <p className="mb-space-md text-body-sm text-on-surface-variant">Contribution by catalogue category</p>
                <div className="scroll-slim max-h-[26rem] overflow-y-auto pr-1">
                  <CategoryDonut rows={data.categorySales} />
                </div>
              </div>
              <p className="mt-space-sm border-t border-outline-variant/30 pt-space-md text-[11px] text-on-surface-variant">
                Shares of {formatINRRounded(data.categorySales.reduce((s, c) => s + c.revenuePaise, 0))} item revenue across paid orders · {data.range.label}
              </p>
            </section>
          </div>

          {/* ------------------ 5. recent orders + inventory alerts ------------------ */}
          <div className="mt-space-md grid grid-cols-1 gap-space-md lg:grid-cols-12">
            <section className={`${CARD} flex flex-col justify-between lg:col-span-8`}>
              <div>
                <div className="mb-space-md flex items-center justify-between gap-2">
                  <div>
                    <h2 className="font-heritage-display text-headline-sm font-medium text-primary">Recent Orders</h2>
                    <p className="text-body-sm text-on-surface-variant">Latest customer transactions and fulfilment statuses</p>
                  </div>
                  {canOrders ? (
                    <Link href="/orders" className="flex items-center gap-1 font-label-md font-bold text-primary hover:text-primary-container">
                      View all orders <IconArrowRight className="h-4 w-4" />
                    </Link>
                  ) : null}
                </div>
                {data.recentOrders.length === 0 ? (
                  <EmptyMini
                    title="No orders yet"
                    description="Orders will appear here the moment the storefront takes them — nothing is sampled in advance."
                  />
                ) : (
                  <div className="w-full overflow-x-auto">
                    <table className="w-full min-w-max border-collapse text-left text-body-sm">
                      <thead>
                        <tr className="bg-surface-container-low font-label-sm uppercase tracking-wider text-on-surface-variant">
                          <th className="rounded-l px-2 py-2.5 font-label-sm">Order</th>
                          <th className="px-2 py-2.5 font-label-sm">Date &amp; time</th>
                          <th className="px-2 py-2.5 text-right font-label-sm">Total</th>
                          <th className="px-2 py-2.5 font-label-sm">Payment</th>
                          <th className="px-2 py-2.5 font-label-sm">Status</th>
                          <th className="rounded-r px-2 py-2.5 text-center font-label-sm">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-outline-variant/20">
                        {data.recentOrders.map((o) => (
                          <tr key={o.id} className="transition-colors hover:bg-surface-container-low/40">
                            <td className="px-2 py-3">
                              <div className="flex items-center gap-2.5">
                                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary-fixed font-label-sm font-bold text-primary" aria-hidden>
                                  {initials(o.customerName)}
                                </span>
                                <span className="min-w-0">
                                  <span className="block whitespace-nowrap font-label-md font-bold text-primary">{o.orderNumber}</span>
                                  <span className="block max-w-[7.5rem] truncate text-[11px] text-on-surface-variant">{o.customerName ?? "Name unavailable"}</span>
                                </span>
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-2 py-3 text-on-surface-variant">{formatDateTimeCompact(o.createdAt)}</td>
                            <td className="whitespace-nowrap px-2 py-3 text-right font-bold text-on-surface">{formatINR(o.totalPaise)}</td>
                            <td className="px-2 py-3">
                              <span className="inline-flex items-center gap-1 text-[12px] font-medium text-secondary">
                                <IconWallet className="h-3.5 w-3.5" />
                                {humanize(o.paymentStatus)}
                                <span className="text-outline">· {humanize(o.paymentProvider)}</span>
                              </span>
                            </td>
                            <td className="px-2 py-3">{statusPill(o.status)}</td>
                            <td className="px-2 py-3 text-center">
                              {canOrders ? (
                                <Link
                                  href={`/orders/${o.id}`}
                                  aria-label={`Open order ${o.orderNumber}`}
                                  className="inline-flex rounded p-1 text-outline transition-colors hover:bg-surface-container-high hover:text-primary"
                                >
                                  <IconEye className="h-[18px] w-[18px]" />
                                </Link>
                              ) : (
                                <span className="text-xs text-outline">—</span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
              <p className="mt-space-sm border-t border-outline-variant/30 pt-space-md text-body-sm text-on-surface-variant">
                Showing {data.recentOrders.length} of {formatNumber(data.orders.count)} orders in range
              </p>
            </section>

            <section className={`${CARD} flex flex-col justify-between lg:col-span-4`}>
              <div>
                <div className="mb-space-md flex items-center justify-between gap-2">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="font-heritage-display text-headline-sm font-medium text-primary">Inventory Alerts</h2>
                      {data.lowStock.length > 0 ? (
                        <span className="relative flex h-2 w-2" aria-hidden>
                          <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-error opacity-60" />
                          <span className="relative inline-flex h-2 w-2 rounded-full bg-error" />
                        </span>
                      ) : null}
                    </div>
                    <p className="text-body-sm text-on-surface-variant">Published variants at or below their own re-order threshold</p>
                  </div>
                  {canInventory ? (
                    <Link href="/inventory" className="shrink-0 font-label-md font-semibold text-primary hover:underline">
                      Open inventory
                    </Link>
                  ) : null}
                </div>
                {data.lowStock.length === 0 ? (
                  <EmptyMini title="Nothing low" description="No published variants are at or below their low-stock threshold right now." />
                ) : (
                  <ul className="scroll-slim max-h-80 space-y-space-sm overflow-y-auto pr-1">
                    {data.lowStock.map((row) => (
                      <li key={row.variantId} className="flex items-start gap-space-sm rounded-lg bg-surface-container-low p-space-sm">
                        <span
                          aria-hidden
                          className={`mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-md ${
                            row.available === 0 ? "bg-error-container text-on-error-container" : "bg-tertiary-fixed text-on-tertiary-fixed"
                          }`}
                        >
                          {row.available === 0 ? <IconWarning className="h-5 w-5" /> : <IconClock className="h-5 w-5" />}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center justify-between gap-1">
                            <p className="truncate font-label-md font-bold text-on-surface">{row.name}</p>
                            <span
                              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                                row.available === 0 ? "bg-error text-on-error" : "bg-tertiary-fixed-dim text-on-tertiary-fixed"
                              }`}
                            >
                              {row.available === 0 ? "0 units" : `${formatNumber(row.available)} left`}
                            </span>
                          </div>
                          <p className="mt-0.5 text-[12px] text-on-surface-variant">
                            {row.packLabel} · <span className="font-mono text-[11px]">{row.sku}</span> · threshold {formatNumber(row.threshold)}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {canPurchases ? (
                <div className="mt-space-md border-t border-outline-variant/30 pt-space-md">
                  <Link
                    href="/purchases"
                    className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-primary font-label-md font-bold text-on-primary shadow-sm transition-colors hover:bg-primary-container"
                  >
                    <IconInventory className="h-[18px] w-[18px]" />
                    Create purchase order
                  </Link>
                </div>
              ) : null}
            </section>
          </div>

          {/* --------------------- 6. recent administrative activity --------------------- */}
          {canAudit ? (
            <section className={`${CARD} mt-space-md`}>
              <div className="mb-space-md flex items-center justify-between gap-2">
                <div className="flex items-center gap-space-sm">
                  <IconAudit className="h-5 w-5 text-secondary" />
                  <h2 className="font-heritage-display text-headline-sm font-medium text-primary">Recent Administrative Activity</h2>
                </div>
                <span className="font-label-sm text-on-surface-variant">Latest audit entries</span>
              </div>
              {activity.loading ? (
                <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-4" role="status" aria-label="Loading activity">
                  {Array.from({ length: 4 }).map((_, i) => (
                    <div key={i} className="h-28 animate-pulse rounded-lg bg-surface-container-low" />
                  ))}
                </div>
              ) : activity.error ? (
                <div className="flex items-center justify-between gap-3 rounded-lg bg-error-container px-4 py-3 text-body-sm text-on-error-container">
                  <span>Audit feed unavailable ({activity.error.message})</span>
                  <button type="button" onClick={activity.reload} className="shrink-0 font-label-sm font-bold underline">
                    Retry
                  </button>
                </div>
              ) : (activity.data ?? []).length === 0 ? (
                <EmptyMini title="No recorded activity yet" description="Admin actions such as status changes and stock movements will appear here." />
              ) : (
                <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-4">
                  {(activity.data ?? []).slice(0, 4).map((log) => (
                    <div key={log.id} className="flex flex-col justify-between rounded-lg bg-surface-container-low p-space-sm">
                      <div className="mb-1 flex items-center justify-between gap-2 font-label-sm text-[11px] font-bold text-secondary">
                        <span className="flex min-w-0 items-center gap-1">
                          <IconClock className="h-3.5 w-3.5 shrink-0" />
                          <span className="truncate">{humanize(log.action.replace(/\./g, " "))}</span>
                        </span>
                        <span className="shrink-0 font-medium normal-case text-outline">{istTimeFmt.format(new Date(log.createdAt))}</span>
                      </div>
                      <p className="text-[13px] leading-5 text-on-surface">{log.summary}</p>
                      <p className="pt-2 text-[11px] text-on-surface-variant">
                        {log.actorName} · {humanize(log.actorRole)}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </section>
          ) : null}

          {/* ------------------------------- footer note ------------------------------- */}
          <p className="mt-space-md text-[11px] text-outline">
            Range: {formatDateTime(data.range.from)} → {formatDateTime(data.range.to)} (IST). Figures come straight from the reporting service; profit is
            intentionally never guessed and chart totals reconcile with the headline figures.
          </p>
        </>
      ) : null}
    </div>
  );
}

/* ------------------------- static section definitions ------------------------- */

const ATTENTION_CARDS: { status: OrderStatus; tag: string; label: string; description: string; chipClasses: string; icon: React.ComponentType<{ className?: string }> }[] = [
  {
    status: "pending_payment",
    tag: "Priority triage",
    label: "Pending payment",
    description: "Awaiting payment capture — the state machine blocks fulfilment until confirmed.",
    chipClasses: "bg-tertiary-fixed text-on-tertiary-fixed",
    icon: IconOrders,
  },
  {
    status: "confirmed",
    tag: "Ready to pack",
    label: "Confirmed",
    description: "Paid and confirmed — queue them into processing without delay.",
    chipClasses: "bg-primary-container text-on-primary",
    icon: IconCartCheckout,
  },
  {
    status: "processing",
    tag: "Warehouse",
    label: "Processing / Packing",
    description: "Being picked, packed and sealed for dispatch.",
    chipClasses: "bg-primary-fixed text-primary",
    icon: IconInventory,
  },
  {
    status: "shipped",
    tag: "Logistics",
    label: "Shipped / In transit",
    description: "With the courier — update status as tracking scans arrive.",
    chipClasses: "bg-secondary-fixed text-on-secondary-fixed",
    icon: IconTruck,
  },
  {
    status: "delivered",
    tag: "Success",
    label: "Delivered",
    description: "Completed deliveries inside the selected range.",
    chipClasses: "bg-secondary-container text-on-secondary-container",
    icon: IconCheckCircle,
  },
];

/** Stitch-style order-status pill (dashboard-local; shared StatusBadge stays on the legacy palette for other pages). */
function statusPill(status: string): React.ReactNode {
  const pill: Record<string, string> = {
    pending_payment: "bg-primary-fixed text-primary",
    confirmed: "bg-surface-container-high text-primary",
    processing: "bg-surface-container-high text-primary",
    shipped: "bg-secondary-container text-on-secondary-container",
    delivered: "bg-secondary-fixed text-on-secondary-fixed",
    cancelled: "bg-error-container text-on-error-container",
    refunded: "bg-error-container text-on-error-container",
  };
  return (
    <span className={`inline-block rounded-full px-2 py-0.5 text-[11px] font-bold ${pill[status] ?? "bg-surface-container-high text-on-surface"}`}>
      {humanize(status)}
    </span>
  );
}

/** Compact heritage empty state for dashboard cards. */
function EmptyMini({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1.5 px-6 py-10 text-center">
      <div aria-hidden className="flex h-12 w-12 items-center justify-center rounded-full bg-surface-container-high text-primary">
        <IconDashboard className="h-6 w-6" />
      </div>
      <p className="font-heritage-display text-base font-semibold text-primary">{title}</p>
      {description ? <p className="max-w-sm text-body-sm text-on-surface-variant">{description}</p> : null}
    </div>
  );
}

/** "2026-02-05" → "05 Feb" for the best-day banner (IST calendar dates). */
function shortDateLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  return `${d} ${months[Number(m) - 1] ?? m}`;
}
