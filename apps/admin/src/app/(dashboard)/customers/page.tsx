"use client";
/**
 * /customers — the Customers console per the approved "Modern Indian Heritage" design.
 *
 * Everything on this page is real: no demo records are invented, no unsupported
 * operations are offered. Feature map (design → implementation):
 *  - summary cards (Total / New / With Orders / Repeat) come from the SAME directory
 *    response as the table below them, computed server-side over the same filtered
 *    cohort — the two can never disagree;
 *  - search (⌘K, debounced) filters server-side across name, email, phone, customer id;
 *  - filters: order activity (all / with orders / zero orders / repeat 2+), account
 *    status, registration window (all time / last 30 days / this month / custom — IST);
 *  - sort: highest spend / most orders / recent order / recently registered / name A–Z;
 *  - Export Directory → the established audited XLSX export
 *    (GET /admin/reports/exports/customers) carrying the current filters; needs
 *    reports:export — honestly disabled otherwise;
 *  - spend figures are NET COMPLETED spend (payment succeeded & not cancelled/refunded,
 *    COD counted on delivery; refunds subtracted) — pending, failed, cancelled and
 *    refunded orders never count, matching the directory's documented definitions;
 *  - View opens the detail drawer: real profile, summary tiles, default delivery
 *    address, purchase history from GET /admin/customers/:id/orders (rows link to the
 *    existing order detail pages), and internal notes (PATCH :id/notes, audited,
 *    customers:write; read-only otherwise);
 *  - no "Enroll Patron" button — the platform has no manual customer-creation workflow
 *    (profiles are provisioned by authenticated sign-in), so none is offered;
 *  - no row checkboxes — the only export scope is "current filters", applied
 *    server-side; a fake batch-action bar would be decorative.
 *
 * Data: GET /admin/customers?search=&activity=&status=&registeredFrom=&registeredTo=&sort=&page=&pageSize=
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet, apiPatch, apiPost, can, downloadFile } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import {
  formatDate,
  formatINR,
  formatNumber,
  istDayEnd,
  istDayStart,
  millisToDateInput,
  dateInputToMillis,
} from "@/lib/format";
import { relativeDayTime } from "@/lib/relative-time";
import { useToast } from "@/lib/toast";
import type {
  CustomerActivityFilter,
  CustomerDirectoryPage,
  CustomerDirectoryRow,
  CustomerDirectorySort,
  CustomerDoc,
  OrderDoc,
  Page,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select, Textarea } from "@/components/ui/form";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { CardsSkeleton, TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Drawer } from "@/components/ui/drawer";
import { IconBag, IconDownload, IconRefresh, IconRupee, IconTrendUp } from "@/components/dashboard-icons";
import { IconCustomers } from "@/components/nav-items";

const PAGE_SIZES = [10, 25, 50] as const;
const SEARCH_DEBOUNCE_MS = 350;

type RegPreset = "all" | "30d" | "month" | "custom";

const REG_PRESETS: { value: RegPreset; label: string }[] = [
  { value: "all", label: "All time" },
  { value: "30d", label: "Last 30 days" },
  { value: "month", label: "This month" },
  { value: "custom", label: "Custom range…" },
];

const ACTIVITY_OPTIONS: { value: CustomerActivityFilter; label: string }[] = [
  { value: "all", label: "Activity: All Patrons" },
  { value: "with_orders", label: "With Orders" },
  { value: "no_orders", label: "Zero Orders" },
  { value: "repeat", label: "Repeat Patrons (2+)" },
];

const SORT_OPTIONS: { value: CustomerDirectorySort; label: string }[] = [
  { value: "spend_desc", label: "Sort: Highest Spend" },
  { value: "orders_desc", label: "Sort: Most Orders" },
  { value: "recent_order", label: "Sort: Recent Order" },
  { value: "recent_registered", label: "Sort: Recently Registered" },
  { value: "name_asc", label: "Sort: Name (A–Z)" },
];

interface RegWindow {
  from?: number;
  to?: number;
  label: string;
}

/** Start of the IST calendar month containing `millis` (the "This month" preset). */
function istMonthStart(millis: number): number {
  const shifted = new Date(millis + 330 * 60_000);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - 330 * 60_000;
}

function resolveRegWindow(preset: RegPreset, customFrom: string, customTo: string): RegWindow {
  const now = Date.now();
  switch (preset) {
    case "all":
      return { label: "All time" };
    case "30d":
      return { from: istDayStart(now - 29 * 86_400_000), to: istDayEnd(now), label: "Last 30 days" };
    case "month":
      return { from: istMonthStart(now), to: istDayEnd(now), label: "This month" };
    case "custom": {
      if (!customFrom || !customTo) return { label: "Custom range — pick dates" };
      const from = istDayStart(dateInputToMillis(customFrom));
      const to = istDayEnd(dateInputToMillis(customTo));
      if (from > to) return { label: "Custom range — from must be before to" };
      return { from, to, label: `${customFrom} → ${customTo}` };
    }
  }
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  return parts
    .slice(0, 2)
    .map((p) => p.charAt(0).toUpperCase())
    .join("");
}

/** Deterministic heritage tone per customer so avatars feel varied but stable. */
const AVATAR_TONES = [
  "bg-primary/10 text-primary",
  "bg-secondary/15 text-secondary",
  "bg-tertiary-fixed text-on-tertiary-fixed-variant",
  "bg-surface-container-high text-on-surface-variant",
];
function avatarTone(uid: string): string {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[h % AVATAR_TONES.length];
}

function MetricCard({
  label,
  value,
  note,
  tone,
  icon,
}: {
  label: string;
  value: string;
  note: React.ReactNode;
  tone: "primary" | "secondary" | "neutral" | "gold";
  icon: React.ReactNode;
}) {
  const tones = {
    primary: { text: "text-primary", chip: "bg-primary-fixed text-on-primary-fixed-variant" },
    secondary: { text: "text-secondary", chip: "bg-secondary-fixed text-on-secondary-fixed-variant" },
    neutral: { text: "text-on-surface", chip: "bg-surface-container-high text-on-surface-variant" },
    gold: { text: "text-on-tertiary-fixed-variant", chip: "bg-tertiary-fixed text-on-tertiary-fixed-variant" },
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)] transition-shadow hover:shadow-[0_2px_12px_rgba(39,24,16,0.08)]">
      <span aria-hidden className="absolute -right-4 -bottom-4 -z-0 h-20 w-20 rounded-full bg-surface-container-high/40" />
      <div className="relative flex items-start justify-between gap-2">
        <span className="label-eyebrow text-on-surface-variant">{label}</span>
        <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones.chip}`}>
          {icon}
        </span>
      </div>
      <p className={`relative mt-1 font-display text-[28px] font-semibold leading-9 ${tones.text}`}>{value}</p>
      <div className="relative mt-2 flex items-center gap-1.5 text-xs text-on-surface-variant">{note}</div>
    </div>
  );
}

/** Windowed page list: 1 … c-1 c c+1 … last. */
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

export default function CustomersPage() {
  usePageTitle("Customers");
  const { principal } = useAuth();
  const toast = useToast();
  const canWrite = can(principal, "customers:write");
  const canExport = can(principal, "reports:export");

  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [activity, setActivity] = useState<CustomerActivityFilter>("all");
  const [status, setStatus] = useState<"all" | "active" | "suspended">("all");
  const [regPreset, setRegPreset] = useState<RegPreset>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [sort, setSort] = useState<CustomerDirectorySort>("spend_desc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [exporting, setExporting] = useState(false);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Deep link: ?q= prefills the search (mirrors the Orders console).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      setSearchInput(q);
      setSearch(q.trim());
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

  const regWindow = useMemo(() => resolveRegWindow(regPreset, customFrom, customTo), [regPreset, customFrom, customTo]);

  const { data, loading, error, reload } = useApiQuery<CustomerDirectoryPage>(
    () =>
      apiGet<CustomerDirectoryPage>("/admin/customers", {
        search: search || undefined,
        activity,
        status,
        registeredFrom: regWindow.from,
        registeredTo: regWindow.to,
        sort,
        page,
        pageSize,
      }),
    [search, activity, status, regWindow.from, regWindow.to, sort, page, pageSize],
  );

  /* ------------------------------ detail drawer ------------------------------ */

  const [detail, setDetail] = useState<CustomerDirectoryRow | null>(null);
  const [detailFull, setDetailFull] = useState<CustomerDoc | null>(null);
  // undefined = loading, null = unavailable (permission), Page = ready
  const [detailOrders, setDetailOrders] = useState<Page<OrderDoc> | null | undefined>(undefined);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [notesDraft, setNotesDraft] = useState("");
  const [notesSaving, setNotesSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const openDrawer = useCallback(
    (row: CustomerDirectoryRow) => {
      setDetail(row);
      setDetailFull(null);
      setDetailOrders(undefined);
      setDetailError(null);
      setNotesDraft("");
      void (async () => {
        try {
          const full = await apiGet<CustomerDoc>(`/admin/customers/${row.id}`);
          setDetailFull(full);
          setNotesDraft(full.notes ?? "");
        } catch (err) {
          setDetailError(err instanceof ApiError ? err.message : "Unexpected error");
        }
      })();
      // Best-effort: the history needs orders:read — a role with only customers:read
      // still gets the profile; the history section explains itself instead of failing.
      apiGet<Page<OrderDoc>>(`/admin/customers/${row.id}/orders`, { page: 1, pageSize: 10 })
        .then((p) => setDetailOrders(p))
        .catch(() => setDetailOrders(null));
    },
    [],
  );

  const closeDrawer = useCallback(() => {
    setDetail(null);
    setDetailFull(null);
    setDetailOrders(undefined);
    setDetailError(null);
  }, []);

  const notesDirty = detailFull !== null && notesDraft !== (detailFull.notes ?? "");

  async function saveNotes() {
    if (!detail || !detailFull || !notesDirty) return;
    setNotesSaving(true);
    try {
      const updated = await apiPatch<CustomerDoc>(`/admin/customers/${detail.id}/notes`, { note: notesDraft.trim() });
      setDetailFull(updated);
      setNotesDraft(updated.notes ?? "");
      toast.success("Note saved", `Internal note updated for ${updated.displayName}.`);
      reload();
    } catch (err) {
      toast.error("Could not save the note", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setNotesSaving(false);
    }
  }

  async function setAccountStatus(row: CustomerDirectoryRow, next: "active" | "suspended") {
    const verb = next === "suspended" ? "suspend" : "activate";
    if (
      !window.confirm(
        `Suspend or activate accounts changes sign-in access.\n\nAre you sure you want to ${verb} ${row.displayName}'s account? Their order history is preserved.`,
      )
    ) {
      return;
    }
    setBusyId(row.id);
    try {
      await apiPost(`/admin/customers/${row.id}/status`, { status: next });
      toast.success(next === "suspended" ? "Customer suspended" : "Customer activated", row.displayName);
      if (detail?.id === row.id) {
        setDetail({ ...row, accountStatus: next });
        setDetailFull((prev) => (prev ? { ...prev, accountStatus: next } : prev));
      }
      reload();
    } catch (err) {
      toast.error("Could not update the account", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusyId(null);
    }
  }

  const copyText = useCallback(
    (text: string, label: string) => {
      void navigator.clipboard
        ?.writeText(text)
        .then(() => toast.success("Copied", label))
        .catch(() => toast.error("Copy failed", "Your browser blocked clipboard access."));
    },
    [toast],
  );

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setActivity("all");
    setStatus("all");
    setRegPreset("all");
    setCustomFrom("");
    setCustomTo("");
    setSort("spend_desc");
    setPage(1);
  }

  async function exportDirectory() {
    setExporting(true);
    try {
      await downloadFile("/admin/reports/exports/customers", {
        includeDemo: "true", // the table shows demo rows (DEMO chip) — the export matches the screen
        search: search || undefined,
        activity,
        custStatus: status,
        registeredFrom: regWindow.from,
        registeredTo: regWindow.to,
        sort,
      });
      toast.success("Export ready", "annaadhya-customers .xlsx downloaded with the current filters.");
    } catch (err) {
      toast.error("Export failed", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setExporting(false);
    }
  }

  /* --------------------------------- render --------------------------------- */

  const summary = data?.summary;
  const rows = data?.items ?? [];
  const hasActiveFilters =
    Boolean(search) || activity !== "all" || status !== "all" || regPreset !== "all" || Boolean(customFrom || customTo);
  const isTrulyEmpty = data && data.total === 0 && !hasActiveFilters;
  const defaultAddress = detailFull?.addresses.find((a) => a.isDefault) ?? null;

  return (
    <div>
      <PageHeader
        eyebrow={
          <span className="rounded-full bg-secondary-fixed px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest text-on-secondary-fixed">
            Patron Directory
          </span>
        }
        title="Customers"
        description="Understand your customer base, explore purchase history, and manage verified patrons."
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-surface-container-lowest px-3 py-2 shadow-[0_1px_6px_rgba(39,24,16,0.06)] transition-colors hover:bg-surface-container-low">
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-outline" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4m8-4v4" strokeLinecap="round" />
              </svg>
              <Select
                aria-label="Registration window"
                className="cursor-pointer border-0 bg-transparent p-0 pr-5 text-xs font-semibold text-on-surface shadow-none focus:ring-0"
                value={regPreset}
                onChange={(e) => {
                  setRegPreset(e.target.value as RegPreset);
                  setPage(1);
                }}
              >
                {REG_PRESETS.map((r) => (
                  <option key={r.value} value={r.value}>
                    {r.value === "custom" && customFrom && customTo ? `${customFrom} → ${customTo}` : r.label}
                  </option>
                ))}
              </Select>
            </label>
            <span title={canExport ? "Download the current view as XLSX" : "Needs the reports:export permission"}>
              <Button variant="secondary" onClick={() => void exportDirectory()} disabled={!canExport || exporting} loading={exporting}>
                <IconDownload className="h-4 w-4" />
                Export Directory
              </Button>
            </span>
          </>
        }
      />

      {/* ------------------------------ summary cards ------------------------------ */}
      {!data && loading ? (
        <div className="mb-6">
          <CardsSkeleton count={4} />
        </div>
      ) : summary ? (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Customer summary">
          <MetricCard
            label="Total Customers"
            value={formatNumber(summary.totalCustomers)}
            tone="primary"
            icon={<IconCustomers className="h-5 w-5" />}
            note={<span>registered patron accounts in this view</span>}
          />
          <MetricCard
            label="New Customers"
            value={formatNumber(summary.newCustomers)}
            tone="secondary"
            icon={<IconTrendUp className="h-5 w-5" />}
            note={<span>registered {summary.newCustomersWindow} (IST)</span>}
          />
          <MetricCard
            label="Customers with Orders"
            value={formatNumber(summary.customersWithOrders)}
            tone="neutral"
            icon={<IconBag className="h-5 w-5" />}
            note={
              <span>
                {summary.totalCustomers > 0
                  ? `${Math.round((summary.customersWithOrders / summary.totalCustomers) * 1000) / 10}% conversion to first order`
                  : "no customers in this view"}
              </span>
            }
          />
          <MetricCard
            label="Repeat Customers"
            value={formatNumber(summary.repeatCustomers)}
            tone="gold"
            icon={<IconRefresh className="h-5 w-5" />}
            note={
              <span>
                {summary.avgOrdersPerRepeat !== null ? (
                  <>
                    avg <span className="font-bold text-on-surface">{summary.avgOrdersPerRepeat}</span> orders per repeat
                    patron
                  </>
                ) : (
                  "no repeat patrons in this view yet"
                )}
              </span>
            }
          />
        </div>
      ) : null}
      {summary && summary.lifetimeSpendPaise > 0 ? (
        <p className="mb-4 -mt-3 text-[11px] text-outline">
          Completed lifetime volume in this view: <span className="font-bold text-on-surface-variant">{formatINR(summary.lifetimeSpendPaise)}</span> —
          net of refunds, counting only completed orders (online payments captured, COD delivered). Cancelled, refunded and unpaid orders are excluded.
        </p>
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
              placeholder="Search by customer name, email, phone, or customer ID…"
              aria-label="Search customers"
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
                aria-label="Filter by order activity"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={activity}
                onChange={(e) => {
                  setActivity(e.target.value as CustomerActivityFilter);
                  setPage(1);
                }}
              >
                {ACTIVITY_OPTIONS.map((a) => (
                  <option key={a.value} value={a.value}>
                    {a.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select
                aria-label="Filter by account status"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as typeof status);
                  setPage(1);
                }}
              >
                <option value="all">Status: All</option>
                <option value="active">Active</option>
                <option value="suspended">Suspended</option>
              </Select>
            </div>
            <div className="w-48">
              <Select
                aria-label="Sort customers"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as CustomerDirectorySort);
                  setPage(1);
                }}
              >
                {SORT_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
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
        {regPreset === "custom" ? (
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
            <span className="text-xs text-outline">Registration dates are IST calendar days.</span>
          </div>
        ) : null}
      </div>

      {/* ------------------------------- table ------------------------------ */}
      <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        {loading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : !data || data.items.length === 0 ? (
          isTrulyEmpty ? (
            <EmptyState
              title="No customers yet"
              description="Customer profiles appear here after the first storefront sign-in or order."
            />
          ) : (
            <EmptyState
              title="No customers match"
              description="Try widening the registration window, or clear the search and filters."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Reset filters
                </Button>
              }
            />
          )
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH scope="col">Customer</TH>
                  <TH scope="col">Contact</TH>
                  <TH scope="col">Registered</TH>
                  <TH scope="col" className="text-center">
                    Orders
                  </TH>
                  <TH scope="col" className="text-right">
                    Total Spend
                  </TH>
                  <TH scope="col">Last Order</TH>
                  <TH scope="col" className="text-center">
                    Status
                  </TH>
                  <TH scope="col" className="text-right">
                    Actions
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((c) => (
                  <TR key={c.id}>
                    <TD className="max-w-[13rem]">
                      <div className="flex items-center gap-2.5">
                        <span
                          aria-hidden
                          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[12px] font-bold ${avatarTone(c.uid)}`}
                        >
                          {initials(c.displayName)}
                        </span>
                        <div className="min-w-0">
                          <button
                            type="button"
                            onClick={() => openDrawer(c)}
                            className="block max-w-[11rem] truncate text-left font-semibold text-primary hover:underline"
                            title={c.displayName}
                          >
                            {c.displayName}
                          </button>
                          <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                            <span className="font-mono">#{c.id}</span>
                            {c.isDemo ? (
                              <span className="rounded bg-tertiary-fixed px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-tertiary-fixed-variant">
                                Demo
                              </span>
                            ) : null}
                          </span>
                        </div>
                      </div>
                    </TD>
                    <TD className="max-w-[13rem]">
                      <span className="block truncate text-on-surface" title={c.email ?? undefined}>
                        {c.email ?? <span className="italic text-outline">No email</span>}
                      </span>
                      <span className="block truncate text-xs text-on-surface-variant" title={c.phone ?? undefined}>
                        {c.phone || <span className="italic text-outline">No phone</span>}
                      </span>
                    </TD>
                    <TD className="whitespace-nowrap text-on-surface-variant">{formatDate(c.createdAt)}</TD>
                    <TD className="text-center">
                      <span className="inline-flex items-center rounded-full bg-surface-container px-2.5 py-0.5 text-xs font-semibold text-on-surface">
                        {c.orderCount} {c.orderCount === 1 ? "order" : "orders"}
                      </span>
                      <span className="mt-0.5 block text-[11px] text-outline">{c.completedOrderCount} completed</span>
                    </TD>
                    <TD className="whitespace-nowrap text-right">
                      <span className="font-display text-[15px] font-bold text-primary">{formatINR(c.totalSpendPaise)}</span>
                      <span className="block text-[11px] text-outline">net completed</span>
                    </TD>
                    <TD className="whitespace-nowrap">
                      {c.lastOrderAt ? (
                        <>
                          <span className="block font-medium text-on-surface">{relativeDayTime(c.lastOrderAt)}</span>
                          {c.lastOrderId && c.lastOrderNumber ? (
                            <Link href={`/orders/${c.lastOrderId}`} className="text-xs text-secondary hover:underline">
                              {c.lastOrderNumber}
                            </Link>
                          ) : null}
                        </>
                      ) : (
                        <span className="text-xs italic text-outline">No orders yet</span>
                      )}
                    </TD>
                    <TD className="text-center">
                      <StatusBadge status={c.accountStatus} />
                    </TD>
                    <TD className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openDrawer(c)}
                          className="inline-block rounded bg-surface-container-low px-2.5 py-1 text-xs font-bold text-primary shadow-sm transition-colors hover:bg-surface-container"
                        >
                          View
                        </button>
                        {canWrite ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            className={c.accountStatus === "active" ? "text-error hover:bg-error-container/40" : ""}
                            disabled={busyId === c.id}
                            onClick={() =>
                              void setAccountStatus(c, c.accountStatus === "active" ? "suspended" : "active")
                            }
                          >
                            {c.accountStatus === "active" ? "Suspend" : "Activate"}
                          </Button>
                        ) : null}
                      </div>
                    </TD>
                  </TR>
                ))}
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
                  of <strong className="text-on-surface">{formatNumber(data.total)}</strong> registered customers
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
                    aria-label="Customers per page"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n} per page
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <nav aria-label="Customers pagination" className="flex items-center gap-1">
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
        Contact details are masked server-side for roles without customers:write · Spend = net completed orders ·
        Timestamps in Indian Standard Time (IST — UTC+05:30).
      </p>

      {/* ------------------------------- detail drawer ------------------------------ */}
      <Drawer
        open={Boolean(detail)}
        onClose={closeDrawer}
        title={
          detail ? (
            <div className="flex items-center gap-3">
              <span
                aria-hidden
                className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-sm font-bold ${avatarTone(detail.uid)}`}
              >
                {initials(detail.displayName)}
              </span>
              <div className="min-w-0">
                <p className="flex items-center gap-2 truncate font-display text-lg font-semibold text-on-surface">
                  {detail.displayName}
                  <StatusBadge status={detail.accountStatus} />
                </p>
                <p className="truncate text-xs text-on-surface-variant">
                  <span className="font-mono">#{detail.id}</span> · patron since {formatDate(detail.createdAt)}
                </p>
              </div>
            </div>
          ) : (
            "Customer"
          )
        }
        footer={
          detail ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button variant="outline" size="sm" onClick={() => copyText(detail.id, "Customer ID copied")}>
                Copy Customer ID
              </Button>
              {canWrite ? (
                <Button
                  variant={detail.accountStatus === "active" ? "outline" : "secondary"}
                  size="sm"
                  className={detail.accountStatus === "active" ? "text-error hover:bg-error-container/40" : ""}
                  disabled={busyId === detail.id}
                  onClick={() => void setAccountStatus(detail, detail.accountStatus === "active" ? "suspended" : "active")}
                >
                  {detail.accountStatus === "active" ? "Suspend Account" : "Activate Account"}
                </Button>
              ) : null}
            </div>
          ) : undefined
        }
      >
        {detail ? (
          <div className="space-y-5">
            {detailError ? (
              <p className="rounded-lg bg-error-container px-3 py-2 text-xs text-on-error-container">
                Could not load the full profile: {detailError}
              </p>
            ) : null}

            {/* summary tiles */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-xl bg-surface-container-low px-3 py-2.5 text-center">
                <p className="label-eyebrow text-on-surface-variant">Orders</p>
                <p className="mt-1 font-display text-xl font-bold text-primary">{detail.orderCount}</p>
                <p className="text-[10px] text-outline">{detail.completedOrderCount} completed</p>
              </div>
              <div className="rounded-xl bg-surface-container-low px-3 py-2.5 text-center">
                <p className="label-eyebrow text-on-surface-variant">Total Spend</p>
                <p className="mt-1 font-display text-xl font-bold text-primary">{formatINR(detail.totalSpendPaise)}</p>
                <p className="text-[10px] text-outline">net completed</p>
              </div>
              <div className="rounded-xl bg-surface-container-low px-3 py-2.5 text-center">
                <p className="label-eyebrow text-on-surface-variant">AOV</p>
                <p className="mt-1 font-display text-xl font-bold text-primary">
                  {detail.completedOrderCount > 0 ? formatINR(Math.round(detail.totalSpendPaise / detail.completedOrderCount)) : "—"}
                </p>
                <p className="text-[10px] text-outline">avg order value</p>
              </div>
              <div className="rounded-xl bg-surface-container-low px-3 py-2.5 text-center">
                <p className="label-eyebrow text-on-surface-variant">Recent Order</p>
                {detail.lastOrderId && detail.lastOrderNumber ? (
                  <Link
                    href={`/orders/${detail.lastOrderId}`}
                    className="mt-1 block truncate font-display text-sm font-bold text-secondary hover:underline"
                  >
                    {detail.lastOrderNumber}
                  </Link>
                ) : (
                  <p className="mt-1 font-display text-xl font-bold text-outline">—</p>
                )}
                <p className="text-[10px] text-outline">{detail.lastOrderAt ? relativeDayTime(detail.lastOrderAt) : "no orders yet"}</p>
              </div>
            </div>

            {/* contact & delivery logistics */}
            <section>
              <h3 className="label-eyebrow mb-2 flex items-center gap-1.5 text-secondary">Contact &amp; Delivery Logistics</h3>
              <div className="rounded-xl bg-surface-container-low p-4 text-sm">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <p className="label-eyebrow text-on-surface-variant">Direct contact</p>
                    <p className="mt-1 flex items-center gap-1.5">
                      <span className="truncate">{detailFull?.email ?? detail.email ?? "—"}</span>
                      {detailFull?.email || detail.email ? (
                        <button
                          type="button"
                          title="Copy email"
                          aria-label="Copy email"
                          className="text-outline hover:text-primary"
                          onClick={() => copyText(detailFull?.email ?? detail.email ?? "", "Email copied")}
                        >
                          <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="9" y="9" width="11" height="11" rx="2" />
                            <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
                          </svg>
                        </button>
                      ) : null}
                    </p>
                    <p className="mt-0.5 flex items-center gap-1.5">
                      <span className="truncate">{detailFull?.phone ?? detail.phone ?? "—"}</span>
                      {detailFull?.phone || detail.phone ? (
                        <button
                          type="button"
                          title="Copy phone"
                          aria-label="Copy phone"
                          className="text-outline hover:text-primary"
                          onClick={() => copyText(detailFull?.phone ?? detail.phone ?? "", "Phone copied")}
                        >
                          <svg aria-hidden viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8">
                            <rect x="9" y="9" width="11" height="11" rx="2" />
                            <path d="M5 15V5a2 2 0 0 1 2-2h10" strokeLinecap="round" />
                          </svg>
                        </button>
                      ) : null}
                    </p>
                    <p className="mt-2 flex flex-wrap items-center gap-1.5">
                      <Badge tone={detail.marketingOptIn ? "green" : "neutral"}>
                        {detail.marketingOptIn ? "Marketing opt-in" : "No marketing opt-in"}
                      </Badge>
                      {(detail.providers ?? []).map((p) => (
                        <Badge key={p} tone="neutral">
                          {p}
                        </Badge>
                      ))}
                    </p>
                  </div>
                  <div>
                    <p className="label-eyebrow text-on-surface-variant">Default delivery address</p>
                    {!canWrite && !(detailFull && detailFull.addresses.length > 0) ? (
                      <p className="mt-1 text-xs italic text-on-surface-variant">
                        Addresses are hidden server-side for roles without customers:write.
                      </p>
                    ) : defaultAddress ? (
                      <address className="mt-1 not-italic text-on-surface-variant">
                        <span className="block font-semibold text-on-surface">
                          {defaultAddress.label} · {defaultAddress.fullName}
                        </span>
                        {defaultAddress.line1}
                        {defaultAddress.line2 ? `, ${defaultAddress.line2}` : ""}
                        {defaultAddress.landmark ? ` (${defaultAddress.landmark})` : ""}
                        <span className="block">
                          {defaultAddress.city}, {defaultAddress.state} — {defaultAddress.pincode}
                        </span>
                        <span className="block text-xs">{defaultAddress.phone}</span>
                      </address>
                    ) : detailFull ? (
                      <p className="mt-1 text-xs italic text-on-surface-variant">No saved addresses.</p>
                    ) : (
                      <p className="mt-1 text-xs text-outline">Loading…</p>
                    )}
                  </div>
                </div>
              </div>
            </section>

            {/* purchase history */}
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="label-eyebrow flex items-center gap-1.5 text-secondary">Purchase History</h3>
                {detailOrders ? (
                  <span className="text-[11px] text-outline">{detailOrders.total} order{detailOrders.total === 1 ? "" : "s"} on record</span>
                ) : null}
              </div>
              {detailOrders === undefined ? (
                <p className="rounded-xl bg-surface-container-low px-3 py-6 text-center text-xs text-outline">Loading order history…</p>
              ) : detailOrders === null ? (
                <p className="rounded-xl bg-surface-container-low px-3 py-6 text-center text-xs text-on-surface-variant">
                  Order history needs the orders:read permission — ask an owner to review this customer&apos;s orders.
                </p>
              ) : detailOrders.items.length === 0 ? (
                <div className="rounded-xl bg-surface-container-low px-3 py-6 text-center">
                  <p className="text-sm font-semibold text-on-surface">No orders yet</p>
                  <p className="mt-1 text-xs text-on-surface-variant">
                    This customer has not placed an order — their purchases will appear here.
                  </p>
                </div>
              ) : (
                <>
                  <div className="overflow-hidden rounded-xl ring-1 ring-outline-variant/30">
                    <Table>
                      <THead>
                        <TR>
                          <TH scope="col">Order</TH>
                          <TH scope="col">Placed</TH>
                          <TH scope="col" className="text-center">
                            Items
                          </TH>
                          <TH scope="col" className="text-right">
                            Amount
                          </TH>
                          <TH scope="col">Payment</TH>
                          <TH scope="col">Fulfilment</TH>
                          <TH scope="col" className="text-right">
                            Actions
                          </TH>
                        </TR>
                      </THead>
                      <TBody>
                        {detailOrders.items.map((o) => (
                          <TR key={o.id}>
                            <TD>
                              <Link href={`/orders/${o.id}`} className="font-display text-[13px] font-bold text-primary hover:underline">
                                {o.orderNumber}
                              </Link>
                            </TD>
                            <TD className="whitespace-nowrap text-on-surface-variant">{formatDate(o.createdAt)}</TD>
                            <TD className="text-center">{o.items.reduce((n, i) => n + i.qty, 0)}</TD>
                            <TD className="whitespace-nowrap text-right font-semibold">{formatINR(o.totalPaise)}</TD>
                            <TD>
                              <StatusBadge status={o.paymentStatus} />
                            </TD>
                            <TD>
                              <StatusBadge status={o.status} />
                            </TD>
                            <TD className="text-right">
                              <Link
                                href={`/orders/${o.id}`}
                                className="inline-block rounded bg-surface-container-low px-2 py-0.5 text-xs font-bold text-primary shadow-sm transition-colors hover:bg-surface-container"
                              >
                                View
                              </Link>
                            </TD>
                          </TR>
                        ))}
                      </TBody>
                    </Table>
                  </div>
                  {detailOrders.total > detailOrders.items.length ? (
                    <p className="mt-2 text-[11px] text-outline">
                      Showing the {detailOrders.items.length} most recent of {detailOrders.total} orders.
                    </p>
                  ) : null}
                  <Link
                    href={`/orders?q=${encodeURIComponent(detailFull?.email ?? detail.displayName)}`}
                    className="mt-2 inline-block text-xs font-semibold text-secondary hover:underline"
                  >
                    Search all orders for this patron in the Orders console →
                  </Link>
                </>
              )}
            </section>

            {/* internal notes */}
            <section>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="label-eyebrow flex items-center gap-1.5 text-secondary">Internal Notes (Confidential)</h3>
                <span className="text-[11px] text-outline">
                  {canWrite ? (notesDirty ? "Unsaved changes" : notesSaving ? "Saving…" : "Saved") : "read-only"}
                </span>
              </div>
              {canWrite ? (
                <div>
                  <Textarea
                    rows={4}
                    value={notesDraft}
                    maxLength={2000}
                    onChange={(e) => setNotesDraft(e.target.value)}
                    placeholder="Private notes for staff — e.g. gifting preferences, delivery quirks, support history. Never shown to the customer."
                    aria-label="Internal notes"
                  />
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span className="text-[11px] text-outline">
                      {notesDraft.trim().length}/2000 · clearing the note and saving deletes it · every change is audited
                    </span>
                    <Button size="sm" disabled={!notesDirty || notesSaving} loading={notesSaving} onClick={() => void saveNotes()}>
                      Save note
                    </Button>
                  </div>
                </div>
              ) : detailFull?.notes ? (
                <p className="rounded-xl bg-surface-container-low p-3 text-sm text-on-surface-variant">{detailFull.notes}</p>
              ) : (
                <p className="rounded-xl bg-surface-container-low px-3 py-4 text-xs italic text-on-surface-variant">
                  No internal notes. Notes are written by roles with customers:write.
                </p>
              )}
            </section>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
