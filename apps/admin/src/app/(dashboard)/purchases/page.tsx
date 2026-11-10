"use client";
/**
 * /purchases — the procurement console per the approved "Modern Indian Heritage" design.
 *
 * Suppliers live on their own page; this console owns the purchase lifecycle end to end:
 *   draft → ordered → partially received → received   (delivery state, server-driven)
 *   unpaid → partially paid → paid                    (settlement, derived from real payment records)
 *
 * Everything on this page is real — no demo rows, no invented history:
 *  - GET  /admin/purchases/ledger          → paginated rows + summary over the SAME filtered scope
 *  - POST /admin/purchases                 → create draft / ordered (money recomputed server-side)
 *  - POST /admin/purchases/:id             → draft-only edit
 *  - POST /admin/purchases/:id/confirm     → draft → ordered (inventory untouched)
 *  - POST /admin/purchases/:id/cancel      → history + received stock preserved
 *  - POST /admin/purchases/:id/receive     → goods receipt; stock + movements + receipt commit in
 *                                            one server transaction, keyed by an idempotency id
 *  - POST /admin/purchases/:id/payments    → real supplier payments (never auto-derived)
 *
 * Honest-scope notes:
 *  - Inventory increases only by confirmed received quantities, never by ordered quantities.
 *  - The priority callout shows the most urgent pending consignment from the ledger, or nothing.
 *  - Batch/QC/storage-location pickers from the reference design are deliberately omitted —
 *     the inventory model has no batch ledger; the receipt note carries condition & placement.
 */
import { useEffect, useMemo, useRef, useState } from "react";
import { ApiError, apiGet, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { formatDate, formatINR, formatNumber, formatINRRounded, istDayEnd, dateInputToMillis } from "@/lib/format";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { useToast } from "@/lib/toast";
import type {
  Page,
  ProductWithVariants,
  PurchaseDoc,
  PurchaseLedgerPage,
  PurchaseLedgerRow,
  PurchasePaymentStatusFilter,
  PurchaseSort,
  PurchaseStatusFilter,
  SupplierDoc,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { PurchaseFormDialog } from "@/components/purchases/purchase-form-dialog";
import { ReceiveGoodsDialog } from "@/components/purchases/receive-goods-dialog";
import { PurchaseDetailDrawer } from "@/components/purchases/purchase-detail-drawer";
import {
  IconCancelled,
  IconCheckAll,
  IconChevronLeft,
  IconChevronRight,
  IconDraft,
  IconDownload,
  IconEye,
  IconPayments,
  IconPlus,
  IconPriority,
  IconReceive,
  IconReset,
  IconShieldCheck,
  IconTimelapse,
  IconTruck,
} from "@/components/purchases/icons";

const SORT_OPTIONS: { value: PurchaseSort; label: string }[] = [
  { value: "recent_first", label: "Sort: Newest purchases" },
  { value: "oldest_first", label: "Sort: Oldest purchases" },
  { value: "value_desc", label: "Sort: Highest value" },
];

const STATUS_OPTIONS: { value: PurchaseStatusFilter; label: string }[] = [
  { value: "all", label: "All delivery statuses" },
  { value: "ordered", label: "Ordered (in transit)" },
  { value: "partially_received", label: "Partially received" },
  { value: "received", label: "Received (completed)" },
  { value: "draft", label: "Draft" },
  { value: "cancelled", label: "Cancelled" },
];

const PAYMENT_OPTIONS: { value: PurchasePaymentStatusFilter; label: string }[] = [
  { value: "all", label: "All payment statuses" },
  { value: "paid", label: "Paid" },
  { value: "partially_paid", label: "Partially paid" },
  { value: "unpaid", label: "Unpaid" },
];

const STATUS_META: Record<string, { label: string; chip: string; icon: React.ReactNode }> = {
  draft: { label: "Draft", chip: "bg-surface-container-high text-on-surface-variant", icon: <IconDraft className="h-3.5 w-3.5" /> },
  ordered: { label: "Ordered", chip: "bg-surface-container text-primary", icon: <IconTruck className="h-3.5 w-3.5" /> },
  partially_received: { label: "Partially Received", chip: "bg-tertiary-fixed text-on-tertiary-fixed", icon: <IconTimelapse className="h-3.5 w-3.5" /> },
  received: { label: "Received", chip: "bg-secondary-container text-on-secondary-container", icon: <IconCheckAll className="h-3.5 w-3.5" /> },
  cancelled: { label: "Cancelled", chip: "bg-error-container/50 text-on-error-container", icon: <IconCancelled className="h-3.5 w-3.5" /> },
};

const PAYMENT_META: Record<string, { label: string; chip: string }> = {
  unpaid: { label: "Unpaid", chip: "bg-surface-container text-outline" },
  partially_paid: { label: "Partially Paid", chip: "bg-tertiary-fixed/60 text-on-tertiary-fixed-variant" },
  paid: { label: "Paid", chip: "bg-secondary-container/70 text-secondary" },
};

const AVATAR_TONES = [
  "bg-primary-fixed text-on-primary-fixed-variant",
  "bg-secondary-container text-on-secondary-container",
  "bg-tertiary-fixed text-on-tertiary-fixed",
  "bg-surface-container-high text-primary",
];

function initialsOf(name: string): string {
  const words = name.split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join("") || "?";
}

function avatarTone(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return AVATAR_TONES[hash % AVATAR_TONES.length];
}

export default function PurchasesPage() {
  usePageTitle("Purchases");
  const { principal } = useAuth();
  const toast = useToast();
  const canWrite = can(principal, "purchases:write");
  const canReadSuppliers = can(principal, "suppliers:read");
  const canReadProducts = can(principal, "products:read");

  /* ------------------------------ filters ------------------------------ */
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [supplierId, setSupplierId] = useState("");
  const [status, setStatus] = useState<PurchaseStatusFilter>("all");
  const [paymentStatus, setPaymentStatus] = useState<PurchasePaymentStatusFilter>("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState<PurchaseSort>("recent_first");
  const [pageSize, setPageSize] = useState(10);
  const [page, setPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 300);
    return () => window.clearTimeout(t);
  }, [searchInput]);

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

  const filtersChanged = [search, supplierId, status, paymentStatus, dateFrom, dateTo, sort, page, pageSize];

  /* ------------------------------- queries ------------------------------ */
  const ledgerQuery = useMemo(
    () => ({
      search: search || undefined,
      supplierId: supplierId || undefined,
      status,
      paymentStatus,
      dateFrom: dateFrom ? dateInputToMillis(dateFrom) : undefined,
      dateTo: dateTo ? istDayEnd(dateInputToMillis(dateTo)) : undefined,
      sort,
      page,
      pageSize,
    }),
    [search, supplierId, status, paymentStatus, dateFrom, dateTo, sort, page, pageSize],
  );

  const { data, loading, error, reload } = useApiQuery<PurchaseLedgerPage>(() => apiGet<PurchaseLedgerPage>("/admin/purchases/ledger", ledgerQuery), filtersChanged);

  const { data: suppliers } = useApiQuery<SupplierDoc[]>(
    () => (canReadSuppliers ? apiGet<SupplierDoc[]>("/admin/suppliers") : Promise.resolve([])),
    [canReadSuppliers],
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

  function toggleRow(row: PurchaseLedgerRow) {
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
    setSupplierId("");
    setStatus("all");
    setPaymentStatus("all");
    setDateFrom("");
    setDateTo("");
    setSort("recent_first");
    setPageSize(10);
    setPage(1);
  }

  /* ------------------------------- overlays ------------------------------ */
  const [formOpen, setFormOpen] = useState(false);
  const [editDoc, setEditDoc] = useState<PurchaseDoc | null>(null);
  const [receiveDoc, setReceiveDoc] = useState<PurchaseDoc | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [openingDoc, setOpeningDoc] = useState(false);

  const detailRow = useMemo(() => items.find((r) => r.id === detailId) ?? null, [items, detailId]);

  function openCreate() {
    setEditDoc(null);
    setFormOpen(true);
  }

  /** Edit needs the full draft document (real per-line data), fetched fresh. */
  async function openEdit(id: string) {
    setDetailId(null);
    setOpeningDoc(true);
    try {
      const doc = await apiGet<PurchaseDoc>(`/admin/purchases/${id}`);
      setEditDoc(doc);
      setFormOpen(true);
    } catch (err) {
      toast.error("Could not open the draft", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setOpeningDoc(false);
    }
  }

  /** Receiving needs the real per-line outstanding quantities — always fetch fresh. */
  async function openReceive(id: string) {
    setDetailId(null);
    setOpeningDoc(true);
    try {
      const doc = await apiGet<PurchaseDoc>(`/admin/purchases/${id}`);
      setReceiveDoc(doc);
    } catch (err) {
      toast.error("Could not open receiving", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setOpeningDoc(false);
    }
  }

  function handleSaved() {
    toast.success(editDoc ? "Draft updated" : "Purchase recorded", editDoc ? "The draft has been saved." : "Stock enters the ledger when goods are received.");
    setEditDoc(null);
    reload();
  }

  function handleReceived() {
    toast.success("Goods received", "Inventory was credited by exactly the confirmed quantities.");
    reload();
  }

  /* -------------------------------- export ------------------------------- */
  const [exporting, setExporting] = useState(false);

  async function exportCsv(scope: "filtered" | "selected") {
    setExporting(true);
    try {
      let rows: PurchaseLedgerRow[];
      if (scope === "selected") {
        rows = selectedRows;
      } else {
        const res = await apiGet<PurchaseLedgerPage>("/admin/purchases/ledger", { ...ledgerQuery, page: 1, pageSize: 500 });
        rows = res.items;
        if (res.total > 500) {
          toast.push({
            title: "Large result set",
            description: `Exported the first 500 of ${formatNumber(res.total)} purchases — narrow the filters for a complete export.`,
            variant: "info",
          });
        }
      }
      if (rows.length === 0) {
        toast.error("Nothing to export", "No purchases match the current selection.");
        return;
      }
      const header = [
        "PO reference",
        "Supplier",
        "Supplier location",
        "Purchase date (IST)",
        "Expected delivery (IST)",
        "Supplier invoice #",
        "Items",
        "Ordered units",
        "Received units",
        "Unit",
        "Subtotal (INR)",
        "Discount (INR)",
        "Tax (INR)",
        "Total (INR)",
        "Paid (INR)",
        "Outstanding (INR)",
        "Delivery status",
        "Payment status",
        "Raised by",
      ];
      const body = rows.map((r) => [
        r.reference,
        r.supplierName,
        r.supplierLocation ?? "",
        formatDate(r.purchaseDate),
        r.expectedDeliveryDate ? formatDate(r.expectedDeliveryDate) : "",
        r.supplierInvoiceNumber ?? "",
        r.itemCount,
        r.orderedUnits,
        r.receivedUnits,
        r.unitLabel,
        (r.subTotalPaise / 100).toFixed(2),
        (r.discountTotalPaise / 100).toFixed(2),
        (r.taxTotalPaise / 100).toFixed(2),
        (r.totalPaise / 100).toFixed(2),
        (r.paidPaise / 100).toFixed(2),
        (r.outstandingPaise / 100).toFixed(2),
        STATUS_META[r.status]?.label ?? r.status,
        PAYMENT_META[r.paymentStatus]?.label ?? r.paymentStatus,
        r.createdByName ?? "",
      ]);
      downloadTextFile(
        `annaadhya-purchase-ledger-${new Date().toISOString().slice(0, 10)}.csv`,
        `\uFEFF${toCsv([header, ...body])}\r\n`,
      );
      toast.success("Export ready", `${formatNumber(rows.length)} purchase${rows.length === 1 ? "" : "s"} exported to CSV.`);
    } catch (err) {
      toast.error("Export failed", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setExporting(false);
    }
  }

  /* --------------------------------- view -------------------------------- */
  const summary = data?.summary;
  const filtersActive = Boolean(search) || supplierId !== "" || status !== "all" || paymentStatus !== "all" || dateFrom !== "" || dateTo !== "";
  const [priorityDismissed, setPriorityDismissed] = useState(false);
  const priority = filtersActive ? null : (summary?.priority ?? null);

  return (
    <div>
      <PageHeader
        eyebrow={
          <>
            <span>Console</span>
            <IconChevronRight className="h-3 w-3" />
            <span>Operations</span>
            <IconChevronRight className="h-3 w-3" />
            <span className="font-bold text-primary">Purchases &amp; Intake</span>
          </>
        }
        title="Purchases & Procurement"
        description="Manage raw consignments, supplier payables and multi-stage inwarding — stock is credited only when goods are physically received and confirmed."
        actions={
          <>
            <Button variant="outline" onClick={() => exportCsv("filtered")} loading={exporting}>
              <IconDownload className="h-4 w-4" />
              Export ledger (CSV)
            </Button>
            {canWrite ? (
              <Button onClick={openCreate}>
                <IconPlus className="h-4 w-4" />
                New Purchase
              </Button>
            ) : null}
          </>
        }
      />

      {/* Summary cards — same filtered scope as the table below */}
      <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Purchases summary">
        <SummaryCard
          tone="primary"
          icon={<IconDraft className="h-5 w-5" />}
          label="Total Purchases"
          value={summary ? formatNumber(summary.totalPurchases) : "—"}
          unit="recorded"
          sub={summary ? `${formatNumber(summary.draftCount)} draft${summary.draftCount === 1 ? "" : "s"} · ${formatNumber(summary.cancelledCount)} cancelled` : undefined}
        />
        <SummaryCard
          tone="gold"
          icon={<IconTruck className="h-5 w-5" />}
          label="Pending Deliveries"
          value={summary ? formatNumber(summary.pendingDeliveries) : "—"}
          unit="inward"
          sub={
            summary
              ? summary.partiallyReceivedCount > 0
                ? `${formatNumber(summary.partiallyReceivedCount)} partially received — balance on the road`
                : "Nothing awaiting a balance delivery"
              : undefined
          }
        />
        <SummaryCard
          tone="secondary"
          icon={<IconCheckAll className="h-5 w-5" />}
          label="Goods Received"
          value={summary ? formatNumber(summary.goodsReceived) : "—"}
          unit="completed"
          sub={summary && summary.totalPurchases > 0 ? `${Math.round((summary.goodsReceived / summary.totalPurchases) * 100)}% of purchases fully inwarded` : undefined}
        />
        <SummaryCard
          tone="neutral"
          icon={<IconPayments className="h-5 w-5" />}
          label="Procurement Spend"
          value={summary ? formatINRRounded(summary.spendPaise) : "—"}
          unit="INR"
          sub={
            summary && summary.spendPaise > 0
              ? `${formatINRRounded(summary.paidPaise)} settled · ${formatINRRounded(summary.outstandingPaise)} outstanding`
              : "No spend recorded in this view"
          }
        />
      </div>

      {/* Inward priority callout — only when a real pending consignment exists */}
      {priority && !priorityDismissed ? (
        <div className="mb-6 flex flex-col gap-3 rounded-xl bg-surface-container-low p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)] lg:flex-row lg:items-center lg:justify-between">
          <div className="flex items-start gap-3 sm:items-center">
            <span aria-hidden className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
              <IconPriority className="h-6 w-6" />
            </span>
            <div className="space-y-0.5">
              <div className="flex flex-wrap items-center gap-2">
                <span className="label-eyebrow font-bold text-primary">Inward priority</span>
                <span className="rounded-full bg-surface-container-highest px-2 py-0.5 text-[11px] font-semibold text-primary">
                  {priority.partiallyReceived ? "Balance consignment" : "Awaiting first delivery"}
                </span>
              </div>
              <p className="font-display text-base font-semibold text-on-surface">
                {priority.supplierName}: {formatNumber(priority.outstandingUnits)} {priority.unitLabel} outstanding on {priority.reference}
              </p>
              <p className="text-[13px] text-on-surface-variant">
                {priority.expectedDeliveryDate ? `Expected ${formatDate(priority.expectedDeliveryDate)} · ` : ""}
                confirm the physical delivery to credit inventory.
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canWrite ? (
              <Button size="sm" loading={openingDoc} onClick={() => openReceive(priority.id)}>
                <IconReceive className="h-4 w-4" />
                Receive &amp; Inward Stock
              </Button>
            ) : null}
            <button
              type="button"
              title="Dismiss highlight"
              aria-label="Dismiss priority highlight"
              onClick={() => setPriorityDismissed(true)}
              className="rounded-lg bg-surface-container-lowest p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
            >
              <IconCancelled className="h-4 w-4" />
            </button>
          </div>
        </div>
      ) : null}

      {/* Toolbar */}
      <div className="mb-4 rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
          {/* min-w floor: a basis-0 flex-1 collapses to ~0 next to the wrapping filter
              group at ~1280–1500px, letting the ⌘K chip escape the card and the input
              overlap the selects (the products console pattern avoids this). */}
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
              placeholder="Search by PO ref, supplier, invoice, or commodity…"
              aria-label="Search purchases"
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
                aria-label="Filter by supplier"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={supplierId}
                onChange={(e) => {
                  setSupplierId(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All suppliers</option>
                {(suppliers ?? []).map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-44">
              <Select
                aria-label="Filter by delivery status"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value as PurchaseStatusFilter);
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
            <div className="w-44">
              <Select
                aria-label="Filter by payment status"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={paymentStatus}
                onChange={(e) => {
                  setPaymentStatus(e.target.value as PurchasePaymentStatusFilter);
                  setPage(1);
                }}
              >
                {PAYMENT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>
            <div className="w-40">
              <Select
                aria-label="Sort purchases"
                className="cursor-pointer bg-surface-container-low py-2 text-xs font-semibold"
                value={sort}
                onChange={(e) => {
                  setSort(e.target.value as PurchaseSort);
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
            <div className="flex items-center gap-1.5">
              <input
                type="date"
                aria-label="From date"
                value={dateFrom}
                max={dateTo || undefined}
                onChange={(e) => {
                  setDateFrom(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg bg-surface-container-low px-2 py-2 text-xs text-on-surface shadow-inner focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span className="text-xs text-outline">→</span>
              <input
                type="date"
                aria-label="To date"
                value={dateTo}
                min={dateFrom || undefined}
                onChange={(e) => {
                  setDateTo(e.target.value);
                  setPage(1);
                }}
                className="rounded-lg bg-surface-container-low px-2 py-2 text-xs text-on-surface shadow-inner focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <button
              type="button"
              title="Reset filters"
              aria-label="Reset filters"
              onClick={clearFilters}
              className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-low hover:text-primary"
            >
              <IconReset className="h-5 w-5" />
            </button>
          </div>
        </div>

        {/* Bulk selection bar */}
        {selectedRows.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl bg-primary-container px-4 py-2.5 text-on-primary-container shadow-[0_1px_8px_rgba(39,24,16,0.08)]">
            <p className="text-xs font-semibold">
              <span className="font-bold">{selectedRows.length} purchase{selectedRows.length === 1 ? "" : "s"} selected:</span>{" "}
              <span className="underline decoration-on-primary-container/40">
                {selectedRows
                  .slice(0, 3)
                  .map((r) => r.reference)
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

      {/* Purchases ledger table */}
      <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        {loading ? (
          <TableSkeleton rows={8} cols={8} />
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : !data || data.total === 0 ? (
          filtersActive ? (
            <EmptyState
              title="No purchase orders in this view"
              description="No consignments or drafts match your current filters. Reset the filters to return to the full ledger."
              action={
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Reset all filters
                </Button>
              }
            />
          ) : (
            <EmptyState
              title="No purchase orders yet"
              description="Your procurement ledger is empty. Raise a purchase order to a supplier — stock enters the ledger only when goods are received."
              action={
                canWrite ? (
                  <Button size="sm" onClick={openCreate}>
                    <IconPlus className="h-4 w-4" />
                    New Purchase
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
                  <TH scope="col">PO ref &amp; date</TH>
                  <TH scope="col">Supplier &amp; location</TH>
                  <TH scope="col">Items breakdown</TH>
                  <TH scope="col" className="text-right">Total (₹)</TH>
                  <TH scope="col" className="min-w-[170px]">Physical inward progress</TH>
                  <TH scope="col" className="text-center">Delivery status</TH>
                  <TH scope="col" className="text-center">Payment status</TH>
                  <TH scope="col" className="text-right">Actions</TH>
                </TR>
              </THead>
              <TBody>
                {items.map((row) => {
                  const outstanding = Math.max(0, row.orderedUnits - row.receivedUnits);
                  const pct = row.orderedUnits > 0 ? Math.min(100, Math.round((row.receivedUnits / row.orderedUnits) * 100)) : 0;
                  const st = STATUS_META[row.status] ?? STATUS_META.draft;
                  const pay = PAYMENT_META[row.paymentStatus] ?? PAYMENT_META.unpaid;
                  const receivable = canWrite && (row.status === "ordered" || row.status === "partially_received") && outstanding > 0;
                  return (
                    <TR
                      key={row.id}
                      className={`group cursor-pointer ${row.status === "cancelled" ? "opacity-60" : ""} ${selected.has(row.id) ? "bg-surface-container/40" : undefined}`}
                      onClick={() => setDetailId(row.id)}
                    >
                      <TD className="pl-3! pr-1! text-center" onClick={(e) => e.stopPropagation()}>
                        <input
                          type="checkbox"
                          aria-label={`Select ${row.reference}`}
                          checked={selected.has(row.id)}
                          onChange={() => toggleRow(row)}
                          className="h-4 w-4 cursor-pointer accent-primary"
                        />
                      </TD>
                      <TD>
                        <p className={`text-[13px] font-bold text-primary group-hover:underline ${row.status === "cancelled" ? "line-through" : ""}`}>{row.reference}</p>
                        <p className="text-[11px] text-on-surface-variant">
                          {formatDate(row.purchaseDate)}
                          {row.expectedDeliveryDate ? ` • due ${formatDate(row.expectedDeliveryDate)}` : ""}
                        </p>
                        {row.createdByName ? <p className="text-[11px] text-outline">By {row.createdByName}</p> : null}
                      </TD>
                      <TD className="px-2!">
                        <div className="flex items-center gap-2.5">
                          <span
                            aria-hidden
                            className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold ${avatarTone(row.supplierId)}`}
                          >
                            {initialsOf(row.supplierName)}
                          </span>
                          <div className="min-w-0">
                            <p className="max-w-[14rem] truncate text-[13px] font-semibold text-on-surface" title={row.supplierName}>
                              {row.supplierName}
                            </p>
                            <p className="max-w-[14rem] truncate text-[11px] text-on-surface-variant" title={row.supplierLocation ?? ""}>
                              {row.supplierLocation ?? "Location not recorded"}
                              {row.supplierStatus === "inactive" ? " • paused" : ""}
                            </p>
                          </div>
                        </div>
                      </TD>
                      <TD className="px-2!">
                        <p className="max-w-[13rem] truncate text-[13px] font-medium text-on-surface" title={row.itemsPreview}>
                          {row.itemCount} item{row.itemCount === 1 ? "" : "s"} • {row.itemsPreview || "—"}
                        </p>
                        {row.supplierInvoiceNumber ? <p className="font-mono text-[11px] text-outline">Inv {row.supplierInvoiceNumber}</p> : null}
                      </TD>
                      <TD className="px-2! text-right">
                        <p className="font-mono text-[13px] font-bold text-on-surface">{formatINR(row.totalPaise)}</p>
                        <p className="text-[11px] text-on-surface-variant">
                          {row.outstandingPaise > 0 ? `${formatINR(row.outstandingPaise)} due` : row.status === "cancelled" ? "Voided" : "Settled"}
                        </p>
                      </TD>
                      <TD className="px-2!">
                        <div className="flex justify-between text-[11px] font-semibold">
                          <span className={pct === 100 ? "text-secondary" : "text-on-surface"}>
                            {formatNumber(row.receivedUnits)} / {formatNumber(row.orderedUnits)} {row.unitLabel}
                          </span>
                          <span className={pct === 100 ? "text-secondary" : "text-tertiary"}>{pct}%</span>
                        </div>
                        <div className="mt-1 h-2 overflow-hidden rounded-full bg-surface-container-high">
                          <div
                            className={`h-full rounded-full ${row.status === "cancelled" ? "bg-error/30" : pct === 100 ? "bg-secondary" : pct > 0 ? "bg-tertiary-fixed-dim" : "bg-primary/20"}`}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <p className="mt-0.5 text-[11px] text-on-surface-variant">
                          {row.status === "cancelled"
                            ? "Order revoked — received stock kept"
                            : pct === 100
                              ? "All items inwarded"
                              : outstanding > 0
                                ? `${formatNumber(outstanding)} ${row.unitLabel} outstanding`
                                : "Awaiting first delivery"}
                        </p>
                      </TD>
                      <TD className="px-2! text-center">
                        <span className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-bold ${st.chip}`}>
                          {st.icon}
                          {st.label}
                        </span>
                      </TD>
                      <TD className="px-2! text-center">
                        <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ${pay.chip}`}>{pay.label}</span>
                      </TD>
                      <TD className="px-2!" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {receivable ? (
                            <button
                              type="button"
                              onClick={() => openReceive(row.id)}
                              className="inline-flex items-center gap-1 rounded-lg bg-primary px-2.5 py-1.5 text-xs font-semibold text-on-primary shadow-sm transition-colors hover:bg-primary-container"
                            >
                              <IconReceive className="h-3.5 w-3.5" />
                              Receive Goods
                            </button>
                          ) : null}
                          {canWrite && row.status === "draft" ? (
                            <IconAction label={`Edit draft ${row.reference}`} onClick={() => openEdit(row.id)}>
                              <IconDraft className="h-4 w-4" />
                            </IconAction>
                          ) : null}
                          <IconAction label={`View details for ${row.reference}`} onClick={() => setDetailId(row.id)}>
                            <IconEye className="h-4 w-4" />
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
              <div className="flex flex-wrap items-center gap-3">
                <p>
                  Showing{" "}
                  <strong className="text-on-surface">
                    {data.total === 0 ? "0" : `${(data.page - 1) * data.pageSize + 1}–${Math.min(data.page * data.pageSize, data.total)}`}
                  </strong>{" "}
                  of <strong className="text-on-surface">{formatNumber(data.total)}</strong> recorded purchase orders
                </p>
                <label className="flex items-center gap-1 text-xs">
                  Rows:
                  <select
                    aria-label="Rows per page"
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="rounded bg-surface-container-lowest px-1.5 py-0.5 text-xs font-semibold text-on-surface focus:outline-none"
                  >
                    {[10, 25, 50].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <nav aria-label="Purchases pagination" className="flex items-center gap-1">
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
          <IconShieldCheck className="h-5 w-5 shrink-0 text-secondary" />
          <span>
            Receiving is the only path that credits inventory — drafts and confirmed orders never move stock • procurement costs stay separate from retail prices.
          </span>
        </p>
        <p className="label-eyebrow text-outline">All figures in INR (₹) • GST entered per line</p>
      </div>

      {/* Overlays */}
      <PurchaseDetailDrawer
        open={detailRow !== null}
        onClose={() => setDetailId(null)}
        row={detailRow}
        canWrite={canWrite}
        onChanged={reload}
        onEditDraft={openEdit}
        onReceive={(id) => {
          void openReceive(id);
        }}
      />
      <PurchaseFormDialog
        open={formOpen}
        onClose={() => setFormOpen(false)}
        purchase={editDoc}
        suppliers={suppliers ?? []}
        products={products}
        onSaved={handleSaved}
      />
      <ReceiveGoodsDialog
        open={receiveDoc !== null}
        onClose={() => setReceiveDoc(null)}
        purchase={receiveDoc}
        supplierName={detailRow?.supplierName ?? items.find((r) => r.id === receiveDoc?.id)?.supplierName}
        onReceived={handleReceived}
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
  const wanted = new Set([1, 2, current - 1, current, current + 1, total - 1, total].filter((p) => p >= 1 && p <= total));
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
