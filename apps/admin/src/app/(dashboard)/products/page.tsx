"use client";
/**
 * /products — the catalogue console page per the approved "Modern Indian Heritage" design.
 *
 * Features (all live, no prototype stubs):
 *  - catalogue metrics: total / active / draft / low-stock alerts
 *  - search (⌘K, deep-links from the topbar via ?q=), category + status + stock filters, sort
 *  - bulk selection → set status / adjust pricing / archive (products:write)
 *  - heritage table rows: thumbnail, variant summary, SKU + DEMO chip, category pill,
 *    price with MRP strike, stock level dot + badges, status, updated, ⋮ action menu
 *  - row action menu: Edit Product · View on Store · Duplicate · Publish/Unpublish · Archive
 *  - Export Catalog (CSV of the current filtered view) + Import Batch (CSV → drafts)
 *  - pagination footer ("Showing 1–7 of 48 products")
 *
 * Data: GET /admin/catalogue/products (up to 48 rows per the API's admin listing cap) and
 * GET /admin/catalogue/categories; every mutation goes through the documented upsert API.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ApiError, apiDelete, apiGet, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { formatINR, formatINRRounded } from "@/lib/format";
import { relativeDayTime } from "@/lib/relative-time";
import { downloadTextFile, toCsv } from "@/lib/csv";
import { useToast } from "@/lib/toast";
import type { CategoryDoc, Page, ProductStatus, ProductWithVariants } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { productDocToPayload } from "@/components/products/product-form";
import { ImportBatchDialog } from "@/components/products/import-dialog";
import { BulkPricingDialog, BulkStatusDialog } from "@/components/products/bulk-dialogs";

const PAGE_SIZE = 7;

type StockLevel = "healthy" | "low" | "critical" | "out";
type StockFilter = "all" | StockLevel;
type StatusFilter = "all" | ProductStatus;
type SortKey = "updated" | "price_high" | "price_low" | "stock_low";

interface StockInfo {
  available: number;
  level: StockLevel;
  flaggedVariants: number;
}

function stockInfo(p: ProductWithVariants): StockInfo {
  const available = p.variants.reduce((sum, v) => sum + (v.stockOnHand - v.reservedQty), 0);
  const flaggedVariants = p.variants.filter((v) => v.stockOnHand - v.reservedQty <= v.lowStockThreshold).length;
  const threshold = p.variants.length > 0 ? Math.min(...p.variants.map((v) => Math.max(1, v.lowStockThreshold))) : 5;
  let level: StockLevel = "healthy";
  if (available <= 0) level = "out";
  else if (available <= Math.min(5, threshold)) level = "critical";
  else if (available <= threshold) level = "low";
  return { available, level, flaggedVariants };
}

function priceLabel(paise: number): string {
  return paise % 100 === 0 ? formatINRRounded(paise) : formatINR(paise);
}

/* ------------------------------- small pieces ------------------------------ */

function MetricCard({
  label,
  value,
  suffix,
  note,
  tone,
  icon,
}: {
  label: string;
  value: number | string;
  suffix: string;
  note: string;
  tone: "primary" | "secondary" | "neutral" | "error";
  icon: React.ReactNode;
}) {
  const tones = {
    primary: { text: "text-primary", chip: "bg-surface-container-high text-primary", decor: "bg-surface-container-high/40" },
    secondary: { text: "text-secondary", chip: "bg-secondary-container text-secondary", decor: "bg-secondary-container/40" },
    neutral: { text: "text-on-surface", chip: "bg-surface-container text-tertiary", decor: "bg-surface-container-highest/60" },
    error: { text: "text-error", chip: "bg-error-container text-error", decor: "bg-error-container/40" },
  }[tone];
  return (
    <div className="group relative overflow-hidden rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
      <span aria-hidden className={`metric-decor ${tones.decor}`} />
      <div className="relative mb-2 flex items-center justify-between">
        <span className="label-eyebrow text-on-surface-variant">{label}</span>
        <span aria-hidden className={`flex h-8 w-8 items-center justify-center rounded-full ${tones.chip}`}>
          {icon}
        </span>
      </div>
      <div className="relative flex items-baseline gap-1.5">
        <span className={`font-display text-[26px] font-semibold leading-8 ${tones.text}`}>{value}</span>
        <span className="text-xs font-medium text-secondary">{suffix}</span>
      </div>
      <p className="relative mt-1 text-[13px] text-on-surface-variant">{note}</p>
    </div>
  );
}

function ProductThumb({ product }: { product: ProductWithVariants }) {
  const [failed, setFailed] = useState(false);
  const src = product.images[0]?.url;
  if (src && !failed) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- remote Cloudinary thumbs, plain img keeps the admin bundle lean
      <img
        src={src}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-11 w-11 shrink-0 rounded-lg object-cover shadow-sm"
      />
    );
  }
  return (
    <span
      aria-hidden
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-surface-container font-display text-base font-semibold text-primary shadow-sm"
    >
      {product.name.charAt(0).toUpperCase()}
    </span>
  );
}

function StockCell({ info, status }: { info: StockInfo; status: ProductStatus }) {
  const dot =
    info.level === "out"
      ? "bg-error"
      : info.level === "critical"
        ? "bg-error animate-pulse"
        : info.level === "low"
          ? "bg-tertiary-fixed-dim"
          : "bg-secondary";
  const valueColor =
    info.level === "out" || info.level === "critical" ? "text-error" : info.level === "low" ? "text-tertiary" : "text-secondary";
  return (
    <div className="flex flex-col items-start gap-1">
      <span className="flex items-center gap-1.5">
        <span aria-hidden className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
        <span className={`text-xs font-semibold ${valueColor}`}>{info.available} units</span>
        {info.level === "out" && status === "archived" ? <span className="text-xs text-outline">(Retired)</span> : null}
      </span>
      {info.level === "critical" ? (
        <span className="rounded bg-error-container px-1.5 py-0.5 label-eyebrow text-on-error-container">Only {info.available} left</span>
      ) : null}
      {info.level === "low" ? (
        <span className="rounded bg-tertiary-fixed px-1.5 py-0.5 label-eyebrow text-on-tertiary-fixed">Low stock</span>
      ) : null}
      {info.level === "out" && status === "published" ? (
        <span className="rounded bg-surface-container-high px-1.5 py-0.5 label-eyebrow text-on-surface-variant">Awaiting batch</span>
      ) : null}
    </div>
  );
}

function StatusPill({ status }: { status: ProductStatus }) {
  const styles: Record<ProductStatus, string> = {
    published: "bg-secondary-container text-on-secondary-container",
    draft: "bg-surface-container-high text-on-surface-variant",
    archived: "bg-surface-container text-on-surface-variant",
  };
  const label: Record<ProductStatus, string> = { published: "Active", draft: "Draft", archived: "Archived" };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${styles[status]}`}>
      {label[status]}
    </span>
  );
}

function MenuIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={path} />
    </svg>
  );
}

/* --------------------------------- the page -------------------------------- */

export default function ProductsPage() {
  usePageTitle("Products");
  const router = useRouter();
  const { principal } = useAuth();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const menuRootRef = useRef<HTMLDivElement | null>(null);

  // Filters + pagination (client-side over the admin listing).
  const [query, setQuery] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [stockFilter, setStockFilter] = useState<StockFilter>("all");
  const [sortKey, setSortKey] = useState<SortKey>("updated");
  const [page, setPage] = useState(1);
  const searchInputRef = useRef<HTMLInputElement | null>(null);

  // Selection + dialogs.
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [importOpen, setImportOpen] = useState(false);
  const [bulkStatusOpen, setBulkStatusOpen] = useState(false);
  const [bulkPricingOpen, setBulkPricingOpen] = useState(false);

  const { data, loading, error, reload } = useApiQuery<Page<ProductWithVariants>>(
    () => apiGet<Page<ProductWithVariants>>("/admin/catalogue/products"),
  );
  const { data: categories } = useApiQuery<CategoryDoc[]>(() => apiGet("/admin/catalogue/categories"));

  const canWrite = can(principal, "products:write");
  const items = useMemo(() => data?.items ?? [], [data]);
  const categoryName = useCallback(
    (id: string) => categories?.find((c) => c.id === id)?.name ?? "Uncategorised",
    [categories],
  );

  // Deep link: topbar global search lands on /products?q=… → prefill the catalogue search.
  useEffect(() => {
    const q = new URLSearchParams(window.location.search).get("q");
    if (q) setQuery(q);
  }, []);

  // ⌘K / Ctrl+K focuses the catalogue search (per the design's kbd hint).
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

  // Close the row menu on any outside click / Escape.
  useEffect(() => {
    if (!openMenuId) return;
    function onPointerDown(e: MouseEvent) {
      if (!menuRootRef.current?.contains(e.target as Node)) setOpenMenuId(null);
    }
    function onKeydown(e: KeyboardEvent) {
      if (e.key === "Escape") setOpenMenuId(null);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeydown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeydown);
    };
  }, [openMenuId]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = items.filter((p) => {
      if (categoryFilter !== "all" && p.categoryId !== categoryFilter) return false;
      if (statusFilter !== "all" && p.status !== statusFilter) return false;
      if (stockFilter !== "all" && stockInfo(p).level !== stockFilter) return false;
      if (q) {
        const haystack = `${p.name} ${p.sku} ${p.subtitle} ${categoryName(p.categoryId)}`.toLowerCase();
        if (!haystack.includes(q)) return false;
      }
      return true;
    });
    const minPrice = (p: ProductWithVariants) =>
      p.variants.length > 0 ? Math.min(...p.variants.map((v) => v.pricePaise)) : Number.POSITIVE_INFINITY;
    switch (sortKey) {
      case "price_high":
        return [...list].sort((a, b) => minPrice(b) - minPrice(a));
      case "price_low":
        return [...list].sort((a, b) => minPrice(a) - minPrice(b));
      case "stock_low":
        return [...list].sort((a, b) => stockInfo(a).available - stockInfo(b).available);
      default:
        return [...list].sort((a, b) => b.updatedAt - a.updatedAt);
    }
  }, [items, query, categoryFilter, statusFilter, stockFilter, sortKey, categoryName]);

  // Reset to the first page whenever the filter view changes.
  useEffect(() => {
    setPage(1);
  }, [query, categoryFilter, statusFilter, stockFilter, sortKey]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  const metrics = useMemo(() => {
    const active = items.filter((p) => p.status === "published").length;
    const drafts = items.filter((p) => p.status === "draft").length;
    const flagged = items.reduce((sum, p) => sum + stockInfo(p).flaggedVariants, 0);
    return { total: data?.total ?? items.length, active, drafts, flagged };
  }, [items, data]);

  const selectedProducts = useMemo(
    () => (canWrite ? items.filter((p) => selectedIds.has(p.id)) : []),
    [items, selectedIds, canWrite],
  );
  const allFilteredSelected = filtered.length > 0 && filtered.every((p) => selectedIds.has(p.id));

  function toggleSelectAll() {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (allFilteredSelected) filtered.forEach((p) => next.delete(p.id));
      else filtered.forEach((p) => next.add(p.id));
      return next;
    });
  }

  function toggleSelectOne(id: string) {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const existingSkus = useMemo(() => new Set(items.map((p) => p.sku.toUpperCase())), [items]);

  /* ------------------------------- mutations ------------------------------- */

  async function togglePublish(product: ProductWithVariants) {
    const nextStatus: ProductStatus = product.status === "published" ? "draft" : "published";
    setBusyId(product.id);
    try {
      await apiPost(`/admin/catalogue/products/${product.id}`, productDocToPayload(product, nextStatus));
      toast.success(nextStatus === "published" ? "Product published" : "Product unpublished", product.sku);
      reload();
    } catch (err) {
      toast.error("Could not update product", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusyId(null);
      setOpenMenuId(null);
    }
  }

  async function archive(product: ProductWithVariants) {
    if (!window.confirm(`Archive ${product.sku} — ${product.name}? Archived products and their variants leave the storefront.`)) {
      setOpenMenuId(null);
      return;
    }
    setBusyId(product.id);
    try {
      await apiDelete(`/admin/catalogue/products/${product.id}`);
      toast.success("Product archived", product.sku);
      reload();
    } catch (err) {
      toast.error("Could not archive product", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusyId(null);
      setOpenMenuId(null);
    }
  }

  async function duplicate(product: ProductWithVariants) {
    setBusyId(product.id);
    try {
      const baseSku = `${product.sku}-C`.toUpperCase().replace(/[^A-Z0-9\-_.]/g, "");
      let sku = baseSku.slice(0, 41);
      let suffix = 2;
      while (existingSkus.has(sku) && suffix < 100) {
        sku = `${baseSku.slice(0, 39)}${suffix}`.slice(0, 41);
        suffix++;
      }
      // Variant SKUs are globally unique — a copy must NOT reuse the source's
      // variant SKUs or the create call always 409s. Same for the slug.
      const renameVariantSku = (vs: string) => `${vs}-C`.toUpperCase().replace(/[^A-Z0-9\-_.]/g, "").slice(0, 39) + "2";
      const payload = {
        ...productDocToPayload(product, "draft"),
        sku,
        name: `${product.name} (Copy)`.slice(0, 120),
        slug: undefined,
        variants: product.variants.map((v) => ({ ...v, id: undefined, sku: renameVariantSku(v.sku) })),
      };
      await apiPost("/admin/catalogue/products", payload);
      toast.success("Draft copy created", `${sku} — review and publish when ready`);
      reload();
    } catch (err) {
      toast.error("Could not duplicate product", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusyId(null);
      setOpenMenuId(null);
    }
  }

  function exportCatalog() {
    const rows: (string | number)[][] = [
      ["sku", "name", "subtitle", "category", "status", "packs", "price_min", "price_max", "stock_available", "updated_at"],
      ...filtered.map((p) => {
        const prices = p.variants.map((v) => v.pricePaise);
        return [
          p.sku,
          p.name,
          p.subtitle,
          categoryName(p.categoryId),
          p.status,
          p.variants.map((v) => v.packLabel).join(" | "),
          prices.length ? (Math.min(...prices) / 100).toFixed(2) : "",
          prices.length ? (Math.max(...prices) / 100).toFixed(2) : "",
          stockInfo(p).available,
          new Date(p.updatedAt).toISOString(),
        ];
      }),
    ];
    downloadTextFile(`annaadhya-products-${new Date().toISOString().slice(0, 10)}.csv`, toCsv(rows));
    toast.success("Catalog exported", `${filtered.length} product${filtered.length === 1 ? "" : "s"} in the current view`);
  }

  function bulkDone(outcome: { updated: number; failed: { sku: string; message: string }[] }) {
    setBulkStatusOpen(false);
    setBulkPricingOpen(false);
    if (outcome.updated > 0) {
      toast.success(`Updated ${outcome.updated} product${outcome.updated === 1 ? "" : "s"}`, "The catalogue reflects the changes now");
    }
    if (outcome.failed.length > 0) {
      toast.error(`${outcome.failed.length} product${outcome.failed.length === 1 ? "" : "s"} failed`, outcome.failed.map((f) => `${f.sku}: ${f.message}`).join(" · "));
    }
    setSelectedIds(new Set());
    reload();
  }

  function resetFilters() {
    setQuery("");
    setCategoryFilter("all");
    setStatusFilter("all");
    setStockFilter("all");
    setSortKey("updated");
  }

  /* --------------------------------- render --------------------------------- */

  const filterResetActive = query !== "" || categoryFilter !== "all" || statusFilter !== "all" || stockFilter !== "all";

  const selectClasses =
    "appearance-none rounded-lg bg-surface-container-low py-2 pl-3 pr-8 text-xs font-semibold text-on-surface cursor-pointer transition-colors hover:bg-surface-container focus:outline-none focus:ring-1 focus:ring-primary";

  return (
    <div className="mx-auto w-full max-w-7xl">
      <PageHeader
        eyebrow={
          <>
            <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5m0 0 9-5m-9 5v10" />
            </svg>
            Inventory &amp; Merchandising
          </>
        }
        title="Products"
        description="Manage your product catalog, pricing, availability, and stock across harvests and consignments."
        actions={
          <>
            <Button variant="outline" size="md" onClick={exportCatalog} disabled={filtered.length === 0}>
              <svg viewBox="0 0 24 24" className="h-4 w-4 text-secondary" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3" />
              </svg>
              Export Catalog
            </Button>
            {canWrite ? (
              <Button variant="outline" size="md" onClick={() => setImportOpen(true)}>
                <svg viewBox="0 0 24 24" className="h-4 w-4 text-secondary" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
                </svg>
                Import Batch
              </Button>
            ) : null}
            {canWrite ? (
              <Link href="/products/new" className="inline-flex">
                <Button size="md">
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
                    <path d="M12 5v14M5 12h14" />
                  </svg>
                  Add Product
                </Button>
              </Link>
            ) : null}
          </>
        }
      />

      {/* Catalogue summary metrics */}
      <section aria-label="Catalogue metrics" className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          label="Total Products"
          value={metrics.total}
          suffix="SKUs total"
          note={`Across ${categories?.length ?? "—"} heritage categories`}
          tone="primary"
          icon={<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M21 8 12 3 3 8v8l9 5 9-5zM3 8l9 5m0 0 9-5m-9 5v10" /></svg>}
        />
        <MetricCard
          label="Active Products"
          value={metrics.active}
          suffix="Published"
          note="Active and purchasable on storefront"
          tone="secondary"
          icon={<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 12 2 2 4-4M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" /></svg>}
        />
        <MetricCard
          label="Draft Products"
          value={metrics.drafts}
          suffix="Staged"
          note="Awaiting release on the storefront"
          tone="neutral"
          icon={<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>}
        />
        <MetricCard
          label="Low Stock Alerts"
          value={metrics.flagged}
          suffix="Flagged"
          note="Variants at or below their threshold"
          tone="error"
          icon={<svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M12 9v4m0 4h.01M10.3 3.9 2.8 17a2 2 0 0 0 1.7 3h15a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>}
        />
      </section>

      {/* Search, filters, bulk actions */}
      <section className="mt-4 space-y-3 rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        <div className="flex flex-col items-stretch justify-between gap-3 lg:flex-row lg:items-center">
          <div className="relative min-w-[240px] flex-1">
            <svg viewBox="0 0 24 24" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
              <circle cx="11" cy="11" r="7" />
              <path d="m20 20-3.5-3.5" />
            </svg>
            <input
              id="catalog-search"
              ref={searchInputRef}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              type="search"
              placeholder="Search products by name, SKU, or category…"
              aria-label="Search products"
              className="w-full rounded-lg bg-surface-container-low py-2.5 pl-10 pr-14 text-sm text-on-surface placeholder:text-on-surface-variant/70 transition-colors focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <kbd className="absolute right-3 top-1/2 -translate-y-1/2 rounded bg-surface-container px-1.5 py-0.5 text-[10px] font-semibold text-on-surface-variant">⌘K</kbd>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className="relative">
              <select aria-label="Filter by category" value={categoryFilter} onChange={(e) => setCategoryFilter(e.target.value)} className={selectClasses}>
                <option value="all">All Categories</option>
                {(categories ?? []).map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
            </span>
            <span className="relative">
              <select aria-label="Filter by status" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value as StatusFilter)} className={selectClasses}>
                <option value="all">All Statuses</option>
                <option value="published">Active</option>
                <option value="draft">Draft</option>
                <option value="archived">Archived</option>
              </select>
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
            </span>
            <span className="relative">
              <select aria-label="Filter by stock level" value={stockFilter} onChange={(e) => setStockFilter(e.target.value as StockFilter)} className={selectClasses}>
                <option value="all">All Stock Levels</option>
                <option value="healthy">In Stock (Healthy)</option>
                <option value="low">Low Stock</option>
                <option value="critical">Running Out</option>
                <option value="out">Out of Stock</option>
              </select>
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m6 9 6 6 6-6" /></svg>
            </span>
            <span className="relative">
              <select aria-label="Sort products" value={sortKey} onChange={(e) => setSortKey(e.target.value as SortKey)} className={selectClasses}>
                <option value="updated">Recently Updated</option>
                <option value="price_high">Price: High to Low</option>
                <option value="price_low">Price: Low to High</option>
                <option value="stock_low">Stock: Lowest First</option>
              </select>
              <svg viewBox="0 0 24 24" className="pointer-events-none absolute right-2 top-1/2 h-4 w-4 -translate-y-1/2 text-outline" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M7 4v13m0 0-3-3m3 3 3-3M17 20V7m0 0-3 3m3-3 3 3" /></svg>
            </span>
            <button
              type="button"
              onClick={resetFilters}
              title="Reset filters"
              aria-label="Reset filters"
              className={`rounded-lg p-2 transition-colors ${filterResetActive ? "text-primary hover:bg-surface-container-low" : "text-on-surface-variant/50"}`}
            >
              <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
                <path d="M22 3H2l8 9.46V19l4 2v-8.54Z" />
              </svg>
            </button>
          </div>
        </div>

        {canWrite && selectedProducts.length > 0 ? (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-primary-container px-4 py-2.5 text-on-primary shadow-md">
            <div className="flex min-w-0 items-center gap-2.5">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-on-tertiary-fixed text-[11px] font-bold text-on-tertiary-fixed">
                {selectedProducts.length}
              </span>
              <span className="text-xs font-semibold">Products Selected</span>
              <span className="hidden truncate text-xs text-on-primary-container sm:inline">
                • {selectedProducts.slice(0, 2).map((p) => p.sku).join(", ")}
                {selectedProducts.length > 2 ? ` +${selectedProducts.length - 2} more` : ""}
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" onClick={() => setBulkStatusOpen(true)} className="flex items-center gap-1 rounded bg-primary/40 px-2.5 py-1 text-xs font-semibold text-on-primary transition-colors hover:bg-primary">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M17 2.1 21 6l-8.5 8.5H8.5V10.5ZM4 14v6h16v-6" /></svg>
                Set Status…
              </button>
              <button type="button" onClick={() => setBulkPricingOpen(true)} className="flex items-center gap-1 rounded bg-primary/40 px-2.5 py-1 text-xs font-semibold text-on-primary transition-colors hover:bg-primary">
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M19 7h-8l-4 5 4 5h8a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2ZM7.5 12h.01" /></svg>
                Adjust Pricing
              </button>
              <button
                type="button"
                onClick={() => {
                  const list = selectedProducts.filter((p) => p.status !== "archived");
                  if (list.length === 0) return;
                  if (window.confirm(`Archive ${list.length} selected product${list.length === 1 ? "" : "s"}? Archived products and their variants leave the storefront.`)) {
                    void (async () => {
                      const failed: { sku: string; message: string }[] = [];
                      let updated = 0;
                      for (const p of list) {
                        try {
                          await apiDelete(`/admin/catalogue/products/${p.id}`);
                          updated++;
                        } catch (err) {
                          failed.push({ sku: p.sku, message: err instanceof ApiError ? err.message : "Unexpected error" });
                        }
                      }
                      bulkDone({ updated, failed });
                    })();
                  }
                }}
                disabled={selectedProducts.every((p) => p.status === "archived")}
                className="flex items-center gap-1 rounded bg-primary/40 px-2.5 py-1 text-xs font-semibold text-on-primary transition-colors hover:bg-primary disabled:cursor-not-allowed disabled:opacity-40"
              >
                <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" /></svg>
                Archive
              </button>
              <button type="button" onClick={() => setSelectedIds(new Set())} className="ml-1 text-xs font-semibold underline underline-offset-2 text-on-primary-container hover:text-on-primary">
                Clear Selection
              </button>
            </div>
          </div>
        ) : null}
      </section>

      {/* Catalogue table */}
      <section className="mt-4 overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        {loading ? (
          <TableSkeleton rows={7} cols={7} />
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : items.length === 0 ? (
          <EmptyState
            title="No products yet"
            description="Create your first product with at least one sellable variant, or import a batch from a CSV."
            action={
              canWrite ? (
                <div className="flex gap-2">
                  <Link href="/products/new">
                    <Button size="sm">Add Product</Button>
                  </Link>
                  <Button size="sm" variant="outline" onClick={() => setImportOpen(true)}>
                    Import Batch
                  </Button>
                </div>
              ) : undefined
            }
          />
        ) : filtered.length === 0 ? (
          <EmptyState
            title="No products match your filters"
            description="Try a different search term, category or status — or reset the filters to see the full catalogue."
            action={
              <Button size="sm" variant="outline" onClick={resetFilters}>
                Reset filters
              </Button>
            }
          />
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  {canWrite ? (
                    <TH scope="col" className="w-10 pl-4">
                      <input
                        type="checkbox"
                        aria-label="Select all filtered products"
                        checked={allFilteredSelected}
                        onChange={toggleSelectAll}
                        className="h-4 w-4 cursor-pointer accent-primary"
                      />
                    </TH>
                  ) : null}
                  <TH scope="col">Product</TH>
                  <TH scope="col">SKU</TH>
                  <TH scope="col">Category</TH>
                  <TH scope="col">Price</TH>
                  <TH scope="col">Stock Level</TH>
                  <TH scope="col">Status</TH>
                  <TH scope="col">Updated</TH>
                  <TH scope="col" className="pr-4 text-right">
                    Actions
                  </TH>
                </TR>
              </THead>
              <TBody>
                {pageRows.map((p) => {
                  const info = stockInfo(p);
                  const prices = p.variants.map((v) => v.pricePaise);
                  const minPrice = prices.length ? Math.min(...prices) : null;
                  const maxPrice = prices.length ? Math.max(...prices) : null;
                  const cheapest = minPrice !== null ? p.variants.find((v) => v.pricePaise === minPrice) : undefined;
                  const mrp = cheapest?.mrpPaise && cheapest.mrpPaise > cheapest.pricePaise ? cheapest.mrpPaise : null;
                  const selected = selectedIds.has(p.id);
                  return (
                    <TR
                      key={p.id}
                      onClick={() => router.push(`/products/${p.id}`)}
                      className={`cursor-pointer ${selected ? "bg-surface-container-high/30" : ""} ${p.status === "archived" ? "opacity-80" : ""}`}
                    >
                      {canWrite ? (
                        <TD className="pl-4" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            aria-label={`Select ${p.sku}`}
                            checked={selected}
                            onChange={() => toggleSelectOne(p.id)}
                            className="h-4 w-4 cursor-pointer accent-primary"
                          />
                        </TD>
                      ) : null}
                      <TD className="max-w-[13.5rem]">
                        <div className="flex min-w-[190px] max-w-[13.5rem] items-center gap-2.5">
                          <ProductThumb product={p} />
                          <div className="flex min-w-0 flex-col">
                            <Link
                              href={`/products/${p.id}`}
                              onClick={(e) => e.stopPropagation()}
                              className="truncate text-sm font-semibold text-primary hover:underline"
                              title={p.name}
                            >
                              {p.name}
                            </Link>
                            <span className="truncate text-xs text-on-surface-variant" title={p.subtitle || p.typeLabel}>
                              {p.variants.length > 0
                                ? `${p.variants.map((v) => v.packLabel).slice(0, 2).join(", ")}${p.variants.length > 2 ? ` +${p.variants.length - 2}` : ""}${p.subtitle ? ` • ${p.subtitle}` : ""}`
                                : p.subtitle || "No variants yet"}
                            </span>
                          </div>
                        </div>
                      </TD>
                      <TD className="font-mono text-xs font-medium text-on-surface-variant" onClick={(e) => e.stopPropagation()}>
                        <span className="flex items-center gap-2">
                          {p.sku}
                          {p.isDemo ? <span className="rounded bg-honey/15 px-1 py-0.5 text-[10px] font-semibold text-honey-dark">DEMO</span> : null}
                        </span>
                      </TD>
                      <TD>
                        <span className="inline-block max-w-[8rem] truncate rounded-full bg-surface-container px-2 py-1 text-[11px] text-on-surface-variant" title={categoryName(p.categoryId)}>{categoryName(p.categoryId)}</span>
                      </TD>
                      <TD>
                        {minPrice === null ? (
                          <span className="text-xs text-on-surface-variant">—</span>
                        ) : (
                          <span className="flex items-baseline gap-1.5">
                            <span className="text-sm font-bold text-primary">
                              {minPrice === maxPrice ? priceLabel(minPrice) : `${priceLabel(minPrice)} – ${priceLabel(maxPrice ?? minPrice)}`}
                            </span>
                            {mrp && minPrice === maxPrice ? <span className="text-xs text-outline line-through">{priceLabel(mrp)}</span> : null}
                          </span>
                        )}
                      </TD>
                      <TD>
                        <StockCell info={info} status={p.status} />
                      </TD>
                      <TD>
                        <StatusPill status={p.status} />
                      </TD>
                      <TD className="text-xs text-on-surface-variant">{relativeDayTime(p.updatedAt)}</TD>
                      <TD className="pr-4 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="relative inline-flex items-center" ref={openMenuId === p.id ? menuRootRef : undefined}>
                          <button
                            type="button"
                            aria-label={`Actions for ${p.sku}`}
                            aria-expanded={openMenuId === p.id}
                            onClick={() => setOpenMenuId(openMenuId === p.id ? null : p.id)}
                            className="rounded-lg p-1.5 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface"
                          >
                            <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor" aria-hidden>
                              <circle cx="12" cy="5" r="1.7" />
                              <circle cx="12" cy="12" r="1.7" />
                              <circle cx="12" cy="19" r="1.7" />
                            </svg>
                          </button>
                          {openMenuId === p.id ? (
                            <div
                              role="menu"
                              aria-label={`Actions for ${p.name}`}
                              className="absolute right-0 top-9 z-30 w-48 rounded-xl bg-surface-container-lowest p-1.5 text-left text-xs font-semibold text-on-surface shadow-lg ring-1 ring-outline-variant/40"
                            >
                              <Link href={`/products/${p.id}`} role="menuitem" className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-surface-container">
                                <MenuIcon path="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /> Edit Product
                              </Link>
                              {p.status === "published" ? (
                                <a
                                  role="menuitem"
                                  href={`${typeof window !== "undefined" ? window.location.origin : ""}/product/${p.slug}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="flex items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-surface-container"
                                >
                                  <MenuIcon path="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" /> View on Store
                                </a>
                              ) : null}
                              {canWrite ? (
                                <button type="button" role="menuitem" onClick={() => duplicate(p)} disabled={busyId === p.id} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-surface-container disabled:opacity-50">
                                  <MenuIcon path="M8 8h12v12H8zM4 16V4h12" /> Duplicate
                                </button>
                              ) : null}
                              {canWrite ? (
                                <button type="button" role="menuitem" onClick={() => togglePublish(p)} disabled={busyId === p.id} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 transition-colors hover:bg-surface-container disabled:opacity-50">
                                  <MenuIcon path="M17 2.1 21 6l-8.5 8.5H8.5V10.5ZM4 14v6h16v-6" />
                                  {p.status === "published" ? "Unpublish" : "Publish"}
                                </button>
                              ) : null}
                              {canWrite && p.status !== "archived" ? (
                                <>
                                  <div className="my-1 border-t border-outline-variant/40" aria-hidden />
                                  <button type="button" role="menuitem" onClick={() => archive(p)} disabled={busyId === p.id} className="flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-error transition-colors hover:bg-error-container disabled:opacity-50">
                                    <MenuIcon path="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" /> Archive
                                  </button>
                                </>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            {/* Pagination footer */}
            <footer className="flex flex-wrap items-center justify-between gap-3 border-t border-outline-variant/40 px-4 py-3 sm:px-6">
              <p className="text-xs text-on-surface-variant">
                Showing{" "}
                <span className="font-semibold text-on-surface">
                  {(safePage - 1) * PAGE_SIZE + 1}–{Math.min(safePage * PAGE_SIZE, filtered.length)}
                </span>{" "}
                of <span className="font-semibold text-on-surface">{filtered.length}</span> products
                {filterResetActive ? ` (filtered from ${items.length})` : ""}
                {data && data.total > data.items.length ? ` · ${data.total} in the full catalogue (admin listing cap ${data.items.length})` : ""}
              </p>
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  aria-label="Previous page"
                  disabled={safePage <= 1}
                  onClick={() => setPage(safePage - 1)}
                  className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m15 6-6 6 6 6" /></svg>
                </button>
                {Array.from({ length: totalPages }, (_, i) => i + 1)
                  .filter((n) => n === 1 || n === totalPages || Math.abs(n - safePage) <= 1)
                  .map((n, index, arr) => (
                    <span key={n} className="flex items-center">
                      {index > 0 && n - arr[index - 1] > 1 ? <span className="px-1 text-xs text-outline">…</span> : null}
                      <button
                        type="button"
                        aria-current={n === safePage ? "page" : undefined}
                        onClick={() => setPage(n)}
                        className={`h-8 min-w-8 rounded-lg px-2 text-xs font-semibold transition-colors ${
                          n === safePage ? "bg-primary text-on-primary shadow-md" : "text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                        }`}
                      >
                        {n}
                      </button>
                    </span>
                  ))}
                <button
                  type="button"
                  aria-label="Next page"
                  disabled={safePage >= totalPages}
                  onClick={() => setPage(safePage + 1)}
                  className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-40"
                >
                  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden><path d="m9 6 6 6-6 6" /></svg>
                </button>
              </div>
            </footer>
          </>
        )}
      </section>

      {/* Dialogs */}
      <ImportBatchDialog
        open={importOpen}
        onClose={() => setImportOpen(false)}
        categories={categories ?? []}
        existingSkus={existingSkus}
        onImported={reload}
      />
      {canWrite ? (
        <>
          <BulkStatusDialog
            open={bulkStatusOpen}
            products={selectedProducts}
            onClose={() => setBulkStatusOpen(false)}
            onDone={bulkDone}
          />
          <BulkPricingDialog
            open={bulkPricingOpen}
            products={selectedProducts}
            onClose={() => setBulkPricingOpen(false)}
            onDone={bulkDone}
          />
        </>
      ) : null}
    </div>
  );
}

