"use client";
/**
 * /reports — the Reports & Exports console, redesigned to the approved "Modern Indian
 * Heritage" Stitch reference (editorial ledgers list + governance strip). This is a UI
 * redesign only: every download is the same audited server-generated XLSX as before.
 *
 * Behaviour preserved exactly:
 *  - the ledger list comes from GET /admin/reports/types (needs reports:read) — the API
 *    stays the single source of truth for which exports exist (11 today);
 *  - downloads call GET /admin/reports/exports/:type (needs reports:export) through the
 *    established downloadFile() helper: bearer token rides in the Authorization header
 *    (never in a URL) and the server's bytes are handed to the browser via an object URL
 *    that downloadFile() revokes after the download starts;
 *  - every download sends includeDemo=false, so demo/demo-seeded records never mix into
 *    live ledgers (each sheet also says so in its subtitle);
 *  - the API enforces permissions, masks customer PII per the caller's role and writes a
 *    report.export audit entry per download — hiding buttons here is a courtesy, not the
 *    security boundary;
 *  - server's Content-Disposition filename wins (annaadhya-<type>-<date>.xlsx).
 *
 * What the redesign adds (UI only):
 *  - per-ledger download state machine: idle → Preparing… → Downloaded, tracked per row
 *    so one export never disables the others and a row's own button cannot be re-clicked
 *    while its export is in flight (no duplicate downloads);
 *  - "Downloaded" is shown only after downloadFile() resolves — i.e. after the full
 *    workbook was received from the API — never merely because a request was initiated;
 *  - failures keep the row intact, surface the server's message via toast + an inline
 *    aria-live status (never a stack trace), and leave the button ready for retry;
 *  - row feedback is accessible: aria-busy on the button, role="status" live region,
 *    and disabled/permission states that read as text rather than colour alone.
 */
import { useEffect, useRef, useState, type ReactNode } from "react";
import { ApiError, apiGet, can, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { useToast } from "@/lib/toast";
import type { ExportType } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { IconBoxes, IconCheckCircle, IconEye, IconRefresh, IconTrendUp } from "@/components/dashboard-icons";
import {
  IconCustomers,
  IconExpenses,
  IconInventory,
  IconOrders,
  IconProducts,
  IconSuppliers,
  IconSupplierNetwork,
} from "@/components/nav-items";

type IconComponent = (props: { className?: string }) => ReactNode;
type ChipTone = "neutral" | "green" | "amber" | "honey";

const CHIP_TONES: Record<ChipTone, string> = {
  neutral: "bg-surface-container-high text-on-surface-variant",
  green: "bg-secondary-fixed text-on-secondary-fixed-variant",
  amber: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  honey: "bg-tertiary-container text-on-tertiary-container",
};

/** Static presentation metadata per export type — endpoints/descriptions match the API. */
const LEDGER_META: Record<ExportType, { title: string; category: string; tone: ChipTone; description: string; icon: IconComponent }> = {
  products: {
    title: "Products",
    category: "Catalog",
    tone: "neutral",
    description:
      "Full product catalogue including SKU, name, subtitle, category, status, merchandising ranks, gift flag, and SEO fields.",
    icon: IconProducts,
  },
  variants: {
    title: "Variants",
    category: "Catalog",
    tone: "neutral",
    description:
      "Pack-level rows including SKU, pack label, grams, price, MRP, stock on hand, reserved quantity, and threshold.",
    icon: IconBoxes,
  },
  orders: {
    title: "Orders",
    category: "Fulfillment",
    tone: "green",
    description:
      "Order records including order number, customer contact, address snapshot, totals, payment and fulfilment status, and refunds.",
    icon: IconOrders,
  },
  customers: {
    title: "Customers",
    category: "Directory",
    tone: "neutral",
    description:
      "Customer directory with personal information masked according to the viewer's permissions.",
    icon: IconCustomers,
  },
  inventory_balances: {
    title: "Inventory Balances",
    category: "Inventory",
    tone: "green",
    description:
      "Current stock on hand, reserved quantity, available quantity, low-stock threshold, and status for each variant.",
    icon: IconInventory,
  },
  inventory_movements: {
    title: "Inventory Movements",
    category: "Inventory",
    tone: "green",
    description:
      "Inventory movement ledger including movement type, signed quantity changes, resulting balances, mandatory reason, and performed-by information.",
    icon: IconRefresh,
  },
  suppliers: {
    title: "Suppliers",
    category: "Sourcing",
    tone: "amber",
    description:
      "Supplier directory with contact details, location and matched product SKUs. Rates are procurement costs, not selling prices.",
    icon: IconSuppliers,
  },
  purchases: {
    title: "Purchases",
    category: "Procurement",
    tone: "amber",
    description:
      "Purchase orders with per-line ordered/received quantities and unit costs (landed-cost inputs).",
    icon: IconSupplierNetwork,
  },
  expenses: {
    title: "Expenses",
    category: "Operations",
    tone: "honey",
    description:
      "Expense log with date, category, amount, payee and reference. The settlement view matches the Expenses console.",
    icon: IconExpenses,
  },
  sales_summary: {
    title: "Sales Summary",
    category: "Insights",
    tone: "honey",
    description:
      "Range totals: gross sales, discounts, refunds, net sales, payments collected, AOV, order counts.",
    icon: IconTrendUp,
  },
  newsletter_subscribers: {
    title: "Newsletter Subscribers",
    category: "Marketing",
    tone: "neutral",
    description:
      "Marketing email list captured on the storefront: address, status, capture source and dates. Personal data — import only into tools that honour unsubscribe.",
    icon: IconEye,
  },
};

/** File/document glyph shown on the Download button (same 24px stroke conventions). */
function FileIcon({ className = "" }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8l-5-5Z" />
      <path d="M14 3v5h5" />
      <path d="M9 13h6M9 17h6" />
    </svg>
  );
}

/** Spinner matching the shared Button primitive. */
function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 24 24" className={`animate-spin ${className}`} fill="none" stroke="currentColor" strokeWidth={3}>
      <circle cx="12" cy="12" r="9" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" strokeLinecap="round" />
    </svg>
  );
}

/** Skeleton row matching the ledger-row layout while the type list loads. */
function RowSkeleton() {
  return (
    <li className="flex flex-col gap-4 p-4 sm:p-6 md:flex-row md:items-center md:justify-between">
      <div className="flex min-w-0 flex-1 items-start gap-4">
        <div className="h-12 w-12 shrink-0 animate-pulse rounded-xl bg-surface-container-high" />
        <div className="min-w-0 flex-1 space-y-2">
          <div className="h-5 w-44 animate-pulse rounded bg-surface-container-high" />
          <div className="h-3.5 w-full max-w-md animate-pulse rounded bg-surface-container" />
          <div className="h-3 w-24 animate-pulse rounded bg-surface-container" />
        </div>
      </div>
      <div className="h-11 w-44 shrink-0 animate-pulse rounded-lg bg-surface-container-high" />
    </li>
  );
}

export default function ReportsPage() {
  usePageTitle("Reports");
  const { principal } = useAuth();
  const toast = useToast();
  const canExport = can(principal, "reports:export");

  const { data, loading, error, reload } = useApiQuery<ExportType[]>(() => apiGet("/admin/reports/types"));
  // Per-ledger state: a Set of in-flight exports (one download never blocks the others)
  // plus a transient "just downloaded" marker for the success affordance.
  const [busy, setBusy] = useState<ReadonlySet<string>>(() => new Set());
  const [done, setDone] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState("");
  const doneTimer = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (doneTimer.current !== null) window.clearTimeout(doneTimer.current);
    },
    [],
  );

  async function runExport(type: ExportType) {
    if (busy.has(type)) return; // no duplicate downloads for an in-flight export
    const title = LEDGER_META[type]?.title ?? type;
    setBusy((prev) => new Set(prev).add(type));
    setDone(null);
    setLiveStatus(`Preparing the ${title} workbook…`);
    try {
      // includeDemo is omitted → the API defaults to the reporting setting (false = live only).
      await downloadFile(`/admin/reports/exports/${type}`, { includeDemo: "false" });
      // Resolved = the full workbook was received from the API, so "Downloaded" is honest.
      setDone(type);
      setLiveStatus(`${title} workbook downloaded.`);
      toast.success("Export ready", `${title} workbook downloaded (live data only)`);
      doneTimer.current = window.setTimeout(() => {
        setDone((cur) => (cur === type ? null : cur));
        doneTimer.current = null;
      }, 2600);
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Unexpected error";
      setLiveStatus(`${title} export failed — ${message}`);
      toast.error("Export failed", message);
    } finally {
      setBusy((prev) => {
        const next = new Set(prev);
        next.delete(type);
        return next;
      });
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow={
          <span className="flex flex-wrap items-center gap-2">
            <span aria-label="Breadcrumb" className="flex items-center gap-1.5">
              <span className="text-outline">Annaadhya</span>
              <span aria-hidden className="text-outline-variant">/</span>
              <span className="font-bold text-primary">Reports &amp; Exports</span>
            </span>
            <span className="inline-flex items-center gap-1 rounded-full bg-secondary-fixed px-2.5 py-0.5 text-[11px] font-semibold tracking-[0.06em] text-on-secondary-fixed-variant">
              <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round">
                <rect x="3" y="4" width="18" height="16" rx="2" />
                <path d="M3 10h18M9 10v10M15 10v10" />
              </svg>
              Excel exports (.xlsx)
            </span>
          </span>
        }
        title="Reports & Exports"
        description="Download structured business data for analysis, record keeping, and reporting. All exports are server-generated workbook spreadsheets, stamped with the date of export."
        actions={
          <div className="flex items-center gap-2.5 rounded-xl bg-surface-container-low px-4 py-2 shadow-[0_1px_6px_rgba(39,24,16,0.06)]">
            <IconCheckCircle className="h-5 w-5 shrink-0 text-secondary" />
            <div className="flex flex-col text-left">
              <span className="label-eyebrow text-on-surface-variant">Format Standard</span>
              <span className="text-[13px] text-on-surface-variant">OpenXML Workbook (.xlsx)</span>
            </div>
          </div>
        }
      />

      {/* ------------------------- governance / trust strip ------------------------- */}
      <section
        aria-label="Data governance"
        className="mb-8 flex flex-col gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)] sm:flex-row sm:items-center sm:justify-between"
      >
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-primary">
            <svg aria-hidden viewBox="0 0 24 24" className="h-4.5 w-4.5" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 3l7 3v5c0 4.4-2.9 8.2-7 10-4.1-1.8-7-5.6-7-10V6l7-3Z" />
              <path d="M9.5 12l1.8 1.8 3.2-3.6" />
            </svg>
          </span>
          <p className="text-[13px] leading-relaxed text-on-surface-variant">
            <strong className="font-semibold text-on-surface">Data governance active:</strong> access to reports and
            exported data depends on your assigned permissions. Customer PII is masked in accordance with role policies,
            and every download requests <code className="rounded bg-surface-container px-1 py-0.5 font-mono text-[11px]">includeDemo=false</code>{" "}
            so demo records never mix into live ledgers.
          </p>
        </div>
        <span className="label-eyebrow hidden shrink-0 items-center gap-1.5 rounded bg-surface-container-low px-2 py-1 text-on-surface-variant lg:inline-flex">
          <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-secondary" />
          Encrypted Transit
        </span>
      </section>

      {/* ----------------------------- available exports ---------------------------- */}
      <section aria-labelledby="available-exports-heading">
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="available-exports-heading" className="font-heritage-display text-2xl font-medium tracking-tight text-primary">
              Available Exports
            </h2>
            <p className="mt-0.5 text-[13px] text-on-surface-variant">
              Choose a report below to trigger an immediate, server-side spreadsheet generation.
            </p>
          </div>
          {data ? (
            <span className="label-eyebrow text-on-surface-variant">
              {data.length} Core Ledgers
            </span>
          ) : null}
        </div>

        {loading ? (
          <ul aria-label="Loading exports" className="divide-y divide-outline-variant/40 overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
            {Array.from({ length: 6 }, (_, i) => (
              <RowSkeleton key={i} />
            ))}
          </ul>
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No export types" description="The API did not return any export types." />
        ) : (
          <ul className="divide-y divide-outline-variant/40 overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
            {data.map((type) => {
              const meta = LEDGER_META[type] ?? {
                title: type,
                category: "Export",
                tone: "neutral" as ChipTone,
                description: "Server-generated Excel export.",
                icon: FileIcon,
              };
              const Icon = meta.icon;
              const isBusy = busy.has(type);
              const isFresh = done === type && !isBusy;
              return (
                <li
                  key={type}
                  className="group flex flex-col justify-between gap-4 bg-surface-container-lowest p-4 transition-colors duration-150 hover:bg-surface-container-low sm:p-6 md:flex-row md:items-center"
                >
                  <div className="flex min-w-0 flex-1 items-start gap-4">
                    <div
                      aria-hidden
                      className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-surface-container-high text-primary transition-transform duration-200 group-hover:scale-105"
                    >
                      <Icon className="h-6 w-6" />
                    </div>
                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="font-heritage-display text-xl font-semibold text-on-surface transition-colors group-hover:text-primary">
                          {meta.title}
                        </h3>
                        <span className={`label-eyebrow rounded-full px-2.5 py-0.5 ${CHIP_TONES[meta.tone]}`}>{meta.category}</span>
                        <code className="break-all rounded bg-surface-container px-2 py-0.5 font-mono text-[11px] leading-4 text-on-surface-variant">
                          GET /admin/reports/exports/{type}
                        </code>
                      </div>
                      <p className="max-w-3xl text-[13px] leading-relaxed text-on-surface-variant">{meta.description}</p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 self-start md:self-center">
                    {canExport ? (
                      <button
                        type="button"
                        onClick={() => void runExport(type)}
                        disabled={isBusy}
                        aria-busy={isBusy}
                        className={`inline-flex min-w-[11rem] items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold shadow-sm transition-all focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary active:scale-[0.98] ${
                          isBusy
                            ? "cursor-wait bg-surface-container-low text-primary opacity-70"
                            : isFresh
                              ? "bg-secondary text-on-secondary"
                              : "bg-surface-container-low text-primary hover:bg-primary hover:text-on-primary"
                        }`}
                      >
                        {isBusy ? (
                          <Spinner className="h-4 w-4" />
                        ) : isFresh ? (
                          <IconCheckCircle className="h-4 w-4" />
                        ) : (
                          <FileIcon className="h-4 w-4 text-secondary" />
                        )}
                        {isBusy ? "Preparing…" : isFresh ? "Downloaded" : "Download .xlsx"}
                      </button>
                    ) : (
                      <span className="inline-flex min-w-[11rem] items-center justify-center gap-1.5 rounded-lg bg-surface-container-low px-5 py-2.5 text-[13px] font-semibold text-on-surface-variant">
                        <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round">
                          <rect x="5" y="11" width="14" height="9" rx="2" />
                          <path d="M8 11V7a4 4 0 0 1 8 0v4" />
                        </svg>
                        Needs reports:export
                      </span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {/* ------------------------------- live status -------------------------------- */}
      <p role="status" aria-live="polite" className="sr-only">
        {liveStatus}
      </p>

      {/* ------------------------------ data footnote ------------------------------- */}
      <div className="mt-8 flex flex-col items-center justify-between gap-2 border-t border-outline-variant/30 pt-4 text-[13px] text-on-surface-variant sm:flex-row">
        <p className="flex items-center gap-2 text-center sm:text-left">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full bg-secondary" />
          All timestamps are recorded in IST (UTC+05:30). Amounts are stored in exact paise and rendered to 2 decimal places.
        </p>
        <p className="font-mono text-[11px] text-outline">Annaadhya Commerce Engine · server-generated .xlsx</p>
      </div>
    </div>
  );
}
