import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryOverview, getProducts } from "@/lib/api";
import { editorialFor } from "@/lib/category-editorial";
import { PRICE_TIERS } from "@/lib/shop-pricing";
import { ProductGrid, ProductCardSkeleton } from "@/components/product-card";
import { ShopControls } from "@/components/shop-filters";
import {
  IconDroplet,
  IconFlower2,
  IconGift,
  IconInfinity,
  IconLeaf,
  IconSearch,
  IconShieldCheck,
  IconSparkles,
  IconSprout,
} from "@/components/icons";

export const revalidate = 60;

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}

/** Same glyph map as the shop page — one visual language across the storefront. */
const CATEGORY_ICONS: Record<string, (p: { size?: number; className?: string }) => React.ReactNode> = {
  honey: IconDroplet,
  kesar: IconFlower2,
  "dry-fruits": IconSprout,
  "gift-boxes": IconGift,
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const overview = await getCategoryOverview();
  const category = overview?.categories.find((c) => c.slug === slug);
  if (!category) return { title: "Category" };
  const editorial = editorialFor(slug, category);
  return {
    title: `${editorial.headline.replace(/\.$/, "")} — ${category.name} | Annaadhya Products`,
    description: category.description.slice(0, 180),
    openGraph: {
      title: `${category.name} | Annaadhya Products`,
      description: category.tagline,
      images: [{ url: editorial.heroImage }],
    },
  };
}

export default async function CategoryPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const sp = await searchParams;
  const pick = (k: string) => (Array.isArray(sp[k]) ? sp[k]?.[0] : sp[k]) as string | undefined;

  const search = pick("search")?.slice(0, 120) || undefined;
  const sort = pick("sort") ?? "relevance";
  const tier = pick("price") && PRICE_TIERS[pick("price")!] ? pick("price")! : undefined;
  const includeUnavailable = pick("instock") === "0";

  const productParams = new URLSearchParams({ category: slug, sort, pageSize: "24" });
  if (search) productParams.set("search", search);
  if (tier) {
    const t = PRICE_TIERS[tier];
    if (t.minPaise !== undefined) productParams.set("minPricePaise", String(t.minPaise));
    if (t.maxPaise !== undefined) productParams.set("maxPricePaise", String(t.maxPaise));
  }
  if (includeUnavailable) productParams.set("includeUnavailable", "true");

  // Two parallel roundtrips, same shape as /shop: the filtered category page + the
  // single-pass overview that feeds the switcher pills with real counts.
  const [result, overview] = await Promise.all([getProducts(productParams), getCategoryOverview()]);
  const category = overview?.categories.find((c) => c.slug === slug);
  if (!category) notFound();

  const editorial = editorialFor(slug, category);
  const basePath = `/category/${slug}`;
  const total = result?.total ?? 0;
  const allCount = overview?.totalProducts ?? 0;
  const categories = (overview?.categories ?? []).filter((c) => c.isReady);
  const countBySlug = new Map(categories.map((c) => [c.slug, c.productCount]));

  // Not-ready categories are never indexed — an honest restock notice, styled to the template.
  if (!category.isReady) {
    return (
      <div className="mx-auto flex min-h-[50vh] max-w-2xl flex-col items-center px-margin-mobile py-space-xl text-center lg:px-margin">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-primary">
          <IconGift size={26} />
        </div>
        <h1 className="font-display mt-space-md text-headline-lg-mobile text-on-surface lg:text-headline-lg">
          {category.name}
        </h1>
        <p className="mt-space-sm max-w-md text-body-md leading-relaxed text-on-surface-variant">
          {category.description}
        </p>
        <Link href="/shop" className="btn-primary mt-space-lg px-6 py-2.5 text-label-lg">
          Browse available products
        </Link>
      </div>
    );
  }

  return (
    <div className="flex w-full flex-col">
      {/* ---------------- Breadcrumb & collection context ---------------- */}
      <section className="w-full bg-surface-container-low px-margin-mobile py-space-xs lg:px-margin">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-space-xs">
          <nav
            aria-label="Breadcrumb"
            className="flex items-center gap-space-xs text-label-sm uppercase tracking-wider text-on-surface-variant"
          >
            <Link href="/" className="transition-colors hover:text-primary">
              Home
            </Link>
            <span className="select-none text-on-tertiary-container" aria-hidden>
              /
            </span>
            <Link href="/shop" className="transition-colors hover:text-primary">
              Shop All
            </Link>
            <span className="select-none text-on-tertiary-container" aria-hidden>
              /
            </span>
            <span className="font-bold text-primary" aria-current="page">
              {category.name}
            </span>
          </nav>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container px-2.5 py-0.5 text-label-sm font-semibold text-primary">
            <span className="h-1.5 w-1.5 rounded-full bg-secondary" aria-hidden />
            {editorial.batchNote}
          </span>
        </div>
      </section>

      {/* ---------------- Category hero: split editorial layout ---------------- */}
      <section className="w-full bg-surface px-margin-mobile py-space-xl lg:px-margin">
        <div className="mx-auto max-w-7xl rounded-xl bg-surface-container-low p-space-lg shadow-sm lg:p-space-xl">
          <div className="grid grid-cols-1 items-center gap-space-xl lg:grid-cols-12">
            {/* Left editorial narrative */}
            <div className="flex flex-col items-start gap-space-md lg:col-span-7">
              <span className="inline-flex items-center gap-2 rounded-full bg-surface-container-highest px-3 py-1 text-label-sm font-bold uppercase tracking-widest text-primary-container">
                <IconLeaf size={15} />
                {editorial.eyebrow}
              </span>
              <div className="space-y-space-xs">
                <h1 className="font-display text-headline-lg-mobile font-bold leading-tight tracking-tight text-on-surface lg:text-headline-lg">
                  {editorial.headline}
                </h1>
                <p className="max-w-2xl text-body-lg leading-relaxed text-on-surface-variant">
                  {editorial.intro}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-space-xs pt-space-xs">
                {editorial.badges.map((b) => (
                  <span
                    key={b.label}
                    className="inline-flex items-center gap-1.5 rounded-full bg-surface px-3 py-1.5 text-label-sm font-semibold text-secondary shadow-sm"
                  >
                    <b.icon size={16} />
                    {b.label}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-space-sm pt-space-xs text-label-sm text-on-surface-variant">
                <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" aria-hidden />
                <span>
                  <strong className="font-semibold text-on-surface">{category.name}</strong> •{" "}
                  {result ? total : "…"} products in this collection
                </span>
              </div>
            </div>

            {/* Right visual showcase — heritage arch frame */}
            <div className="relative flex w-full justify-center lg:col-span-5">
              <div className="relative w-full max-w-md">
                <div className="group relative h-80 w-full overflow-hidden rounded-b-xl rounded-t-[100px] bg-surface-container-high shadow-md sm:h-96">
                  <Image
                    src={editorial.heroImage}
                    alt={editorial.heroAlt}
                    fill
                    priority
                    sizes="(min-width: 1024px) 448px, (min-width: 640px) 448px, 100vw"
                    className="object-cover transition-transform duration-700 group-hover:scale-105"
                  />
                  <div
                    className="absolute inset-0 bg-gradient-to-t from-primary/70 via-transparent to-transparent opacity-80"
                    aria-hidden
                  />
                  {/* Inset provenance tag */}
                  <div className="absolute inset-x-4 bottom-4 flex items-center justify-between gap-space-sm rounded-lg bg-surface/90 p-3 shadow-sm backdrop-blur-md">
                    <div className="flex items-center gap-2">
                      <IconSparkles size={18} className="shrink-0 text-primary" />
                      <div>
                        <span className="block text-label-sm font-bold uppercase tracking-wider text-primary">
                          {editorial.heroTag.title}
                        </span>
                        <span className="block text-[0.625rem] text-on-surface-variant">
                          {editorial.heroTag.sub}
                        </span>
                      </div>
                    </div>
                    <span className="shrink-0 rounded bg-primary-fixed px-2 py-0.5 text-[0.625rem] font-bold text-on-primary-fixed">
                      {editorial.heroTag.chip}
                    </span>
                  </div>
                </div>
                {/* Floating quality stamp */}
                <div
                  className="absolute -right-4 -top-4 flex h-16 w-16 rotate-6 flex-col items-center justify-center rounded-full bg-tertiary-fixed text-on-tertiary-fixed shadow-lg"
                  aria-hidden
                >
                  <IconShieldCheck size={18} />
                  <span className="mt-0.5 text-[0.5rem] font-bold uppercase leading-none tracking-tight">
                    {editorial.stamp}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Cross-category switcher ---------------- */}
      <section className="w-full bg-surface px-margin-mobile pb-space-lg lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <span className="text-label-sm font-bold uppercase tracking-widest text-on-surface-variant">
            Discover Curated Pantries:
          </span>
          <div className="mt-space-xs flex flex-wrap items-center gap-space-xs pb-space-xs">
            <Link
              href="/shop"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container px-4 py-2 text-label-md text-on-surface shadow-sm transition-colors hover:bg-surface-container-high"
            >
              <IconInfinity size={16} />
              All Products
              <span className="ml-1 text-[0.6875rem] font-normal text-outline">({allCount})</span>
            </Link>
            {categories.map((c) => {
              const active = c.slug === slug;
              const Icon = CATEGORY_ICONS[c.slug] ?? IconSparkles;
              return (
                <Link
                  key={c.slug}
                  href={`/category/${c.slug}`}
                  aria-current={active ? "page" : undefined}
                  className={`inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-label-md shadow-sm transition-colors ${
                    active
                      ? "bg-primary-container font-bold text-on-primary"
                      : "bg-surface-container text-on-surface hover:bg-surface-container-high"
                  }`}
                >
                  <Icon size={16} />
                  {c.name}
                  <span
                    className={`ml-1 rounded-full px-1.5 py-0.5 text-[0.625rem] ${
                      active ? "bg-primary text-on-primary" : "font-normal text-outline"
                    }`}
                  >
                    {countBySlug.get(c.slug) ?? 0}
                  </span>
                </Link>
              );
            })}
          </div>
        </div>
      </section>

      {/* ---------------- Catalogue controls toolbar ---------------- */}
      <section className="w-full bg-surface px-margin-mobile pb-space-md lg:px-margin">
        <ShopControls
          current={{
            search,
            category: slug,
            sort,
            price: tier,
            instock: includeUnavailable ? "0" : undefined,
          }}
          showing={result ? total : null}
          allCount={countBySlug.get(slug) ?? 0}
          categoryName={category.name}
          basePath={basePath}
          countNoun={editorial.countNoun}
          allProductsHref="/shop"
        />
      </section>

      {/* ---------------- Product grid ---------------- */}
      <section className="w-full bg-surface px-margin-mobile pb-space-xl lg:px-margin">
        <div className="mx-auto max-w-7xl">
          {!result ? (
            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-3 lg:gap-space-lg">
              {[...Array(6)].map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          ) : result.items.length === 0 ? (
            <div className="card-soft mx-auto flex max-w-2xl flex-col items-center p-space-xl text-center">
              <div className="mb-space-md flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-primary">
                <IconSearch size={26} />
              </div>
              <p className="font-display text-xl font-semibold text-on-surface">
                Nothing in this collection matched
              </p>
              <p className="mt-2 max-w-md text-body-sm text-on-surface-variant">{editorial.emptyNote}</p>
              <div className="mt-space-lg flex flex-wrap justify-center gap-space-sm">
                <Link href={basePath} className="btn-primary px-6 py-2.5 text-label-lg">
                  Clear filters
                </Link>
                <Link href="/shop" className="btn-outline px-5 py-2.5 text-label-lg">
                  Browse everything
                </Link>
              </div>
            </div>
          ) : (
            <ProductGrid products={result.items} columns={3} />
          )}
        </div>
      </section>

      {/* ---------------- Editorial: rituals of savoring ---------------- */}
      <section className="w-full bg-surface-container-low px-margin-mobile py-space-xl lg:px-margin">
        <div className="mx-auto max-w-7xl space-y-space-lg">
          <div className="mx-auto max-w-2xl space-y-space-xs text-center">
            <span className="text-label-sm font-bold uppercase tracking-widest text-primary">
              Heritage Knowledge • Living Traditions
            </span>
            <h2 className="font-display text-headline-lg-mobile font-bold text-on-surface lg:text-headline-lg">
              {editorial.ritualsTitle}
            </h2>
            <p className="text-body-md leading-relaxed text-on-surface-variant">{editorial.ritualsIntro}</p>
          </div>

          <div className="grid grid-cols-1 gap-space-md md:grid-cols-3">
            {editorial.rituals.map((r) => (
              <div
                key={r.title}
                className="flex flex-col justify-between space-y-space-xs rounded-xl bg-surface-container-lowest p-space-lg shadow-sm"
              >
                <div className="space-y-space-xs">
                  <div
                    className={`flex h-10 w-10 items-center justify-center rounded-full ${r.iconTone}`}
                    aria-hidden
                  >
                    <r.icon size={22} />
                  </div>
                  <h3 className="pt-space-xs text-headline-sm font-semibold text-on-surface">{r.title}</h3>
                  <p className="text-body-sm leading-relaxed text-on-surface-variant">{r.body}</p>
                </div>
                <span className="mt-4 block text-[0.6875rem] font-bold uppercase tracking-wider text-secondary">
                  {r.footer}
                </span>
              </div>
            ))}
          </div>

          <div className="py-space-sm text-center">
            <blockquote className="mx-auto max-w-xl font-display text-headline-sm italic text-primary">
              “{editorial.quote.text}”
            </blockquote>
            <span className="mt-1 block text-label-sm font-semibold uppercase tracking-widest text-on-surface-variant">
              — {editorial.quote.source}
            </span>
          </div>
        </div>
      </section>

      {/* ---------------- End of collection & gifting sign-off ---------------- */}
      <section className="w-full bg-surface px-margin-mobile pb-space-xl pt-space-md lg:px-margin">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-center gap-space-md py-space-lg text-center">
          <div className="space-y-1">
            <p className="text-label-sm font-bold uppercase tracking-widest text-on-surface-variant">
              End of Collection
            </p>
            <p className="font-display text-headline-sm text-on-surface">
              Showing all {total} {editorial.countNoun} in this collection
            </p>
          </div>
          <div className="flex w-full max-w-2xl flex-col items-center justify-between gap-space-sm rounded-xl bg-surface-container-high p-space-md shadow-sm sm:flex-row">
            <div className="flex items-center gap-space-sm text-left">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                <IconGift size={20} />
              </div>
              <div>
                <h4 className="text-[1rem] font-bold text-on-surface">{editorial.gifting.title}</h4>
                <p className="text-[0.8125rem] text-on-surface-variant">{editorial.gifting.body}</p>
              </div>
            </div>
            <Link
              href={editorial.gifting.href}
              className="btn-primary shrink-0 px-4 py-2 text-label-sm font-bold uppercase tracking-wider"
            >
              {editorial.gifting.cta}
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
