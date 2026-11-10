"use client";
/** Shop toolbar — editorial search field, in-stock toggle, price tiers, sort select,
 *  active-filter chips and a mobile filter sheet (bottom drawer). Every control pushes
 *  URL params so results stay shareable, server-rendered and crawler-friendly. */
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { PRICE_TIERS } from "@/lib/shop-pricing";
import { IconChevronDown, IconSearch, IconSlidersHorizontal, IconX } from "./icons";

const SORTS = [
  { value: "relevance", label: "Sort by: Featured Harvest" },
  { value: "price_asc", label: "Price: Low to High" },
  { value: "price_desc", label: "Price: High to Low" },
  { value: "newest", label: "Newest Arrivals" },
] as const;

export interface ShopState {
  search?: string;
  category?: string;
  sort?: string;
  price?: string;
  instock?: string; // "0" → out-of-stock products included
}

interface Props {
  current: ShopState;
  /** result.total for the active filter set (null while the API is unreachable). */
  showing: number | null;
  /** Size of the whole sellable catalogue ("… of 24 curated pantry treasures"). */
  allCount: number;
  categoryName?: string;
  /** URL base the controls navigate within — "/shop" (default) or "/category/<slug>". */
  basePath?: string;
  /** Noun for the counter line ("Showing 6 of 6 …"). */
  countNoun?: string;
  /** Where "remove category" leads on pages where the category is the route itself
   *  (category templates set this to /shop so the chip still has a real destination). */
  allProductsHref?: string;
}

export function ShopControls({ current, showing, allCount, categoryName, basePath = "/shop", countNoun = "curated pantry treasures", allProductsHref }: Props) {
  const router = useRouter();
  const [query, setQuery] = useState(current.search ?? "");
  const [sheetOpen, setSheetOpen] = useState(false);

  // URL → field sync: searches started OUTSIDE this toolbar (global header search,
  // the 404 page's quick search, browser back/forward, chip removal on other
  // surfaces) change `current.search` without remounting this component — the local
  // state must follow or the field silently shows a stale query while the results
  // already changed. Re-runs only when the URL's query actually differs.
  useEffect(() => {
    setQuery(current.search ?? "");
  }, [current.search]);

  const inStockOnly = current.instock !== "0";
  const tier = current.price && PRICE_TIERS[current.price] ? current.price : undefined;

  function navigate(patch: Partial<ShopState>) {
    const merged = { ...current, ...patch };
    // On category pages the category IS the route — removing it means "all products".
    if (!merged.category && basePath.startsWith("/category/")) {
      router.push(allProductsHref ?? "/shop");
      return;
    }
    const params = new URLSearchParams();
    if (merged.search) params.set("search", merged.search);
    if (merged.category) params.set("category", merged.category);
    if (merged.sort && merged.sort !== "relevance") params.set("sort", merged.sort);
    if (merged.price && PRICE_TIERS[merged.price]) params.set("price", merged.price);
    if (merged.instock === "0") params.set("instock", "0");
    router.push(params.size > 0 ? `${basePath}?${params.toString()}` : basePath);
  }

  function clearAll() {
    setQuery("");
    router.push(basePath.startsWith("/category/") ? basePath : "/shop");
  }

  // Close the mobile sheet on Escape.
  useEffect(() => {
    if (!sheetOpen) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setSheetOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sheetOpen]);

  // The mobile bottom nav's Search tile deep-links to /shop#shopSearch — pull the
  // field into view and hand it focus so the tap lands in a ready-to-type input.
  useEffect(() => {
    if (window.location.hash !== "#shopSearch") return;
    const el = document.getElementById("shopSearch");
    if (!el) return;
    el.scrollIntoView({ block: "center" });
    el.focus({ preventScroll: true });
  }, []);

  const chips: { key: string; label: string; remove: () => void }[] = [];
  if (current.search) chips.push({ key: "search", label: `Search: “${current.search}”`, remove: () => navigate({ search: undefined }) });
  if (current.category) chips.push({ key: "category", label: categoryName ?? "Category", remove: () => navigate({ category: undefined }) });
  if (tier) chips.push({ key: "price", label: PRICE_TIERS[tier].chip, remove: () => navigate({ price: undefined }) });
  if (current.sort && current.sort !== "relevance")
    chips.push({ key: "sort", label: SORTS.find((s) => s.value === current.sort)?.label ?? "Sorted", remove: () => navigate({ sort: undefined }) });
  if (!inStockOnly) chips.push({ key: "stock", label: "Out of stock included", remove: () => navigate({ instock: undefined }) });

  const filterFields = (
    <>
      {/* In-stock toggle */}
      <label className="flex cursor-pointer select-none items-center gap-2 rounded-sm bg-surface-container-lowest px-3 py-2 shadow-sm">
        <input
          type="checkbox"
          checked={inStockOnly}
          onChange={(e) => navigate({ instock: e.target.checked ? undefined : "0" })}
          className="h-4 w-4 cursor-pointer accent-[var(--color-primary)]"
          aria-label="In stock only"
        />
        <span className="text-label-md font-medium text-on-surface">In Stock Only</span>
      </label>

      {/* Price tier */}
      <div className="relative">
        <span className="sr-only">Price range</span>
        <select
          value={tier ?? "all"}
          onChange={(e) => navigate({ price: e.target.value === "all" ? undefined : e.target.value })}
          className="appearance-none rounded-sm bg-surface-container-lowest py-2 pl-3 pr-8 text-label-md text-on-surface shadow-sm focus:outline-none"
        >
          <option value="all">Price: All Tiers</option>
          {Object.entries(PRICE_TIERS).map(([value, t]) => (
            <option key={value} value={value}>{t.label}</option>
          ))}
        </select>
        <IconChevronDown size={18} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
      </div>

      {/* Sort */}
      <div className="relative">
        <span className="sr-only">Sort products</span>
        <select
          value={current.sort ?? "relevance"}
          onChange={(e) => navigate({ sort: e.target.value === "relevance" ? undefined : e.target.value })}
          className="appearance-none rounded-sm bg-surface-container-lowest py-2 pl-3 pr-8 text-label-md text-on-surface shadow-sm focus:outline-none"
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>{s.label}</option>
          ))}
        </select>
        <IconChevronDown size={18} className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
      </div>
    </>
  );

  return (
    <div className="mx-auto max-w-7xl px-margin-mobile lg:px-margin">
      <div className="flex flex-col items-stretch justify-between gap-space-md lg:flex-row lg:items-center">
        {/* Search + mobile filter trigger */}
        <div className="flex max-w-xl flex-1 items-center gap-space-sm">
          <form
            className="relative flex-1"
            role="search"
            onSubmit={(e) => {
              e.preventDefault();
              // Same normalization the header search applies (trim + collapse runs)
              // so both entry points produce identical URLs for identical input.
              const q = query.trim().replace(/\s+/g, " ");
              navigate({ search: q || undefined });
            }}
          >
            <IconSearch size={20} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-on-surface-variant" />
            <input
              id="shopSearch"
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search honey, kesar, dry fruits..."
              aria-label="Search the catalogue"
              className="w-full rounded-lg bg-surface-container-low py-2.5 pl-10 pr-4 text-body-sm text-on-surface shadow-sm transition-all placeholder:text-on-surface-variant focus:bg-surface-container focus:outline-none"
            />
          </form>
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="flex shrink-0 items-center gap-1.5 rounded-lg bg-surface-container-high px-3.5 py-2.5 text-label-md text-on-surface shadow-sm lg:hidden"
          >
            <IconSlidersHorizontal size={18} />
            <span>Filters</span>
          </button>
        </div>

        {/* Desktop controls */}
        <div className="hidden flex-wrap items-center justify-end gap-space-sm lg:flex">{filterFields}</div>
      </div>

      {/* Active filters + counter */}
      <div className="mt-space-sm flex flex-wrap items-center justify-between gap-space-sm border-t border-outline-variant/50 pt-space-sm">
        <div className="flex flex-wrap items-center gap-space-xs text-label-sm text-on-surface-variant">
          <span className="font-medium">Active Filters:</span>
          {chips.length === 0 ? (
            <span className="text-on-surface-variant">None</span>
          ) : (
            chips.map((chip) => (
              <button
                key={chip.key}
                type="button"
                onClick={chip.remove}
                className="inline-flex items-center gap-1 rounded-full bg-surface-container-high px-2 py-1 font-semibold text-on-surface transition-colors hover:bg-surface-container-highest"
              >
                {chip.label}
                <IconX size={13} />
                <span className="sr-only">Remove filter</span>
              </button>
            ))
          )}
          {chips.length > 0 && (
            <button type="button" onClick={clearAll} className="ml-1 font-bold text-primary hover:underline">
              Clear All
            </button>
          )}
        </div>
        <div className="text-label-sm font-medium tracking-wide text-on-surface-variant">
          Showing <span className="font-bold text-primary">{showing ?? "…"}</span> of {allCount} {countNoun}
        </div>
      </div>

      {/* Mobile filter sheet */}
      {sheetOpen && (
        <div className="fixed inset-0 z-50 lg:hidden" role="dialog" aria-modal="true" aria-label="Shop filters">
          <div className="absolute inset-0 bg-inverse-surface/40 backdrop-blur-sm" onClick={() => setSheetOpen(false)} aria-hidden />
          <div className="absolute inset-x-0 bottom-0 rounded-t-2xl bg-surface-container-lowest p-space-lg pb-space-xl shadow-2xl">
            <div className="mb-space-md flex items-center justify-between">
              <h2 className="text-headline-sm text-on-surface">Refine the Pantry</h2>
              <button
                type="button"
                onClick={() => setSheetOpen(false)}
                aria-label="Close filters"
                className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant"
              >
                <IconX size={18} />
              </button>
            </div>
            <div className="flex flex-col items-stretch gap-space-md">{filterFields}</div>
            <button
              type="button"
              onClick={() => setSheetOpen(false)}
              className="btn-primary mt-space-lg w-full py-3 text-label-lg"
            >
              Show Results
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
