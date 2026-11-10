import type { Metadata } from "next";
import Link from "next/link";
import { getCategoryOverview, getProducts } from "@/lib/api";
import { ProductGrid, ProductCardSkeleton } from "@/components/product-card";
import { ShopControls } from "@/components/shop-filters";
import { PRICE_TIERS } from "@/lib/shop-pricing";
import {
  IconBadgeCheck,
  IconChevronLeft,
  IconChevronRight,
  IconDroplet,
  IconFlower2,
  IconGift,
  IconInfinity,
  IconLeaf,
  IconRecycle,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
  IconSprout,
} from "@/components/icons";

export const metadata: Metadata = {
  title: "Shop all — honey, dry fruits & kesar",
  description: "Browse the full Annaadhya catalogue: floral honeys, everyday dry fruits and small-batch saffron.",
};

interface ShopProps {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

const PAGE_SIZE = 12;

/** Category pill glyphs (self-hosted icon set; catalogue truth supplies names + counts). */
const CATEGORY_ICONS: Record<string, (p: { size?: number; className?: string }) => React.ReactNode> = {
  honey: IconDroplet,
  kesar: IconFlower2,
  "dry-fruits": IconSprout,
  "gift-boxes": IconGift,
};

/** Editorial purity ribbon — approved design copy, token-mapped surfaces. */
const ASSURANCES = [
  {
    icon: IconBadgeCheck,
    tone: "bg-secondary-container text-on-secondary-container",
    title: "Single-Estate Origins",
    copy: "Traceable directly to Pampore saffron beds and Shivalik hives.",
  },
  {
    icon: IconShieldCheck,
    tone: "bg-surface-container-high text-primary",
    title: "Lab-Tested Purity",
    copy: "100% free of sugar syrups, synthetic pigments, and additives.",
  },
  {
    icon: IconRecycle,
    tone: "bg-tertiary-fixed text-on-tertiary-fixed",
    title: "Plastic-Free Packaging",
    copy: "Sealed in food-grade glass jars and reusable brass-finish tins.",
  },
] as const;

export default async function ShopPage({ searchParams }: ShopProps) {
  const sp = await searchParams;
  const pick = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;

  const search = pick("search")?.slice(0, 120) || undefined;
  const category = pick("category") || undefined;
  const sort = pick("sort") ?? "relevance";
  const tier = pick("price") && PRICE_TIERS[pick("price")!] ? pick("price")! : undefined;
  const includeUnavailable = pick("instock") === "0";
  const page = Math.max(1, Number(pick("page") ?? "1") || 1);

  const params = new URLSearchParams();
  if (search) params.set("search", search);
  if (category) params.set("category", category);
  if (sort) params.set("sort", sort);
  if (tier) {
    const t = PRICE_TIERS[tier];
    if (t.minPaise !== undefined) params.set("minPricePaise", String(t.minPaise));
    if (t.maxPaise !== undefined) params.set("maxPricePaise", String(t.maxPaise));
  } else {
    // Legacy deep-links (min/max in rupees) keep working alongside tier presets.
    const min = pick("min");
    const max = pick("max");
    if (min) params.set("minPricePaise", String(Math.round(Number(min) * 100)));
    if (max) params.set("maxPricePaise", String(Math.round(Number(max) * 100)));
  }
  if (includeUnavailable) params.set("includeUnavailable", "true");
  params.set("page", String(page));
  params.set("pageSize", String(PAGE_SIZE));

  // Two parallel roundtrips total: the filtered page + a single-pass overview that supplies
  // categories, per-category pill counts and the all-products count (previously N+2 requests).
  const [result, overview] = await Promise.all([getProducts(params), getCategoryOverview()]);

  const categories = (overview?.categories ?? []).filter((c) => c.isReady);
  const allCount = overview?.totalProducts ?? 0;
  const countsBySlug = new Map(categories.map((c) => [c.slug, c.productCount]));
  const categoryName = categories.find((c) => c.slug === category)?.name;

  /** Pill hrefs swap the category while preserving the rest of the active filter set. */
  function pillHref(slug?: string): string {
    const p = new URLSearchParams();
    if (search) p.set("search", search);
    if (slug) p.set("category", slug);
    if (sort !== "relevance") p.set("sort", sort);
    if (tier) p.set("price", tier);
    if (includeUnavailable) p.set("instock", "0");
    return p.size > 0 ? `/shop?${p.toString()}` : "/shop";
  }

  function pageHref(p: number): string {
    const next = new URLSearchParams(params);
    next.set("page", String(p));
    return `/shop?${next.toString()}`;
  }

  const total = result?.total ?? 0;
  const totalPages = result?.totalPages ?? 1;
  const progress = totalPages > 0 ? Math.min(100, Math.round((page / totalPages) * 100)) : 0;
  const windowStart = Math.max(1, Math.min(page - 2, totalPages - 4));
  const windowPages: number[] = [];
  for (let p = windowStart; p <= Math.min(totalPages, windowStart + 4); p++) windowPages.push(p);

  return (
    <div className="flex flex-col w-full">
      {/* ---------------- Breadcrumb & editorial intro ---------------- */}
      <section className="w-full bg-surface-container-low pb-space-xl pt-space-lg">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-margin-mobile text-center lg:px-margin">
          <nav aria-label="Breadcrumb" className="mb-space-md flex items-center gap-space-xs text-label-md text-on-surface-variant">
            <Link href="/" className="transition-colors hover:text-primary">Home</Link>
            <span className="text-xs text-on-tertiary-container" aria-hidden>/</span>
            <span className="font-semibold text-primary" aria-current="page">Shop All</span>
          </nav>

          <div className="mb-space-sm inline-flex items-center gap-2">
            <span className="h-px w-8 bg-on-tertiary-container" aria-hidden />
            <span className="text-label-sm font-bold uppercase tracking-[0.24em] text-on-tertiary-container">
              The Annaadhya Collection
            </span>
            <span className="h-px w-8 bg-on-tertiary-container" aria-hidden />
          </div>

          <h1 className="font-display max-w-2xl text-balance text-headline-lg-mobile tracking-tight text-on-surface lg:text-headline-lg">
            Goodness for Every Occasion.
          </h1>
          <p className="mt-space-sm max-w-xl text-body-md leading-relaxed text-on-surface-variant">
            Explore thoughtfully selected honey, fragrant kesar, wholesome dry fruits, and curated pantry
            favourites for everyday rituals and meaningful celebrations.
          </p>

          <div className="mt-space-md flex w-48 items-center justify-center gap-space-sm text-on-tertiary-container" aria-hidden>
            <span className="h-px flex-1 bg-surface-container-highest" />
            <IconLeaf size={18} />
            <span className="h-px flex-1 bg-surface-container-highest" />
          </div>

          {/* Category filter pills — real catalogue names + real counts */}
          <div className="mt-space-lg flex max-w-3xl flex-wrap items-center justify-center gap-space-xs sm:gap-space-sm">
            <Link
              href={pillHref()}
              aria-current={!category ? "page" : undefined}
              className={`inline-flex items-center gap-1.5 rounded-full px-space-md py-2 text-label-md shadow-sm transition-all ${
                !category
                  ? "bg-primary font-semibold text-on-primary"
                  : "bg-surface font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
              }`}
            >
              <IconInfinity size={16} />
              <span>All Products</span>
              <span className={`ml-0.5 text-[0.6875rem] font-normal ${!category ? "text-primary-fixed-dim" : "text-outline"}`}>
                ({allCount})
              </span>
            </Link>
            {categories.map((c) => {
              const active = category === c.slug;
              const Icon = CATEGORY_ICONS[c.slug] ?? IconSparkles;
              return (
                <Link
                  key={c.slug}
                  href={pillHref(c.slug)}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex items-center gap-1.5 rounded-full px-space-md py-2 text-label-md shadow-sm transition-all ${
                    active
                      ? "bg-primary font-semibold text-on-primary"
                      : "bg-surface font-medium text-on-surface-variant hover:bg-surface-container hover:text-on-surface"
                  }`}
                >
                  <Icon size={16} />
                  <span>{c.name}</span>
                  <span className={`ml-0.5 text-[0.6875rem] font-normal ${active ? "text-primary-fixed-dim" : "text-outline"}`}>
                    ({countsBySlug.get(c.slug) ?? 0})
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- Controls & catalogue toolbar ---------------- */}
      <section className="w-full bg-surface py-space-md shadow-[0_2px_12px_rgba(39,24,16,0.03)]">
        <ShopControls
          current={{ search, category, sort, price: tier, instock: includeUnavailable ? "0" : undefined }}
          showing={result ? total : null}
          allCount={allCount}
          categoryName={categoryName}
        />
      </section>

      {/* ---------------- Catalogue grid ---------------- */}
      <section className="w-full bg-background py-space-xl">
        <div className="mx-auto max-w-7xl px-margin-mobile lg:px-margin">
          {!result ? (
            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4 lg:gap-space-lg">
              {[...Array(8)].map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : result.items.length === 0 ? (
            <div className="card-soft mx-auto flex max-w-2xl flex-col items-center p-space-xl text-center">
              <div className="mb-space-md flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-primary">
                <IconSearch size={26} />
              </div>
              <p className="font-display text-xl font-semibold text-on-surface">Nothing matched those filters</p>
              <p className="mt-2 max-w-md text-body-sm text-on-surface-variant">
                Try a broader search, remove the price tier, or browse a category — our catalogue is small and
                curated, so a little browsing goes a long way.
              </p>
              <div className="mt-space-lg flex flex-wrap justify-center gap-space-sm">
                <Link href="/shop" className="btn-primary px-6 py-2.5 text-label-lg">Clear all filters</Link>
                {categories.map((c) => (
                  <Link key={c.slug} href={`/category/${c.slug}`} className="btn-outline px-5 py-2.5 text-label-lg">
                    {c.name}
                  </Link>
                ))}
              </div>
            </div>
          ) : (
            <ProductGrid products={result.items} />
          )}
        </div>
      </section>

      {/* ---------------- Editorial purity reassurance ribbon ---------------- */}
      <section className="w-full bg-surface-container py-space-lg shadow-inner">
        <div className="mx-auto max-w-7xl px-margin-mobile lg:px-margin">
          <div className="grid grid-cols-1 items-center gap-space-lg md:grid-cols-3">
            {ASSURANCES.map((a) => (
              <div key={a.title} className="flex items-center gap-space-md rounded-lg bg-surface/60 p-space-sm">
                <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-full shadow-sm ${a.tone}`}>
                  <a.icon size={24} />
                </div>
                <div>
                  <h4 className="font-display text-[1.0625rem] font-semibold text-on-surface">{a.title}</h4>
                  <p className="text-[0.8125rem] leading-snug text-on-surface-variant">{a.copy}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- Pagination & curation help ---------------- */}
      <section className="w-full bg-background py-space-xl">
        <div className="mx-auto flex max-w-7xl flex-col items-center px-margin-mobile lg:px-margin">
          {result && totalPages > 1 && (
            <>
              <div className="mb-space-md h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-surface-container-high" aria-hidden>
                <div className="h-full rounded-full bg-primary transition-all duration-500" style={{ width: `${progress}%` }} />
              </div>
              <span className="mb-space-md text-label-sm text-on-surface-variant">
                Showing {total} of {allCount} items
              </span>
              <nav className="flex items-center gap-space-xs sm:gap-space-sm" aria-label="Catalogue pages">
                {page > 1 ? (
                  <Link
                    href={pageHref(page - 1)}
                    aria-label="Previous page"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant transition-colors hover:bg-surface-container-high"
                  >
                    <IconChevronLeft size={18} />
                  </Link>
                ) : (
                  <span
                    aria-disabled
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-low text-on-surface-variant opacity-40"
                  >
                    <IconChevronLeft size={18} />
                  </span>
                )}
                {windowPages.map((p) => (
                  <Link
                    key={p}
                    href={pageHref(p)}
                    aria-current={p === page ? "page" : undefined}
                    className={`flex h-9 w-9 items-center justify-center rounded-lg text-label-md transition-colors ${
                      p === page
                        ? "bg-primary font-bold text-on-primary shadow-sm"
                        : "bg-surface-container-lowest font-medium text-on-surface shadow-sm hover:bg-surface-container-high"
                    }`}
                  >
                    {p}
                  </Link>
                ))}
                {page < totalPages ? (
                  <Link
                    href={pageHref(page + 1)}
                    aria-label="Next page"
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-lowest text-on-surface shadow-sm transition-colors hover:bg-surface-container-high"
                  >
                    <IconChevronRight size={18} />
                  </Link>
                ) : (
                  <span
                    aria-disabled
                    className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-container-lowest text-on-surface opacity-40"
                  >
                    <IconChevronRight size={18} />
                  </span>
                )}
              </nav>
            </>
          )}

          {/* Quick curation help note */}
          <div className="mt-space-xl inline-flex items-center gap-space-sm rounded-full bg-surface-container-low px-space-md py-space-sm text-on-surface shadow-sm">
            <IconGift size={18} className="text-primary" />
            <span className="text-body-sm">Looking for custom festival or wedding hampers?</span>
            <Link
              href="/contact"
              className="ml-1 text-label-sm font-bold uppercase tracking-wider text-primary hover:underline"
            >
              Inquire for Gifting →
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
