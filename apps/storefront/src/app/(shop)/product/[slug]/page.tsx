import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getCategoryOverview, getProduct, getPublicSettings, getRelatedProducts } from "@/lib/api";
import { productEditorialFor } from "@/lib/product-editorial";
import { editorialFor } from "@/lib/category-editorial";
import { availableQty, formatINR } from "@/lib/format";
import { looksLikeHtml, sanitizeRichText, stripHtml } from "@annaadhya/utils/rich-text";
import { ProductGrid } from "@/components/product-card";
import { BuyPanel } from "@/components/buy-panel";
import { ProductGallery } from "@/components/product-gallery";
import { EditorialTabs } from "@/components/editorial-tabs";
import { StickyBuyBar } from "@/components/sticky-buy-bar";
import {
  IconArrowRight,
  IconBadgeCheck,
  IconShieldCheck,
} from "@/components/icons";

export const revalidate = 45;

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const product = await getProduct(slug);
  if (!product) return { title: "Product not found" };
  return {
    title: product.seo?.title ?? `${product.name} — ${product.subtitle}`,
    description: product.seo?.description ?? stripHtml(product.description).slice(0, 160),
    openGraph: {
      title: product.name,
      description: product.subtitle,
      images: product.images[0]?.url ? [{ url: product.images[0].url }] : undefined,
    },
    alternates: { canonical: `/product/${product.slug}` },
  };
}

export default async function ProductPage({ params }: Props) {
  const { slug } = await params;
  // One parallel fan-out: the product, its category context, same-shelf companions
  // and the public store settings (powers the honest free-shipping claims in the
  // buy panel — same server truth the cart progress card and checkout use).
  const [product, overview, related, settings] = await Promise.all([
    getProduct(slug),
    getCategoryOverview(),
    getRelatedProducts(slug),
    getPublicSettings(),
  ]);
  if (!product) notFound();

  const category = overview?.categories.find((c) => c.id === product.categoryId);
  const editorial = productEditorialFor(category?.slug);
  const categoryEditorial = editorialFor(category?.slug ?? "", {
    name: category?.name ?? "Annaadhya",
    tagline: category?.tagline ?? "",
    description: category?.description ?? "",
  });

  const variants = product.variants.filter((v) => v.status === "published");
  const cheapest = variants.length ? Math.min(...variants.map((v) => v.pricePaise)) : 0;
  // Purchasable = in stock, or the product opts out of stock limits / allows backorders.
  const openSale =
    product.trackInventory === false || product.backorderPolicy === "allow" || product.backorderPolicy === "notify";
  const purchasable = variants.length > 0 && (openSale || variants.some((v) => availableQty(v) > 0));

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: product.name,
    description: stripHtml(product.description),
    sku: product.sku,
    brand: { "@type": "Brand", name: "Annaadhya Products" },
    image: product.images.map((i) => i.url),
    // No aggregateRating/review markup anywhere — the catalogue carries no review data yet.
    ...(variants.length > 0 && {
      offers: {
        "@type": "AggregateOffer",
        priceCurrency: "INR",
        lowPrice: (cheapest / 100).toFixed(2),
        highPrice: (Math.max(...variants.map((v) => v.pricePaise)) / 100).toFixed(2),
        offerCount: variants.length,
        availability: purchasable ? "https://schema.org/InStock" : "https://schema.org/OutOfStock",
      },
    }),
  };

  const specs: { label: string; value: string }[] = [
    { label: "Type", value: product.typeLabel },
    ...(category ? [{ label: "Collection", value: category.name }] : []),
    ...(product.netQuantityLabel ? [{ label: "Net quantity", value: product.netQuantityLabel }] : []),
    ...(product.ingredients ? [{ label: "Ingredients", value: product.ingredients }] : []),
    ...(product.storageInstructions ? [{ label: "Storage", value: product.storageInstructions }] : []),
    ...(product.allergenInfo ? [{ label: "Allergens", value: product.allergenInfo }] : []),
    ...(product.manufacturerDetails ? [{ label: "Manufacturer", value: product.manufacturerDetails }] : []),
  ];

  const packRows = variants.map((v) => ({
    packLabel: v.packLabel,
    price: formatINR(v.pricePaise, false),
    stock: availableQty(v) > 0 ? "In stock" : "Out of stock",
  }));

  const breadcrumbCategory = category ? { name: category.name, href: `/category/${category.slug}` } : null;

  return (
    <div className="flex w-full flex-col">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />

      {/* ---------------- Breadcrumb & collection context strip ---------------- */}
      <section className="w-full bg-surface-container-low/70 px-margin-mobile py-space-sm lg:px-margin">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-space-xs">
          <nav
            aria-label="Breadcrumb"
            className="flex flex-wrap items-center gap-2 text-label-md text-on-surface-variant"
          >
            <Link href="/" className="transition-colors hover:text-primary">
              Home
            </Link>
            <span className="opacity-40" aria-hidden>
              /
            </span>
            {breadcrumbCategory ? (
              <>
                <Link href={breadcrumbCategory.href} className="transition-colors hover:text-primary">
                  {breadcrumbCategory.name}
                </Link>
                <span className="opacity-40" aria-hidden>
                  /
                </span>
              </>
            ) : (
              <>
                <Link href="/shop" className="transition-colors hover:text-primary">
                  Shop
                </Link>
                <span className="opacity-40" aria-hidden>
                  /
                </span>
              </>
            )}
            <span className="font-semibold text-primary" aria-current="page">
              {product.name}
            </span>
          </nav>
          <span className="inline-flex items-center gap-1.5 rounded-full bg-surface-container-high px-space-sm py-1 text-label-sm font-semibold uppercase tracking-wider text-on-surface">
            <span className="h-2 w-2 animate-pulse rounded-full bg-secondary" aria-hidden />
            {categoryEditorial.batchNote}
          </span>
        </div>
      </section>

      {/* ---------------- Product hero / buy interface ---------------- */}
      <section className="w-full bg-surface px-margin-mobile py-space-lg lg:px-margin lg:py-space-xl">
        <div className="mx-auto grid max-w-7xl grid-cols-1 items-start gap-space-xl lg:grid-cols-12">
          {/* Left: gallery + trust banner (7 cols in the approved design) */}
          <div className="flex flex-col gap-space-md lg:col-span-7">
            <ProductGallery images={product.images} name={product.name} typeLabel={product.typeLabel} />
            <div className="flex flex-wrap items-center justify-between gap-space-sm rounded-lg bg-surface-container-low p-space-md shadow-sm">
              <div className="flex items-center gap-space-sm">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary-container text-secondary">
                  <IconShieldCheck size={22} />
                </div>
                <div>
                  <p className="text-label-lg font-semibold text-on-surface">{editorial.purity.title}</p>
                  <p className="text-body-sm text-on-surface-variant">{editorial.purity.body}</p>
                </div>
              </div>
              <Link
                href={editorial.purity.ctaHref}
                className="flex items-center gap-1 text-label-sm font-bold uppercase tracking-wider text-primary hover:underline"
              >
                {editorial.purity.ctaLabel}
                <IconArrowRight size={15} />
              </Link>
            </div>
          </div>

          {/* Right: commercial details & variant picker (5 cols) */}
          <div className="lg:col-span-5">
            <BuyPanel product={product} shipping={settings?.shipping ?? null} />
          </div>
        </div>
      </section>

      {/* ---------------- Editorial: story / details / rituals ---------------- */}
      <section id="pantry-notes" className="w-full scroll-mt-28 bg-surface-container-low px-margin-mobile py-space-xl lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto mb-space-lg max-w-2xl text-center">
            <span className="text-label-sm font-bold uppercase tracking-widest text-secondary">
              {editorial.storyEyebrow}
            </span>
            <h2 className="mt-1 font-display text-headline-lg-mobile font-semibold text-primary lg:text-headline-lg">
              {editorial.storyHeading}
            </h2>
            <p className="mt-2 text-body-md text-on-surface-variant">{editorial.storyIntro}</p>
          </div>

          <EditorialTabs
            tabs={[
              { id: "story", label: "Pantry Story" },
              { id: "specs", label: "Details & Specifications" },
              { id: "rituals", label: "Rituals of Use" },
            ]}
            panels={[
              /* --- Panel 1: story + honest highlights + A+ visual (honey only) --- */
              <div
                key="story"
                className={`grid grid-cols-1 items-center gap-space-xl ${editorial.aplus ? "lg:grid-cols-12" : ""}`}
              >
                <div className={editorial.aplus ? "space-y-space-md lg:col-span-6" : "space-y-space-md"}>
                  <div className="space-y-space-xs">
                    <span className="text-label-sm font-bold uppercase tracking-wider text-secondary">
                      {category ? `The ${category.name} shelf` : "The Annaadhya shelf"}
                    </span>
                    <p className="text-body-md leading-relaxed text-on-surface-variant">
                      {category?.description ?? stripHtml(product.description)}
                    </p>
                  </div>
                  <div className="grid grid-cols-1 gap-space-sm pt-2 sm:grid-cols-3">
                    {editorial.storyHighlights.map((h) => (
                      <div key={h.label} className="rounded-lg bg-surface-container-lowest p-space-sm shadow-sm">
                        <span className="block font-display text-[1.375rem] font-bold leading-7 text-primary">
                          {h.label}
                        </span>
                        <span className="mt-1 block text-label-sm uppercase tracking-wide text-on-surface-variant">
                          {h.sub}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
                {editorial.aplus && (
                  <div className="relative lg:col-span-6">
                    <div className="relative w-full overflow-hidden rounded-xl shadow-md">
                      <div className="relative aspect-[4/3] w-full">
                        <Image
                          src={editorial.aplus.image}
                          alt={editorial.aplus.alt}
                          fill
                          sizes="(min-width: 1024px) 560px, 100vw"
                          className="object-cover"
                        />
                      </div>
                    </div>
                    <div className="absolute -bottom-6 -left-6 hidden max-w-xs items-center gap-space-sm rounded-xl bg-surface-container-lowest p-space-md shadow-lg sm:flex">
                      <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                        <IconBadgeCheck size={24} />
                      </div>
                      <div>
                        <p className="text-label-md font-bold text-primary">{editorial.aplus.captionTitle}</p>
                        <p className="text-[0.75rem] leading-4 text-on-surface-variant">
                          {editorial.aplus.captionBody}
                        </p>
                      </div>
                    </div>
                  </div>
                )}
              </div>,

              /* --- Panel 2: real product data only — nothing fabricated --- */
              <div key="specs" className="space-y-space-lg">
                <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
                  <h3 className="font-display text-headline-sm font-medium text-primary">About this product</h3>
                  {looksLikeHtml(product.description) ? (
                    // Stored descriptions are sanitised server-side on every write; re-sanitised here so
                    // even legacy/manual DB edits can never inject markup.
                    <div
                      className="rich-text mt-2 text-body-md leading-relaxed text-on-surface-variant"
                      dangerouslySetInnerHTML={{ __html: sanitizeRichText(product.description) }}
                    />
                  ) : (
                    <p className="mt-2 whitespace-pre-line text-body-md leading-relaxed text-on-surface-variant">
                      {product.description}
                    </p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-space-md md:grid-cols-2 lg:grid-cols-3">
                  {specs.map((s) => (
                    <div key={s.label} className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm">
                      <p className="text-label-md font-bold text-primary">{s.label}</p>
                      <p className="mt-1 text-body-md font-semibold text-on-surface">{s.value}</p>
                    </div>
                  ))}
                  <div className="rounded-xl bg-surface-container-lowest p-space-lg shadow-sm md:col-span-2 lg:col-span-3">
                    <p className="text-label-md font-bold text-primary">Pack sizes &amp; availability</p>
                    <table className="mt-2 w-full text-body-sm">
                      <thead>
                        <tr className="border-b border-outline-variant/60 text-left text-label-sm uppercase tracking-wide text-on-surface-variant">
                          <th className="py-2">Pack</th>
                          <th className="py-2">Price</th>
                          <th className="py-2">Availability</th>
                        </tr>
                      </thead>
                      <tbody>
                        {packRows.map((r) => (
                          <tr key={r.packLabel} className="border-b border-outline-variant/40">
                            <td className="py-2 font-semibold text-on-surface">{r.packLabel}</td>
                            <td className="py-2 text-on-surface text-tabular">{r.price}</td>
                            <td className="py-2 text-on-surface-variant">{r.stock}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>,

              /* --- Panel 3: usage rituals (single source of truth with the category pages) --- */
              <div key="rituals" className="grid grid-cols-1 gap-space-lg md:grid-cols-3">
                {categoryEditorial.rituals.map((r) => (
                  <div
                    key={r.title}
                    className="flex flex-col items-start rounded-xl bg-surface-container-lowest p-space-lg shadow-sm"
                  >
                    <div className={`flex h-10 w-10 items-center justify-center rounded-full ${r.iconTone}`} aria-hidden>
                      <r.icon size={22} />
                    </div>
                    <h4 className="mb-1 mt-space-sm font-display text-headline-sm font-medium text-primary">
                      {r.title}
                    </h4>
                    <p className="text-body-md leading-relaxed text-on-surface-variant">{r.body}</p>
                    <span className="mt-3 block text-[0.6875rem] font-bold uppercase tracking-wider text-secondary">
                      {r.footer}
                    </span>
                  </div>
                ))}
              </div>,
            ]}
          />
        </div>
      </section>

      {/* ---------------- Thoughtful pairings (real same-shelf products) ---------------- */}
      {related.length > 0 && (
        <section className="w-full bg-surface px-margin-mobile py-space-xl lg:px-margin">
          <div className="mx-auto max-w-7xl">
            <div className="mb-space-lg flex flex-col justify-between gap-space-sm md:flex-row md:items-end">
              <div>
                <span className="text-label-sm font-bold uppercase tracking-widest text-secondary">
                  Heirloom Combinations
                </span>
                <h2 className="mt-1 font-display text-headline-lg-mobile font-medium text-primary lg:text-headline-lg">
                  Thoughtful Pairings for Your Pantry
                </h2>
                <p className="mt-1 text-body-md text-on-surface-variant">
                  Curated from the same shelf — real catalogue companions for this jar.
                </p>
              </div>
              {category && (
                <Link
                  href={`/category/${category.slug}`}
                  className="flex items-center gap-1 text-label-lg font-bold text-primary hover:underline"
                >
                  Explore all {category.name.toLowerCase()}
                  <IconArrowRight size={17} />
                </Link>
              )}
            </div>
            <ProductGrid products={related} columns={4} />
          </div>
        </section>
      )}

      {/* ---------------- Reviews: honest empty state (no data exists yet) ---------------- */}
      <section id="reviews" className="w-full scroll-mt-28 bg-surface-container-low px-margin-mobile py-space-xl lg:px-margin">
        <div className="mx-auto max-w-7xl">
          <div className="mx-auto flex max-w-2xl flex-col items-center rounded-2xl bg-surface-container-lowest p-space-xl text-center shadow-sm">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-surface-container-high text-primary">
              <IconBadgeCheck size={26} />
            </div>
            <h2 className="mt-space-md font-display text-headline-sm font-semibold text-on-surface">
              Honest reviews, from real orders
            </h2>
            <p className="mt-2 text-body-md leading-relaxed text-on-surface-variant">{editorial.reviewsNote}</p>
            <Link
              href="/contact"
              className="btn-outline mt-space-lg inline-flex items-center gap-1.5 px-5 py-2.5 text-label-lg"
            >
              Questions about this product?
              <IconArrowRight size={16} />
            </Link>
          </div>
        </div>
      </section>

      {/* Spacer so the mobile sticky bar never covers the footer's last row */}
      <div aria-hidden className="h-16 bg-surface-container-low lg:hidden" />
      <StickyBuyBar product={product} />
    </div>
  );
}
