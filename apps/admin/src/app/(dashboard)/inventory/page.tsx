"use client";
/**
 * /inventory — the stock console per the approved "Modern Indian Heritage" design.
 *
 * Everything on this page is real — no demo rows, no invented history:
 *  - GET  /admin/inventory/ledger      → paginated rows (search/category/stock-status/sort)
 *                                        + summary metrics over the SAME filtered scope
 *  - GET  /admin/inventory/ledger      → second call (stock asc) feeds the replenishment queue
 *  - GET  /admin/inventory/movements   → recent ledger events strip + per-variant history dialog
 *  - POST /admin/inventory/adjustments → guided add / remove / set-exact (server-validated, transactional)
 *  - POST /admin/inventory/thresholds  → bulk low-stock-threshold update
 *  - GET  /admin/catalogue/categories  → real category filter options
 *
 * Honest-scope notes:
 *  - No warehouse model exists in this platform, so there is no warehouse filter.
 *  - The platform has no unit-cost valuation; the value metric is labelled
 *    "retail value at selling price" and is never presented as cost.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { formatINRRounded, formatNumber, humanize } from "@/lib/format";
import { relativeDayTime } from "@/lib/relative-time";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { useToast } from "@/lib/toast";
import type {
  CategoryDoc,
  InventoryLedgerPage,
  InventoryLedgerRow,
  InventoryMovementDoc,
  InventorySort,
  InventoryStockStatus,
  StockStatusFilter,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { AdjustStockDrawer, VariantThumb } from "@/components/inventory/adjust-stock-drawer";
import { StockHistoryDialog } from "@/components/inventory/stock-history-dialog";
import { ThresholdDialog } from "@/components/inventory/threshold-dialog";
import {
  IconBox,
  IconBoxOff,
  IconCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDownload,
  IconPlus,
  IconReceipt,
  IconTruck,
  IconTune,
  IconWallet,
  IconWarn,
} from "@/components/inventory/icons";

const PAGE_SIZE = 20;

const STOCK_STATUS_OPTIONS: { value: StockStatusFilter; label: string }[] = [
  { value: "all", label: "All stock levels" },
  { value: "in_stock", label: "In stock (healthy)" },
  { value: "low_stock", label: "Low stock (at/below threshold)" },
  { value: "out_of_stock", label: "Out of stock (zero)" },
];

const SORT_OPTIONS: { value: InventorySort; label: string }[] = [
  { value: "name_asc", label: "Sort: Name (A–Z)" },
  { value: "stock_asc", label: "Sort: Stock low → high" },
  { value: "stock_desc", label: "Sort: Stock high → low" },
  { value: "recently_updated", label: "Sort: Recently updated" },
];

const STOCK_BADGE: Record<InventoryStockStatus, { label: string; cls: string; dot: string }> = {
  in_stock: { label: "In stock", cls: "bg-secondary-container text-on-secondary-container", dot: "bg-secondary" },
  low_stock: { label: "Low stock", cls: "bg-tertiary-fixed text-on-tertiary-fixed-variant", dot: "bg-tertiary-fixed-dim" },
  out_of_stock: { label: "Out of stock", cls: "bg-error-container text-on-error-container", dot: "bg-error" },
};

function StockBadge({ status }: { status: InventoryStockStatus }) {
  const b = STOCK_BADGE[status];
  return (
    <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold ${b.cls}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${b.dot}`} />
      {b.label}
    </span>
  );
}

export default function InventoryPage() {
  usePageTitle("Inventory");
  const { principal } = useAuth();
  const toast = useToast();
  const canWrite = can(principal, "inventory:write");
  const canPurchases = can(principal, "purchases:read");

  /* ------------------------------ filters ------------------------------ */
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [stockStatus, setStockStatus] = useState<StockStatusFilter>("all");
  const [sort, setSort] = useState<InventorySort>("name_asc");
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

  const filtersChanged = [search, categoryId, stockStatus, sort, page];

  /* ------------------------------- queries ------------------------------ */
  const ledgerQuery = useMemo(
    () => ({
      search: search || undefined,
      categoryId: categoryId || undefined,
      stockStatus,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [search, categoryId, stockStatus, sort, page],
  );

  const { data, loading, error, reload } = useApiQuery<InventoryLedgerPage>(
    () => apiGet<InventoryLedgerPage>("/admin/inventory/ledger", ledgerQuery),
    filtersChanged,
  );

  // Replenishment queue: globally lowest-available SKUs (independent of the table filters).
  const { data: critical, reload: reloadCritical } = useApiQuery<InventoryLedgerPage>(
    () => apiGet<InventoryLedgerPage>("/admin/inventory/ledger", { sort: "stock_asc", page: 1, pageSize: 6 }),
    [],
  );
  const criticalRows = useMemo(
    () => (critical?.items ?? []).filter((r) => r.stockStatus !== "in_stock").slice(0, 3),
    [critical],
  );

  const { data: recentMovements, reload: reloadMovements } = useApiQuery<InventoryMovementDoc[]>(
    () => apiGet("/admin/inventory/movements"),
    [],
  );

  const { data: categories } = useApiQuery<CategoryDoc[]>(() => apiGet("/admin/catalogue/categories"), []);

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

  const items = data?.items ?? [];
  const allPageSelected = items.length > 0 && items.every((r) => selected.has(r.variantId));
  const selectedRows = items.filter((r) => selected.has(r.variantId));

  function toggleRow(row: InventoryLedgerRow) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(row.variantId)) next.delete(row.variantId);
      else next.add(row.variantId);
      return next;
    });
  }

  function toggleAll() {
    setSelected(allPageSelected ? new Set() : new Set(items.map((r) => r.variantId)));
  }

  function clearFilters() {
    setSearchInput("");
    setSearch("");
    setCategoryId("");
    setStockStatus("all");
    setSort("name_asc");
    setPage(1);
  }

  /* ------------------------------- overlays ------------------------------ */
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerRow, setDrawerRow] = useState<InventoryLedgerRow | null>(null);
  const [historyRow, setHistoryRow] = useState<InventoryLedgerRow | null>(null);
  const [thresholdOpen, setThresholdOpen] = useState(false);

  function openDrawer(row: InventoryLedgerRow | null) {
    setDrawerRow(row);
    setDrawerOpen(true);
  }

  function handleSaved(movement: InventoryMovementDoc) {
    toast.success(
      "Stock adjusted",
      `${movement.variantSku}: ${movement.qtyDelta > 0 ? "+" : ""}${formatNumber(movement.qtyDelta)} → ${formatNumber(movement.resultingStockOnHand)} on hand`,
    );
    reload();
    reloadCritical();
    reloadMovements();
  }

  /* -------------------------------- export ------------------------------- */
  const [exporting, setExporting] = useState(false);

  async function exportCsv(scope: "filtered" | "selected") {
    setExporting(true);
    try {
      let rows: InventoryLedgerRow[];
      if (scope === "selected") {
        rows = selectedRows;
      } else {
        const res = await apiGet<InventoryLedgerPage>("/admin/inventory/ledger", { ...ledgerQuery, page: 1, pageSize: 500 });
        rows = res.items;
        if (res.total > 500) {
          toast.push({
            title: "Large result set",
            description: `Exported the first 500 of ${formatNumber(res.total)} SKUs — narrow the filters for a complete export.`,
            variant: "info",
          });
        }
      }
      if (rows.length === 0) {
        toast.error("Nothing to export", "No inventory rows match the current selection.");
        return;
      }
      const header = [
        "SKU",
        "Product",
        "Pack",
        "Category",
        "Stock status",
        "On hand",
        "Reserved",
        "Available",
        "Low-stock threshold",
        "Unit price (INR)",
        "Retail value on hand (INR)",
        "Variant status",
        "Last updated (IST)",
      ];
      const body = rows.map((r) => [
        r.sku,
        r.productName,
        r.packLabel,
        r.categoryName,
        STOCK_BADGE[r.stockStatus].label,
        r.stockOnHand,
        r.reservedQty,
        r.available,
        r.lowStockThreshold,
        (r.pricePaise / 100).toFixed(2),
        ((r.stockOnHand * r.pricePaise) / 100).toFixed(2),
        humanize(r.variantStatus),
        r.lastMovement ? relativeDayTime(r.lastMovement.at) : relativeDayTime(r.updatedAt),
      ]);
      // BOM keeps Excel happy with any non-ASCII product names.
      downloadTextFile(
        `annaadhya-inventory-${new Date().toISOString().slice(0, 10)}.csv`,
        `\uFEFF${toCsv([header, ...body])}\r\n`,
      );
      toast.success("Export ready", `${formatNumber(rows.length)} SKU${rows.length === 1 ? "" : "s"} exported to CSV.`);
    } catch (err) {
      toast.error("Export failed", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setExporting(false);
    }
  }

  /* --------------------------------- view -------------------------------- */
  const summary = data?.summary;
  const filtersActive = Boolean(search) || categoryId !== "" || stockStatus !== "all";
  const movements = (recentMovements ?? []).slice(0, 4);

  return (
    <div>
      <PageHeader
        eyebrow={
          <span className="rounded-full bg-secondary-fixed px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest text-on-secondary-fixed">
            Stock Ledger
          </span>
        }
        title="Inventory"
        description="Monitor variant-level stock, spot low and out-of-stock SKUs, and make validated adjustments — every change goes through the transactional ledger."
        actions={
          <>
            <Button variant="secondary" onClick={() => exportCsv("filtered")} loading={exporting}>
              <IconDownload className="h-4 w-4" />
              Export CSV
            </Button>
            {canPurchases ? (
              <Link href="/purchases">
                <Button variant="outline">
                  <IconTruck className="h-4 w-4" />
                  Replenishment PO
                </Button>
              </Link>
            ) : null}
            {canWrite ? (
              <Button onClick={() => openDrawer(null)}>
                <IconPlus className="h-4 w-4" />
                Adjust stock
              </Button>
            ) : null}
          </>
        }
      />

      {/* Summary cards — same filtered scope as the table below */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Inventory summary">
        <SummaryCard
          tone="neutral"
          icon={<IconBox className="h-5 w-5" />}
          label="Total stock items"
          value={summary ? formatNumber(summary.totalVariants) : "—"}
          unit="SKU variants"
          sub={summary ? `Across ${formatNumber(summary.totalProducts)} products · non-archived` : undefined}
        />
        <SummaryCard
          tone="primary"
          icon={<IconWarn className="h-5 w-5" />}
          label="Low stock"
          value={summary ? formatNumber(summary.lowStock) : "—"}
          unit="variants"
          sub="Available stock at or below each threshold"
          footer={
            summary && summary.lowStock > 0 ? (
              <span className="rounded bg-tertiary-fixed px-1.5 py-0.5 label-eyebrow text-on-tertiary-fixed-variant">
                Action needed — replenish
              </span>
            ) : (
              <span className="flex items-center gap-1 font-semibold text-secondary">
                <IconCheck className="h-3.5 w-3.5" /> All healthy
              </span>
            )
          }
        />
        <SummaryCard
          tone="error"
          icon={<IconBoxOff className="h-5 w-5" />}
          label="Out of stock"
          value={summary ? formatNumber(summary.outOfStock) : "—"}
          unit="variants"
          sub="Available stock is zero — not sellable in checkout"
          footer={
            summary && summary.outOfStock > 0 ? (
              <span className="flex items-center gap-1 font-semibold text-error">
                <IconWarn className="h-3.5 w-3.5" /> Immediate restock
              </span>
            ) : (
              <span className="flex items-center gap-1 font-semibold text-secondary">
                <IconCheck className="h-3.5 w-3.5" /> Nothing blocked
              </span>
            )
          }
        />
        <SummaryCard
          tone="secondary"
          icon={<IconWallet className="h-5 w-5" />}
          label="Stock on hand"
          value={summary ? formatNumber(summary.totalStockOnHand) : "—"}
          unit="units"
          sub={summary ? `${formatINRRounded(summary.retailValuePaise)} retail value at selling price — not cost` : undefined}
        />
      </div>

      {/* Replenishment priority queue */}
      {criticalRows.length > 0 ? (
        <Card className="mb-4 bg-surface-container-high shadow-none">
          <div className="flex flex-col gap-4 p-4 sm:p-5 lg:flex-row lg:items-center lg:justify-between">
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-on-primary shadow-sm">
                <IconWarn className="h-5 w-5" />
              </div>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <h2 className="font-display text-base font-semibold text-primary">Replenishment priority queue</h2>
                  <span className="rounded-full bg-error-container px-2 py-0.5 label-eyebrow text-on-error-container">
                    {criticalRows.length} critical SK{criticalRows.length === 1 ? "U" : "US"}
                  </span>
                </div>
                <p className="mt-0.5 max-w-2xl text-[13px] text-on-surface-variant">
                  Lowest available stock across all tracked SKUs — receive a consignment, write the balance back, or raise a
                  purchase order.
                </p>
              </div>
            </div>
            {canPurchases ? (
              <Link href="/purchases" className="shrink-0">
                <Button variant="outline" size="sm">
                  Open purchases
                  <IconChevronRight className="h-3.5 w-3.5" />
                </Button>
              </Link>
            ) : null}
          </div>
          <div className="grid grid-cols-1 gap-3 px-4 pb-4 sm:grid-cols-3 sm:px-5 sm:pb-5">
            {criticalRows.map((row) => (
              <div
                key={row.variantId}
                className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-lowest p-3 shadow-sm"
              >
                <div className="flex min-w-0 items-center gap-2.5">
                  <VariantThumb row={row} />
                  <div className="min-w-0">
                    <p className="truncate text-[13px] font-semibold text-on-surface" title={`${row.productName} (${row.packLabel})`}>
                      {row.productName} · {row.packLabel}
                    </p>
                    <p className={`mt-0.5 text-xs font-semibold ${row.available === 0 ? "text-error" : "text-tertiary"}`}>
                      {row.available === 0 ? "0 units — stockout" : `${formatNumber(row.available)} units left`}
                      <span className="font-normal text-outline"> · min {formatNumber(row.lowStockThreshold)}</span>
                    </p>
                  </div>
                </div>
                {canWrite ? (
                  <Button variant="outline" size="sm" onClick={() => openDrawer(row)} className="shrink-0">
                    <IconTune className="h-3.5 w-3.5" />
                    Adjust
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </Card>
      ) : null}

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
              placeholder="Search by product name, SKU, or pack size…"
              aria-label="Search inventory"
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
                aria-label="Filter by category"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={categoryId}
                onChange={(e) => {
                  setCategoryId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All Categories</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-48">
              <Select
                aria-label="Filter by stock status"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={stockStatus}
                onChange={(e) => {
                  setStockStatus(e.target.value as StockStatusFilter);
                  setPage(1);
                }}
              >
                {STOCK_STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Select
                aria-label="Sort inventory"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as InventorySort);
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
                {selectedRows.length} variant{selectedRows.length === 1 ? "" : "s"} selected:
              </span>{" "}
              <span className="underline decoration-on-primary-container/40">
                {selectedRows
                  .slice(0, 3)
                  .map((r) => r.sku)
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
              {canWrite ? (
                <button
                  type="button"
                  onClick={() => setThresholdOpen(true)}
                  className="rounded-lg bg-surface-container-lowest px-2.5 py-1.5 text-xs font-bold text-primary shadow-sm transition-colors hover:bg-surface-container-low"
                >
                  Batch threshold update
                </button>
              ) : null}
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

      {/* Inventory table */}
      <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        {loading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : !data || data.total === 0 ? (
          filtersActive ? (
            <EmptyState
              title="No SKUs match"
              description="No inventory rows match the current search and filters. Try a different term or clear the filters."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No stock tracked yet"
              description="Create products with at least one variant to start tracking stock. Balances here stay in sync with the storefront and checkout."
              action={
                can(principal, "products:write") ? (
                  <Link href="/products/new">
                    <Button size="sm">New product</Button>
                  </Link>
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
                  <TH scope="col">Product &amp; variant</TH>
                  <TH scope="col" className="px-2!">SKU</TH>
                  <TH scope="col" className="px-2!">Category</TH>
                  <TH scope="col" className="px-2! text-right">On hand</TH>
                  <TH scope="col" className="px-2! text-right">Reserved</TH>
                  <TH scope="col" className="px-2! text-right">Available</TH>
                  <TH scope="col" className="px-2! text-right">Threshold</TH>
                  <TH scope="col" className="px-2!">Status</TH>
                  <TH scope="col">Last adjusted</TH>
                  <TH scope="col" className="px-2! text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((row) => {
                  const when = row.lastMovement?.at ?? row.updatedAt;
                  return (
                    <TR key={row.variantId} className={selected.has(row.variantId) ? "bg-surface-container/40" : undefined}>
                      <TD className="pl-3! pr-1! text-center">
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.sku}`}
                          checked={selected.has(row.variantId)}
                          onChange={() => toggleRow(row)}
                          className="h-4 w-4 cursor-pointer accent-primary"
                        />
                      </TD>
                      <TD>
                        <div className="flex items-center gap-2.5">
                          <VariantThumb row={row} />
                          <div className="min-w-0">
                            <p className="max-w-[8rem] truncate text-[13px] font-semibold text-on-surface" title={row.productName}>
                              {row.productName}
                            </p>
                            <p className="mt-0.5 flex items-center gap-1.5 text-xs text-on-surface-variant">
                              {row.packLabel}
                              {row.variantStatus === "draft" ? (
                                <span className="rounded bg-surface-container-high px-1 py-0.5 label-eyebrow text-on-surface-variant">
                                  Draft
                                </span>
                              ) : null}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD className="px-2! font-mono text-[11px] text-outline">{row.sku}</TD>
                      <TD className="px-2! text-on-surface-variant">{row.categoryName}</TD>
                      <TD className="px-2! text-right font-semibold text-on-surface">{formatNumber(row.stockOnHand)}</TD>
                      <TD className="px-2! text-right text-on-surface-variant">{formatNumber(row.reservedQty)}</TD>
                      <TD
                        className={`px-2! text-right font-bold ${
                          row.stockStatus === "out_of_stock"
                            ? "text-error"
                            : row.stockStatus === "low_stock"
                              ? "text-tertiary"
                              : "text-secondary"
                        }`}
                      >
                        {formatNumber(row.available)}
                      </TD>
                      <TD className="px-2! text-right text-outline">{formatNumber(row.lowStockThreshold)}</TD>
                      <TD className="px-2!">
                        <StockBadge status={row.stockStatus} />
                      </TD>
                      <TD className="pr-1!">
                        <p className="whitespace-nowrap text-xs font-medium text-on-surface" title={formatDateTimeFull(when)}>
                          {relativeDayTime(when)}
                        </p>
                        <p
                          className="mt-0.5 max-w-[7rem] truncate text-[11px] text-outline"
                          title={
                            row.lastMovement
                              ? `${row.lastMovement.byName ?? "system"} · ${humanize(row.lastMovement.type)}`
                              : undefined
                          }
                        >
                          {row.lastMovement
                            ? `${row.lastMovement.byName ?? "system"} · ${humanize(row.lastMovement.type)}`
                            : "No movements yet"}
                        </p>
                      </TD>
                      <TD className="px-2!">
                        <div className="flex items-center justify-end gap-1">
                          {canWrite ? (
                            <IconAction label={`Adjust stock for ${row.sku}`} onClick={() => openDrawer(row)}>
                              <IconTune className="h-4 w-4" />
                            </IconAction>
                          ) : null}
                          <IconAction label={`View stock ledger for ${row.sku}`} onClick={() => setHistoryRow(row)}>
                            <IconReceipt className="h-4 w-4" />
                          </IconAction>
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
                  {data.total === 0
                    ? "0"
                    : `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)}`}
                </strong>{" "}
                of <strong className="text-on-surface">{formatNumber(data.total)}</strong> SKUs
              </p>
              <nav aria-label="Inventory pagination" className="flex items-center gap-1">
                <PagerButton
                  label="Previous page"
                  disabled={data.page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
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
                        p === data.page
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <PagerButton
                  label="Next page"
                  disabled={data.page >= data.totalPages}
                  onClick={() => setPage((p) => Math.min(data.totalPages, p + 1))}
                >
                  <IconChevronRight className="h-4 w-4" />
                </PagerButton>
              </nav>
            </div>
          </>
        )}
      </div>

      {/* Recent stock movements (real ledger events) */}
      <div className="mt-8">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="font-display text-lg font-semibold text-primary">Recent stock movements</h2>
            <p className="text-xs text-on-surface-variant">
              Chronological trail of intakes, order activity, and manual corrections
            </p>
          </div>
          <Link href="/audit" className="flex items-center gap-1 text-xs font-bold text-primary hover:underline">
            View full audit log
            <IconChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
        {movements.length === 0 ? (
          <Card>
            <EmptyState title="No movements yet" description="Ledger events appear here as stock changes happen." />
          </Card>
        ) : (
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
            {movements.map((m) => (
              <Card key={m.id} className="flex flex-col justify-between gap-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <MovementBadge movement={m} />
                  <span className="text-[11px] text-outline">{relativeDayTime(m.createdAt)}</span>
                </div>
                <div>
                  <p className="font-mono text-sm font-bold text-on-surface">{m.variantSku}</p>
                  <p className="mt-0.5 truncate text-xs text-on-surface-variant" title={m.reason}>
                    {m.reason}
                  </p>
                </div>
                <p className="border-t border-outline-variant/30 pt-2 text-[11px] text-outline">
                  By: {m.performedByName ?? m.performedByUid ?? "system"}
                  {m.referenceId ? <span className="ml-1.5 font-mono">{m.referenceId}</span> : null}
                </p>
              </Card>
            ))}
          </div>
        )}
      </div>

      <p className="pt-3 text-center text-[11px] text-outline sm:text-right">
        All timestamps recorded in Indian Standard Time (IST — UTC+05:30).
      </p>

      {/* Overlays */}
      <AdjustStockDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        row={drawerRow}
        pickerRows={items}
        onSaved={handleSaved}
      />
      <StockHistoryDialog open={historyRow !== null} onClose={() => setHistoryRow(null)} row={historyRow} />
      <ThresholdDialog
        open={thresholdOpen}
        onClose={() => setThresholdOpen(false)}
        rows={selectedRows}
        onSaved={() => {
          toast.success(
            "Thresholds updated",
            `${selectedRows.length} SKU${selectedRows.length === 1 ? "" : "s"} updated.`,
          );
          setSelected(new Set());
          reload();
          reloadCritical();
        }}
      />
    </div>
  );
}

/* ------------------------------- fragments -------------------------------- */

const TONES = {
  primary: { text: "text-primary", chip: "bg-surface-container-high text-primary", decor: "bg-surface-container-high/40" },
  secondary: { text: "text-secondary", chip: "bg-secondary-container text-secondary", decor: "bg-secondary-container/40" },
  neutral: { text: "text-on-surface", chip: "bg-surface-container text-tertiary", decor: "bg-surface-container-highest/60" },
  error: { text: "text-error", chip: "bg-error-container text-error", decor: "bg-error-container/40" },
} as const;

/** Heritage metric card (mirrors the catalogue/orders pattern with the corner decor blob). */
function SummaryCard({
  tone,
  icon,
  label,
  value,
  unit,
  sub,
  footer,
}: {
  tone: keyof typeof TONES;
  icon: React.ReactNode;
  label: string;
  value: string;
  unit?: string;
  sub?: string;
  footer?: React.ReactNode;
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
      {footer ? <div className="relative mt-2 flex items-center gap-2 text-[11px]">{footer}</div> : null}
    </div>
  );
}

function MovementBadge({ movement }: { movement: InventoryMovementDoc }) {
  const positive = movement.qtyDelta > 0;
  const cls = positive
    ? "bg-secondary-container text-on-secondary-container"
    : movement.type === "damaged"
      ? "bg-error-container text-on-error-container"
      : "bg-tertiary-fixed text-on-tertiary-fixed-variant";
  return (
    <span className={`rounded px-2 py-0.5 text-[11px] font-bold ${cls}`}>
      {movement.qtyDelta > 0 ? "+" : ""}
      {formatNumber(movement.qtyDelta)} {humanize(movement.type).toUpperCase()}
    </span>
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

/** Full IST timestamp for tooltips (the dense table shows the relative label). */
function formatDateTimeFull(millis: number): string {
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
    timeZone: "Asia/Kolkata",
  }).format(new Date(millis));
}
