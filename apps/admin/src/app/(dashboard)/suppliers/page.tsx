"use client";
/**
 * /suppliers — the sourcing directory per the approved "Modern Indian Heritage" design.
 *
 * Everything on this page is real — no demo rows, no invented history:
 *  - GET  /admin/suppliers/ledger      → paginated rows (search/type/category/status/sort)
 *                                        + summary metrics over the SAME filtered scope
 *  - POST /admin/suppliers             → create (suppliers:write, audited server-side)
 *  - POST /admin/suppliers/:id         → update (suppliers:write, audited server-side)
 *  - POST /admin/suppliers/:id/status  → activate / seasonal pause (history untouched)
 *  - GET  /admin/catalogue/categories  → real category filter options
 *
 * Honest-scope notes:
 *  - "Last consignment" comes from the purchases collection; suppliers with no
 *    purchases show an honest empty state, never a fabricated date.
 *  - Negotiated rates are procurement costs — the page never mixes them with the
 *    customer-facing selling prices on product variants.
 *  - Purchasing & goods receiving deliberately live on the separate Purchases page.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { formatDate, formatINR, formatNumber } from "@/lib/format";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { useToast } from "@/lib/toast";
import type {
  CategoryDoc,
  Page,
  ProductWithVariants,
  SupplierLedgerPage,
  SupplierLedgerRow,
  SupplierSort,
  SupplierStatusFilter,
  SupplierType,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { SupplierFormDialog } from "@/components/suppliers/supplier-form-dialog";
import { SupplierDetailDrawer, supplierTypeLabel } from "@/components/suppliers/supplier-detail-drawer";
import { IconChevronLeft, IconChevronRight, IconDownload, IconPlus } from "@/components/inventory/icons";
import {
  IconCoop,
  IconEdit,
  IconEstate,
  IconEye,
  IconLeaf,
  IconOther,
  IconPackage,
  IconPause,
  IconPlay,
  IconShield,
  IconSparkle,
  IconUsers,
} from "@/components/suppliers/icons";

const PAGE_SIZE = 10;

const SORT_OPTIONS: { value: SupplierSort; label: string }[] = [
  { value: "recently_added", label: "Sort: Recently partnered" },
  { value: "recent_purchase", label: "Sort: Latest consignment" },
  { value: "value_desc", label: "Sort: Highest consignment value" },
  { value: "name_asc", label: "Sort: Alphabetical (A–Z)" },
];

const STATUS_OPTIONS: { value: SupplierStatusFilter; label: string }[] = [
  { value: "all", label: "All statuses" },
  { value: "active", label: "Active sourcing" },
  { value: "inactive", label: "Seasonal pause / inactive" },
];

const AVATAR_TONES = [
  "bg-primary-fixed text-on-primary-fixed-variant",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-fixed text-on-tertiary-fixed",
  "bg-surface-container-high text-primary",
];

function initialsOf(name: string): string {
  const words = name.replace(/^DEMO\s*—\s*/i, "").split(/\s+/).filter(Boolean);
  const letters = words.slice(0, 2).map((w) => w.charAt(0).toUpperCase());
  return letters.join("") || "?";
}

function avatarTone(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

/** Rate summary cell: one line → the rate; several → the range, honestly labelled. */
function rateSummary(row: SupplierLedgerRow): { main: string; sub: string } {
  if (row.rates.length === 0) return { main: "Not negotiated", sub: "Add rates while editing" };
  const sorted = [...row.rates].sort((a, b) => a.unitCostPaise - b.unitCostPaise);
  const lo = sorted[0];
  const hi = sorted[sorted.length - 1];
  const money = (p: number) => formatINR(p).replace(/\.00$/, "");
  const main =
    sorted.length === 1 || lo.unitCostPaise === hi.unitCostPaise
      ? `${money(lo.unitCostPaise)} / ${lo.unit}`
      : `${money(lo.unitCostPaise)}–${money(hi.unitCostPaise)}`;
  const moqLine = row.rates.find((r) => r.moqQty != null && r.moqQty > 0);
  const sub =
    sorted.length > 1 && lo.unitCostPaise !== hi.unitCostPaise
      ? `${row.rates.length} rate lines · best ${money(lo.unitCostPaise)} / ${lo.unit}`
      : moqLine
        ? `MOQ ${formatNumber(moqLine.moqQty!)} ${moqLine.unit}${row.rates.length > 1 ? ` · ${row.rates.length} lines` : ""}`
        : row.rates.length > 1
          ? `${row.rates.length} rate lines`
          : row.productSkus.length > 0
            ? `${row.productSkus.length} linked SKU${row.productSkus.length === 1 ? "" : "s"}`
            : "Per agreed schedule";
  return { main, sub };
}

function TypeIcon({ type, className }: { type: SupplierType; className?: string }) {
  switch (type) {
    case "farmer_apiarist":
      return <IconLeaf className={className} />;
    case "estate_producer":
      return <IconEstate className={className} />;
    case "wholesaler_coop":
      return <IconCoop className={className} />;
    case "packaging_artisan":
      return <IconPackage className={className} />;
    default:
      return <IconOther className={className} />;
  }
}

export default function SuppliersPage() {
  usePageTitle("Suppliers");
  const { principal } = useAuth();
  const toast = useToast();
  const canWrite = can(principal, "suppliers:write");
  const canReadCategories = can(principal, "categories:read");
  const canReadProducts = can(principal, "products:read");

  /* ------------------------------ filters ------------------------------ */
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [type, setType] = useState<SupplierType | "">("");
  const [categoryId, setCategoryId] = useState("");
  const [status, setStatus] = useState<SupplierStatusFilter>("all");
  const [sort, setSort] = useState<SupplierSort>("recently_added");
  const [page, setPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  // Debounced search → actual query change, resets pagination.
  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  // ⌘K / Ctrl+K focuses search (per the design's kbd hint).
  useEffect(() => {
    function onKeydown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
        searchInputRef.current?.select();
      }
    }
    window.addEventListener("keydown", onKeydown);
    return () => window.removeEventListener("keydown", onKeydown);
  }, []);

  const filtersChanged = [search, type, categoryId, status, sort, page];

  /* ------------------------------- queries ------------------------------ */
  const ledgerQuery = useMemo(
    () => ({
      search: search || undefined,
      type: type || undefined,
      categoryId: categoryId || undefined,
      status,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [search, type, categoryId, status, sort, page],
  );

  const { data, loading, error, reload } = useApiQuery<SupplierLedgerPage>(
    () => apiGet<SupplierLedgerPage>("/admin/suppliers/ledger", ledgerQuery),
    filtersChanged,
  );

  const { data: categories } = useApiQuery<CategoryDoc[]>(
    () => (canReadCategories ? apiGet<CategoryDoc[]>("/admin/catalogue/categories") : Promise.resolve([])),
    [canReadCategories],
  );
  const { data: productPage } = useApiQuery<Page<ProductWithVariants>>(
    () =>
      canReadProducts
        ? apiGet<Page<ProductWithVariants>>("/admin/catalogue/products", { page: 1, pageSize: 500 })
        : Promise.resolve({ items: [], page: 1, pageSize: 0, total: 0, totalPages: 1 }),
    [canReadProducts],
  );
  const products = useMemo(() => productPage?.items ?? [], [productPage]);

  // Empty page after records shrink → clamp back into range.
  useEffect(() => {
    if (data && page > data.totalPages) setPage(data.totalPages || 1);
  }, [data, page]);

  /* ------------------------------ selection ----------------------------- */
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => {
    setSelected(new Set());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, filtersChanged);

  const items = useMemo(() => data?.items ?? [], [data]);
  const allPageSelected = items.length > 0 && items.every((r) => selected.has(r.id));
  const selectedRows = useMemo(() => items.filter((r) => selected.has(r.id)), [items, selected]);

  function toggleRow(row: SupplierLedgerRow) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(row.id)) next.delete(row.id);
      else next.add(row.id);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allPageSelected ? new Set() : new Set(items.map((r) => r.id)));
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setType("");
    setCategoryId("");
    setStatus("all");
    setSort("recently_added");
    setPage(1);
  }

  /* ------------------------------- overlays ------------------------------ */
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<SupplierLedgerRow | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const detailRow = useMemo(() => items.find((r) => r.id === detailId) ?? null, [items, detailId]);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }

  function openEdit(row: SupplierLedgerRow) {
    setEditing(row);
    setFormOpen(true);
  }

  function handleSaved() {
    toast.success(editing ? "Supplier updated" : "Supplier added", editing ? editing.name : "The sourcing record is live in the directory.");
    reload();
  }

  function handleStatusChanged() {
    reload();
  }

  /* ------------------------------ quick pause ---------------------------- */
  async function quickToggleStatus(row: SupplierLedgerRow) {
    const next = row.status === "active" ? "inactive" : "active";
    if (next === "inactive") {
      // Pausing deserves a confirmation — open the drawer's confirmed flow.
      setDetailId(row.id);
      return;
    }
    try {
      await apiPost(`/admin/suppliers/${row.id}/status`, { status: next });
      toast.success("Supplier reactivated", `${row.name} is active again.`);
      reload();
    } catch (err) {
      toast.error("Could not update status", err instanceof ApiError ? err.message : "Unexpected error");
    }
  }

  /* -------------------------------- export ------------------------------- */
  const [exporting, setExporting] = useState(false);

  async function exportCsv(scope: "filtered" | "selected") {
    setExporting(true);
    try {
      let rows: SupplierLedgerRow[];
      if (scope === "selected") {
        rows = selectedRows;
      } else {
        const res = await apiGet<SupplierLedgerPage>("/admin/suppliers/ledger", { ...ledgerQuery, page: 1, pageSize: 500 });
        rows = res.items;
        if (res.total > 500) {
          toast.push({
            title: "Large result set",
            description: `Exported the first 500 of ${formatNumber(res.total)} suppliers — narrow the filters for a complete export.`,
            variant: "info",
          });
        }
      }
      if (rows.length === 0) {
        toast.error("Nothing to export", "No suppliers match the current selection.");
        return;
      }
      const header = [
        "Supplier",
        "Type",
        "Contact person",
        "Phone",
        "Email",
        "City",
        "State",
        "PIN",
        "Status",
        "Linked SKUs",
        "Rate lines",
        "Lowest rate (INR)",
        "Highest rate (INR)",
        "Last consignment",
        "Last PO reference",
        "Lifetime consignment value (INR)",
        "Onboarded (IST)",
      ];
      const body = rows.map((r) => {
        const costs = r.rates.map((x) => x.unitCostPaise);
        return [
          r.name,
          supplierTypeLabel(r.type),
          r.contactPerson ?? "",
          r.phone ?? "",
          r.email ?? "",
          r.city ?? "",
          r.state ?? "",
          r.pincode ?? "",
          r.status === "active" ? "Active" : "Inactive",
          r.productSkus.join("; "),
          r.rates.length,
          costs.length ? (Math.min(...costs) / 100).toFixed(2) : "",
          costs.length ? (Math.max(...costs) / 100).toFixed(2) : "",
          r.lastPurchaseAt ? formatDate(r.lastPurchaseAt) : "No consignments yet",
          r.lastPurchaseReference ?? "",
          r.totalPurchaseValuePaise ? (r.totalPurchaseValuePaise / 100).toFixed(2) : "0.00",
          formatDate(r.createdAt),
        ];
      });
      // BOM keeps Excel happy with any non-ASCII names.
      downloadTextFile(
        `annaadhya-sourcing-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
        `\uFEFF${toCsv([header, ...body])}\r\n`,
      );
      toast.success("Export ready", `${formatNumber(rows.length)} supplier${rows.length === 1 ? "" : "s"} exported to CSV.`);
    } catch (err) {
      toast.error("Export failed", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setExporting(false);
    }
  }

  /* --------------------------------- view -------------------------------- */
  const summary = data?.summary;
  const filtersActive = Boolean(search) || type !== "" || categoryId !== "" || status !== "all";

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <span>Console</span>
            <IconChevronRight className="h-3 w-3" />
            <span className="font-bold text-primary">Suppliers &amp; Harvesters</span>
          </>
        }
        title="Suppliers & Harvesters"
        description="Manage your producer network — direct farms, apiaries, estates and packaging partners — with locked procurement price schedules."
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv("filtered")} loading={exporting}>
              <IconDownload className="h-4 w-4" />
              Export sourcing ledger
            </Button>
            {canWrite ? (
              <Button onClick={openCreate}>
                <IconPlus className="h-4 w-4" />
                Add supplier
              </Button>
            ) : null}
          </>
        }
      />

      {/* Summary cards — same filtered scope as the table below */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Suppliers summary">
        <SummaryCard
          tone="primary"
          icon={<IconUsers className="h-5 w-5" />}
          label="Total suppliers"
          value={summary ? formatNumber(summary.totalSuppliers) : "—"}
          unit="registered"
          sub={summary ? `${formatNumber(summary.withPurchases)} with recorded consignments` : undefined}
        />
        <SummaryCard
          tone="secondary"
          icon={<IconShield className="h-5 w-5" />}
          label="Active sourcing"
          value={summary ? formatNumber(summary.activeSuppliers) : "—"}
          unit="approved"
          sub={summary && summary.inactiveSuppliers > 0 ? `${formatNumber(summary.inactiveSuppliers)} on seasonal pause` : "No partners paused"}
        />
        <SummaryCard
          tone="neutral"
          icon={<IconLeaf className="h-5 w-5" />}
          label="Harvest categories"
          value={summary ? formatNumber(summary.categoryCount) : "—"}
          unit="terroirs"
          sub="Distinct catalogue categories linked via SKUs"
        />
        <SummaryCard
          tone="gold"
          icon={<IconSparkle className="h-5 w-5" />}
          label="Recently added"
          value={summary ? formatNumber(summary.addedThisMonth) : "—"}
          unit="this month"
          sub="New partners onboarded in the current month"
        />
      </div>

      {/* Toolbar */}
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
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Search by estate, farmer name, contact, or crop…"
              aria-label="Search suppliers"
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
                aria-label="Filter by producer type"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={type}
                onChange={(e) => {
                  setType(e.target.value as SupplierType | "");
                  setPage(1);
                }}
              >
                <option value="">All producer types</option>
                <option value="farmer_apiarist">Farmer / Apiarist</option>
                <option value="estate_producer">Estate Producer</option>
                <option value="wholesaler_coop">Wholesaler / Co-op</option>
                <option value="packaging_artisan">Packaging Artisan</option>
                <option value="other">Other</option>
              </Select>
            </div>
            <div className="w-48">
              <Select
                aria-label="Filter by harvest category"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All terroirs &amp; categories</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Select
                aria-label="Filter by status"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as SupplierStatusFilter);
                  setPage(1);
                }}
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-48">
              <Select
                aria-label="Sort suppliers"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as SupplierSort);
                  setPage(1);
                }}
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <button
              type="button"
              title="Reset filters"
              aria-label="Reset filters"
              onClick={clearFilters}
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

        {/* Bulk selection bar */}
        {selectedRows.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary-container px-4 py-2.5 text-on-primary-container shadow-[0_1px_8px_rgba(39,24,16,0.08)]">
            <p className="text-xs font-semibold">
              <span className="font-bold">
                {selectedRows.length} supplier{selectedRows.length === 1 ? "" : "s"} selected:
              </span>{" "}
              <span className="underline decoration-on-primary-container/40">
                {selectedRows
                  .slice(0, 3)
                  .map((r) => r.name)
                  .join(", ")}
                {selectedRows.length > 3 ? ` +${selectedRows.length - 3} more` : ""}
              </span>
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => exportCsv("selected")}
                className="rounded-lg bg-surface-container-lowest px-2.5 py-1.5 text-xs font-bold text-primary shadow-sm transition-colors hover:bg-surface-container-low"
              >
                Export selected (CSV)
              </button>
              <button
                type="button"
                onClick={() => setSelected(new Set())}
                className="text-xs font-semibold underline decoration-on-primary-container/40 transition-colors hover:text-on-primary"
              >
                Clear selection
              </button>
            </div>
          </div>
        ) : null}
      </div>

      {/* Suppliers table */}
      <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        {loading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : !data || data.total === 0 ? (
          filtersActive ? (
            <EmptyState
              title="No harvester records located"
              description="No suppliers match your current filter parameters or search query. Reset filters or onboard a new regional producer."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Reset all filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No harvester records located"
              description="Your sourcing directory is empty. Onboard your first farmer, apiary or estate partner to start recording procurement."
              action={
                canWrite ? (
                  <Button size="sm" onClick={openCreate}>
                    <IconPlus className="h-4 w-4" />
                    Add new harvester
                  </Button>
                ) : undefined
              }
            />
          )
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH scope="col" className="w-12 pl-3! text-center">
                    <input
                      type="checkbox"
                      aria-label="Select all rows on this page"
                      checked={allPageSelected}
                      onChange={toggleAll}
                      className="h-4 w-4 cursor-pointer accent-primary"
                    />
                  </TH>
                  <TH scope="col">Supplier &amp; business name</TH>
                  <TH scope="col">Primary contact</TH>
                  <TH scope="col">Products &amp; terroir supplied</TH>
                  <TH scope="col">Sourcing location</TH>
                  <TH scope="col">Negotiated rates</TH>
                  <TH scope="col">Last consignment</TH>
                  <TH scope="col">Status</TH>
                  <TH scope="col" className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((row) => {
                  const rate = rateSummary(row);
                  const active = row.status === "active";
                  return (
                    <TR
                      key={row.id}
                      className={`group cursor-pointer ${selected.has(row.id) ? "bg-surface-container/40" : undefined}`}
                      onClick={() => setDetailId(row.id)}
                    >
                      <TD className="pl-3! pr-1! text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.name}`}
                          checked={selected.has(row.id)}
                          onChange={() => toggleRow(row)}
                          className="h-4 w-4 cursor-pointer accent-primary"
                        />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${avatarTone(row.id)}`}
                          >
                            {initialsOf(row.name)}
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-[15rem] truncate text-[13px] font-semibold text-primary group-hover:underline" title={row.name}>
                              {row.name}
                            </p>
                            <span className="mt-0.5 inline-flex items-center gap-1 rounded-full bg-surface-container px-1.5 py-0.5 label-eyebrow text-on-surface-variant">
                              <TypeIcon type={row.type} className="h-3 w-3" />
                              {supplierTypeLabel(row.type)}
                            </span>
                          </div>
                        </div>
                      </TD>
                      <TD className="px-2!">
                        <p className="text-[13px] font-medium text-on-surface">{row.contactPerson ?? "—"}</p>
                        <p className="font-mono text-[11px] text-on-surface-variant">{row.phone ?? "—"}</p>
                        {row.email ? (
                          <p className="max-w-[10rem] truncate text-[11px] text-outline" title={row.email}>
                            {row.email}
                          </p>
                        ) : null}
                      </TD>
                      <TD className="px-2!">
                        {row.rates.length === 0 ? (
                          <p className="text-xs italic text-outline">No rates recorded</p>
                        ) : (
                          <div className="flex max-w-[13rem] flex-col items-start gap-1">
                            {row.rates.slice(0, 2).map((r) => (
                              <span key={r.id} className="max-w-full truncate rounded bg-surface-container px-1.5 py-0.5 text-[11px] font-medium text-on-surface" title={r.label}>
                                {r.label}
                              </span>
                            ))}
                            {row.rates.length > 2 ? (
                              <span className="text-[11px] font-semibold text-secondary">+{row.rates.length - 2} more</span>
                            ) : null}
                            {row.categoryNames.length > 0 ? (
                              <span className="max-w-full truncate text-[11px] text-outline" title={row.categoryNames.join(", ")}>
                                {row.categoryNames.join(" · ")}
                              </span>
                            ) : null}
                          </div>
                        )}
                      </TD>
                      <TD className="px-2!">
                        <p className="text-[13px] font-medium text-on-surface">{row.city ?? row.location?.split(",")[0]?.trim() ?? "—"}</p>
                        <p className="text-xs text-on-surface-variant">{row.state ?? row.location ?? ""}</p>
                      </TD>
                      <TD className="px-2!">
                        <p className="font-mono text-[13px] font-bold text-primary">{rate.main}</p>
                        <p className="max-w-[9rem] truncate text-[11px] text-on-surface-variant" title={rate.sub}>
                          {rate.sub}
                        </p>
                      </TD>
                      <TD className="px-2!">
                        {row.lastPurchaseAt ? (
                          <>
                            <p className="text-[13px] font-medium text-on-surface">{formatDate(row.lastPurchaseAt)}</p>
                            <p className="font-mono text-[11px] text-on-surface-variant">
                              {row.lastPurchaseReference}
                              {row.lastPurchaseValuePaise != null ? ` · ${formatINR(row.lastPurchaseValuePaise)}` : ""}
                            </p>
                          </>
                        ) : (
                          <>
                            <p className="text-xs italic text-on-surface-variant">No consignments yet</p>
                            <p className="text-[11px] font-medium text-secondary">{row.rates.length > 0 ? "Negotiation complete" : "Terms pending"}</p>
                          </>
                        )}
                      </TD>
                      <TD className="px-2!">
                        <span
                          className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${
                            active ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-high text-on-surface-variant"
                          }`}
                        >
                          <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${active ? "bg-secondary" : "bg-outline"}`} />
                          {active ? "Active" : "Inactive"}
                        </span>
                      </TD>
                      <TD className="px-2!" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <IconAction label={`View details for ${row.name}`} onClick={() => setDetailId(row.id)}>
                            <IconEye className="h-4 w-4" />
                          </IconAction>
                          {canWrite ? (
                            <>
                              <IconAction label={`Edit ${row.name}`} onClick={() => openEdit(row)}>
                                <IconEdit className="h-4 w-4" />
                              </IconAction>
                              {active ? (
                                <IconAction label={`Pause sourcing for ${row.name}`} onClick={() => quickToggleStatus(row)}>
                                  <IconPause className="h-4 w-4" />
                                </IconAction>
                              ) : (
                                <IconAction label={`Reactivate ${row.name}`} onClick={() => quickToggleStatus(row)}>
                                  <IconPlay className="h-4 w-4" />
                                </IconAction>
                              )}
                            </>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            {/* Pagination footer */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[13px] text-on-surface-variant sm:flex-row sm:px-6">
              <p>
                Showing{" "}
                <strong className="text-on-surface">
                  {data.total === 0 ? "0" : `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)}`}
                </strong>{" "}
                of <strong className="text-on-surface">{formatNumber(data.total)}</strong> registered suppliers
              </p>
              <nav aria-label="Suppliers pagination" className="flex items-center gap-1">
                <PagerButton label="Previous page" disabled={data.page <= 1} onClick={() => setPage((p) => Math.max(1, p - 1))}>
                  <IconChevronLeft className="h-4 w-4" />
                </PagerButton>
                {pageWindow(data.page, data.totalPages).map((p, i) =>
                  p === "gap" ? (
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
                        p === data.page ? "bg-primary text-on-primary" : "bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <PagerButton label="Next page" disabled={data.page >= data.totalPages} onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}>
                  <IconChevronRight className="h-4 w-4" />
                </PagerButton>
              </nav>
            </div>
          </>
        )}
      </div>

      {/* Compliance strip */}
      <div className="mt-6 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-surface-container/60 px-4 py-3 text-xs text-on-surface-variant">
        <p className="flex items-center gap-2">
          <IconShield className="h-5 w-5 shrink-0 text-secondary" />
          <span>
            Supplier rate contracts and estate contacts are confidential to authorised staff • Procurement costs stay separate from retail prices.
          </span>
        </p>
        <p className="label-eyebrow text-outline">FSSAI sourcing desk • APMC records • NABL honey standard</p>
      </div>

      <p className="flex items-center justify-center gap-1 pt-3 text-center text-[11px] text-outline sm:justify-end">
        Purchasing &amp; goods receiving live on the
        <Link href="/purchases" className="font-semibold text-primary hover:underline">
          Purchases page
        </Link>
      </p>

      {/* Overlays */}
      <SupplierDetailDrawer
        open={detailRow !== null}
        onClose={() => setDetailId(null)}
        row={detailRow}
        canWrite={canWrite}
        canPurchasesRead={can(principal, "purchases:read")}
        onEdit={(row) => {
          setDetailId(null);
          openEdit(row);
        }}
        onStatusChanged={handleStatusChanged}
      />
      <SupplierFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        supplier={editing}
        products={products}
        onSaved={handleSaved}
      />
    </div>
  );
}

/* ------------------------------- fragments -------------------------------- */

const TONES = {
  primary: { text: "text-primary", chip: "bg-surface-container-high text-primary", decor: "bg-surface-container-high/40" },
  secondary: { text: "text-secondary", chip: "bg-secondary-container text-secondary", decor: "bg-secondary-container/40" },
  neutral: { text: "text-on-surface", chip: "bg-surface-container text-tertiary", decor: "bg-surface-container-highest/60" },
  gold: { text: "text-primary", chip: "bg-tertiary-fixed text-on-tertiary-fixed", decor: "bg-tertiary-fixed/40" },
} as const;

/** Heritage metric card (mirrors the catalogue/orders/inventory pattern with the corner decor blob). */
function SummaryCard({
  tone,
  icon,
  label,
  value,
  unit,
  sub,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
}) {
  const t = TONES[tone];
  return (
    <div className="group relative overflow-hidden rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
      <span aria-hidden className={`metric-decor ${t.decor}`} />
      <div className="relative mb-2 flex items-center justify-between">
        <span className="label-eyebrow text-on-surface-variant">{label}</span>
        <span aria-hidden className={`flex h-8 w-8 items-center justify-center rounded-full ${t.chip}`}>
          {icon}
        </span>
      </div>
      <div className="relative flex items-baseline gap-1.5">
        <span className={`font-display text-[26px] font-semibold leading-8 ${t.text}`}>{value}</span>
        {unit ? <span className="text-xs font-medium text-secondary">{unit}</span> : null}
      </div>
      <p className="relative mt-1 text-[13px] text-on-surface-variant">{sub}</p>
    </div>
  );
}

function IconAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      className="rounded-lg bg-surface-container-low p-1.5 text-on-surface-variant shadow-sm transition-colors hover:bg-surface-container hover:text-primary"
    >
      {children}
    </button>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg bg-surface-container-lowest p-1.5 text-outline shadow-sm transition-colors hover:text-on-surface disabled:cursor-not-allowed disabled:opacity-40"
    >
      {children}
    </button>
  );
}

/** Compact page window: 1 … around current … total, with gaps collapsed. */
function pageWindow(current: number, total: number): (number | "gap")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const wanted = new Set(
    [1, 2, current - 1, current, current + 1, total - 1, total].filter((p) => p >= 1 && p <= total),
  );
  const sorted = [...wanted].sort((a, b) => a - b);
  const out: (number | "gap")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("gap");
    out.push(p);
    prev = p;
  }
  return out;
}
