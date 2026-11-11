import Link from "next/link";
import Image from "next/image";
import { apiGetWithStatus, getBestsellers, getFeatured, getHomepageConfig, getProduct, getPublicSettings } from "@/lib/api";
import type { CategoryDoc } from "@/lib/types";
import { safeCategoryHref } from "@/lib/navigation-guard";
import { formatINR, minVariantPricePaise } from "@/lib/format";
import { ProductGrid, ProductCardSkeleton } from "@/components/product-card";
import { NewsletterForm } from "@/components/newsletter-form";
import {
  IconArrowRight,
  IconAward,
  IconCoffee,
  IconGift,
  IconLandmark,
  IconLeaf,
  IconPenLine,
  IconShieldCheck,
  IconSparkles,
  IconSprout,
  IconTruck,
} from "@/components/icons";

export const revalidate = 60;

/** Collection cards — links/slugs/names come from the live catalogue; approved design
 *  supplies the imagery, badges and editorial copy. A category missing from the API
 *  simply renders no card (no fabricated inventory). */
const COLLECTIONS = [
  {
    slug: "honey",
    image: "/images/collection-honey.webp",
    alt: "Golden wildflower honey dripping from a handcrafted wooden dipper into a glass jar",
    badge: "Single Origin",
    copy: "Golden sweetness for everyday moments and morning warm lemon infusions.",
    cta: "Shop Honey",
  },
  {
    slug: "kesar",
    image: "/images/collection-kesar.webp",
    alt: "Pure Kashmiri saffron threads in a hammered brass bowl with golden lighting",
    badge: "GI-Tagged Pampore",
    copy: "A little saffron, a lasting impression. Hand-culled deep scarlet Mongra threads.",
    cta: "Shop Kesar",
  },
  {
    slug: "dry-fruits",
    image: "/images/collection-dry-fruits.webp",
    alt: "Artisanal arrangement of almonds, cashews and pistachios in a rustic earthenware bowl",
    badge: "Sun-Cured Reserve",
    copy: "Thoughtful staples for your everyday pantry, whole, naturally plump and unsweetened.",
    cta: "Shop Dry Fruits",
  },
] as const;

const TRUST = [
  {
    icon: IconSprout,
    tone: "bg-secondary-container text-on-secondary-container",
    title: "Carefully Selected",
    copy: "Sourced from heirloom harvest regions across India with relentless care and integrity.",
  },
  {
    icon: IconLeaf,
    tone: "bg-surface-container-high text-primary-container",
    title: "Thoughtful Sourcing",
    copy: "Honouring traditional harvesting practices, biodiverse groves, and unblemished natural purity.",
  },
  {
    icon: IconShieldCheck,
    tone: "bg-tertiary-fixed text-on-tertiary-fixed-variant",
    title: "Quality-Focused",
    copy: "Every batch inspected meticulously for natural aroma, rich crimson color, and crisp texture.",
  },
  {
    icon: IconGift,
    tone: "bg-surface-container-highest text-primary",
    title: "Customer-First Care",
    copy: "Thoughtfully packaged in protective, ceremonial gift-worthy luxury keepsake boxes.",
  },
] as const;

export default async function HomePage() {
  const [categoriesRes, featured, bestsellers, settings, cms] = await Promise.all([
    // Status-aware canary: categories answer even when EMPTY — only a network /
    // 5xx failure yields ok:false. Everything else degrades to [] as before.
    apiGetWithStatus<CategoryDoc[]>("/categories", 120, ["categories", "cms"]),
    getFeatured(),
    getBestsellers(),
    getPublicSettings(),
    getHomepageConfig(),
  ]);
  const categories = categoriesRes.data ?? [];

  // Owner-controlled hero copy + feature flags (Admin → Settings). Blank strings
  // mean "use the approved design default"; null settings (API offline during
  // build/preview) keep the fully-designed hero and both sections visible.
  const sf = settings?.storefront;
  // CMS-configurable CTAs must never land on a 404: when the saved (or design
  // default) destination is a category that is not live right now — archived,
  // draft or missing — the button falls back to a page that always exists.
  // Non-category hrefs pass through untouched; API-offline renders skip the
  // guard (fail-open, nothing to compare against).
  const liveCategorySlugs = new Set(categories.map((c) => c.slug));
  const heroHeadline = sf?.heroHeadline?.trim() ?? "";
  // Second headline segment in the accent style (wine-red italic). Both segments
  // render as ONE headline — part 1 dark, part 2 accent, line-broken like the
  // approved design; whichever segment is left blank is simply not rendered, so
  // the admin can never publish a hollow half-line.
  const heroHeadlineAccent = sf?.heroHeadlineAccent?.trim() ?? "";
  const heroSubcopy = sf?.heroSubcopy?.trim() ?? "";
  const heroImage = sf?.heroImage?.trim() ?? "";
  const heroCtaHref = safeCategoryHref(sf?.heroCtaHref?.trim() || "/shop", liveCategorySlugs, "/shop");
  const heroCtaLabel = sf?.heroCtaLabel?.trim() || "Shop All Products";
  const newsletterEnabled = sf?.newsletterEnabled ?? true;
  const giftCollectionEnabled = sf?.giftCollectionEnabled ?? true;
  const products = featured.length > 0 ? featured : bestsellers;
  const showcase = products.slice(0, 4);
  // Honest empty-vs-offline split: apiOffline = the API genuinely failed;
  // catalogueEmpty = the API answered but there is nothing approved to sell.
  const apiOffline = !categoriesRes.ok;
  const catalogueEmpty = categoriesRes.ok && categories.length === 0 && featured.length === 0 && bestsellers.length === 0;

  const bySlug = new Map(categories.map((c) => [c.slug, c]));

  // ------------------------- CMS homepage overrides -------------------------
  // Admin → Storefront → Homepage. Missing fields fall back to the approved
  // design defaults below, so a fresh CMS doc changes nothing visually.
  const collectionsEnabled = cms?.collections.enabled ?? true;
  const collectionsHeading = cms?.collections.heading?.trim() || "Explore Our Treasures";
  const cmsCollections = new Map(
    (cms?.collections.items ?? []).filter((i) => i.categorySlug).map((i) => [i.categorySlug, i]),
  );
  const trustEnabled = cms?.trust.enabled ?? true;
  const cmsTrust = cms?.trust.items ?? [];
  const storyEnabled = cms?.story.enabled ?? true;
  const cs = cms?.story;
  const storyEyebrow = cs?.eyebrow?.trim() || "Our Culinary Heritage";
  const storyTitle = cs?.title?.trim() || "A Part of Our Traditions.";
  const storyTitleAccent = cs?.title?.trim() ? "" : "A Place in Every Home.";
  const storyText = cs?.text?.trim() || "From everyday kitchen rituals to auspicious celebrations, the ingredients we choose bring flavour, warmth, and meaning to the moments we share.";
  const storyQuote = cs?.quote?.trim() || "Purity isn’t an added feature, it is the only true starting point.";
  const storyQuoteAttribution = cs?.quote?.trim() ? "" : "— Agrarian Almanac";
  const storyImage = cs?.image?.trim() || "/images/story-heritage-kitchen.webp";
  const storyCtaHref = safeCategoryHref(cs?.ctaHref?.trim() || "/about", liveCategorySlugs, "/about");
  const storyCtaLabel = cs?.ctaLabel?.trim() || "Discover Annaadhya";
  const giftingEnabled = cms?.gifting.enabled ?? true;
  const g = cms?.gifting;
  const giftingTitle = g?.title?.trim() || "Make Every Celebration";
  const giftingTitleAccent = g?.title?.trim() ? "" : "More Thoughtful.";
  const giftingCopy = g?.copy?.trim() || "Curated gourmet gifts designed to bring traditional warmth and everyday indulgence to festivals, family gatherings, and meaningful milestones.";
  // The admin's banner image (Admin → Storefront → Homepage → Gifting) — blank in
  // the CMS means the approved gifting photograph, exactly as the field's hint says.
  const giftingImage = g?.image?.trim() || "/images/gifting-royal-hamper.webp";
  const rawGiftingCta = g?.ctaHref?.trim() || "/category/gift-boxes";
  const giftingCtaHref = safeCategoryHref(rawGiftingCta, liveCategorySlugs, "/shop");
  const giftingCtaLabel = g?.ctaLabel?.trim() || "Explore Gift Hampers";

  // Real gifting product from the catalogue (giftItem in seed). Renders only if it exists.
  const giftProduct = await getProduct(g?.productSlug?.trim() || "annaadhya-kesar-rajat");
  const giftPrice = giftProduct
    ? minVariantPricePaise(giftProduct.variants.filter((v) => v.status === "published"))
    : null;

  return (
    <div className="flex flex-col w-full">
      {/* ---------------- Editorial hero ---------------- */}
      <section className="relative w-full overflow-hidden bg-background py-space-xl lg:py-24">
        {/* Ambient warm depth glows */}
        <div className="pointer-events-none absolute -left-20 -top-24 h-96 w-96 rounded-full bg-primary/5 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-24 top-1/2 h-96 w-96 rounded-full bg-tertiary-fixed/20 blur-3xl" aria-hidden />

        <div className="relative mx-auto max-w-[1320px] px-margin-mobile lg:px-margin">
          <div className="grid grid-cols-1 items-center gap-space-xl lg:grid-cols-12">
            {/* Left editorial narrative */}
            <div className="space-y-space-lg lg:col-span-7 lg:pr-space-lg">
              <div className="inline-flex items-center gap-space-sm rounded-full bg-surface-container-high px-space-md py-1.5 shadow-sm">
                <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-primary" aria-hidden />
                <span className="text-label-md uppercase tracking-[0.16em] text-primary">
                  A Little Tradition. A Lot of Goodness.
                </span>
              </div>
              {heroHeadline || heroHeadlineAccent ? (
                <h1 className="font-display text-display-lg-mobile lg:text-display-lg tracking-tight text-on-surface">
                  {heroHeadline}
                  {heroHeadline && heroHeadlineAccent ? <br /> : null}
                  {heroHeadlineAccent ? (
                    <span className="font-normal italic text-primary-container">{heroHeadlineAccent}</span>
                  ) : null}
                </h1>
              ) : (
                <h1 className="font-display text-display-lg-mobile lg:text-display-lg tracking-tight text-on-surface">
                  Nature&rsquo;s Richness, <br />
                  <span className="font-normal italic text-primary-container">Brought Home.</span>
                </h1>
              )}
              <p className="max-w-xl text-body-lg leading-relaxed text-on-surface-variant">
                {heroSubcopy ||
                  "Discover thoughtfully chosen honey, fragrant Kashmiri kesar, and premium dry fruits curated for everyday family rituals, festive tables, and timeless gifting."}
              </p>

              <div className="flex flex-wrap items-center gap-space-md pt-space-xs">
                <Link href={heroCtaHref} className="btn-primary group inline-flex items-center justify-center gap-space-sm px-8 py-3.5 text-label-lg">
                  <span>{heroCtaLabel}</span>
                  <IconArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
                </Link>
                <Link href="/about" className="inline-flex items-center justify-center rounded-sm bg-surface-container-low px-7 py-3.5 text-label-lg font-semibold text-primary shadow-sm transition-all duration-300 hover:bg-surface-container-high">
                  Explore Our Story
                </Link>
              </div>

              {/* Trust divider */}
              <div className="pt-space-md">
                <div className="h-px w-full bg-surface-container-high" aria-hidden />
                <div className="flex flex-wrap items-center gap-x-space-lg gap-y-space-sm pt-space-md text-label-sm uppercase tracking-widest text-on-surface-variant">
                  <div className="flex items-center gap-space-xs">
                    <IconLeaf size={18} className="text-on-tertiary-container" />
                    <span>Thoughtfully Selected</span>
                  </div>
                  <span className="text-on-tertiary-container/40" aria-hidden>•</span>
                  <div className="flex items-center gap-space-xs">
                    <IconShieldCheck size={18} className="text-on-tertiary-container" />
                    <span>Quality-Focused</span>
                  </div>
                  <span className="text-on-tertiary-container/40" aria-hidden>•</span>
                  <div className="flex items-center gap-space-xs">
                    <IconLandmark size={18} className="text-on-tertiary-container" />
                    <span>Inspired by Indian Heritage</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Right architectural visual */}
            <div className="relative lg:col-span-5">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                {/* Background layered tile */}
                <div className="absolute -inset-4 rotate-2 rounded-t-[140px] rounded-b-3xl bg-surface-container-high" aria-hidden />
                {/* Arch-shaped luxury image frame */}
                <div className="relative overflow-hidden rounded-t-[130px] rounded-b-2xl bg-surface-container shadow-xl">
                  {heroImage && !heroImage.startsWith("/") ? (
                    // Owner-configured external hero URL renders as-is (unoptimized);
                    // self-hosted paths below go through the next/image optimizer.
                    <img
                      src={heroImage}
                      alt="Featured selection from the Annaadhya pantry"
                      className="h-[320px] w-full object-cover object-center transition-transform duration-700 hover:scale-105 sm:h-[400px] lg:h-[480px]"
                    />
                  ) : (
                    <Image
                      src={heroImage || "/images/hero-pantry-still-life.webp"}
                      alt={heroImage || "Annaadhya artisanal raw honey, saffron and premium nuts arranged on handmade paper"}
                      width={1200}
                      height={896}
                      priority
                      sizes="(max-width: 1024px) 90vw, 44vw"
                      className="h-[320px] w-full object-cover object-center transition-transform duration-700 hover:scale-105 sm:h-[400px] lg:h-[480px]"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/40 via-transparent to-transparent" aria-hidden />
                </div>
                {/* Heritage pill badge */}
                <div className="absolute -bottom-4 right-6 flex items-center gap-space-xs rounded-full bg-surface-container-lowest px-5 py-2.5 shadow-lg">
                  <IconAward size={20} className="text-on-tertiary-container" />
                  <div className="flex flex-col">
                    <span className="text-[0.625rem] font-bold uppercase tracking-widest text-on-surface-variant">ESTD. BHARAT</span>
                    <span className="text-label-sm font-bold text-primary">Artisanal Grade</span>
                  </div>
                </div>
                {/* Floating stamp accent */}
                <div className="absolute -left-3 -top-3 hidden h-16 w-16 items-center justify-center rounded-full bg-primary-container text-on-primary shadow-md sm:flex" aria-hidden>
                  <span className="text-center text-[0.5625rem] font-bold uppercase leading-tight tracking-tighter">
                    100%<br />NATURAL
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ---------------- Trust indicators ---------------- */}
      {trustEnabled && (
      <section className="w-full bg-surface-container-low py-space-xl">
        <div className="mx-auto max-w-[1320px] px-margin-mobile lg:px-margin">
          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
            {(cmsTrust.length > 0
              ? cmsTrust.map((t, i) => ({
                  title: t.title,
                  copy: t.description,
                  // Admin-managed trust cards cycle the approved icon/tonal set.
                  icon: TRUST[i % TRUST.length].icon,
                  tone: TRUST[i % TRUST.length].tone,
                }))
              : TRUST.map((t) => ({ title: t.title, copy: t.copy, icon: t.icon, tone: t.tone }))
            ).map((t) => (
              <div
                key={t.title}
                className="group flex flex-col rounded-lg bg-surface-container-lowest p-space-lg shadow-sm transition-all duration-300 hover:-translate-y-1 hover:shadow-md"
              >
                <div className={`mb-space-md flex h-12 w-12 items-center justify-center rounded-full transition-colors group-hover:bg-primary-container group-hover:text-on-primary ${t.tone}`}>
                  <t.icon size={24} />
                </div>
                <h3 className="mb-space-xs text-headline-sm text-on-surface">{t.title}</h3>
                <p className="text-body-sm leading-relaxed text-on-surface-variant">{t.copy}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
      )}

      {/* ---------------- Signature collections ---------------- */}
      {collectionsEnabled && (
      <section className="w-full bg-background py-space-xl lg:py-24">
        <div className="mx-auto max-w-[1320px] px-margin-mobile lg:px-margin">
          <div className="mx-auto mb-space-xl flex max-w-2xl flex-col items-center text-center">
            <span className="mb-space-xs text-label-md uppercase tracking-[0.2em] text-primary">The Everyday Pantry</span>
            <h2 className="font-display mb-space-sm text-headline-lg-mobile lg:text-headline-lg text-on-surface">{collectionsHeading}</h2>
            <p className="text-body-md text-on-surface-variant">
              Discover pantry essentials selected for everyday rituals, thoughtful indulgence, and meaningful gifting.
            </p>
          </div>

          <div className="grid grid-cols-1 gap-space-lg md:grid-cols-3">
            {COLLECTIONS.map((col) => {
              const category = bySlug.get(col.slug);
              if (!category) return null; // catalogue truth wins — no invented categories
              const over = cmsCollections.get(col.slug);
              const image = over?.image?.trim() || col.image;
              const badge = over?.eyebrow?.trim() || col.badge;
              const copy = over?.description?.trim() || col.copy;
              const cta = over?.title?.trim() || col.cta;
              return (
                <Link
                  key={col.slug}
                  href={`/category/${category.slug}`}
                  className="group flex flex-col overflow-hidden rounded-xl bg-surface-container-lowest shadow-sm transition-all duration-500 hover:-translate-y-1.5 hover:shadow-xl"
                >
                  <div className="relative h-64 w-full overflow-hidden bg-surface-container sm:h-80">
                    <Image
                      src={image}
                      alt={over?.image?.trim() ? `${category.name} collection` : col.alt}
                      fill
                      sizes="(max-width: 768px) 100vw, 33vw"
                      className="object-cover object-center transition-transform duration-700 group-hover:scale-105"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/50 via-transparent to-transparent opacity-80 transition-opacity group-hover:opacity-60" aria-hidden />
                    <span className="absolute left-4 top-4 rounded-full bg-surface-container-lowest/90 px-3.5 py-1 text-label-sm font-bold uppercase tracking-wider text-primary backdrop-blur-md">
                      {badge}
                    </span>
                  </div>
                  <div className="flex flex-grow flex-col p-space-lg">
                    <h3 className="mb-space-xs text-headline-md text-on-surface transition-colors group-hover:text-primary">
                      {category.name}
                    </h3>
                    <p className="mb-space-md flex-grow text-body-md text-on-surface-variant">{copy}</p>
                    <span className="inline-flex items-center gap-space-xs text-label-lg text-primary transition-colors group-hover:text-primary-container">
                      {cta}
                      <IconArrowRight size={18} className="transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </div>
      </section>
      )}

      {/* ---------------- Featured products ---------------- */}
      <section className="w-full bg-surface-container-low py-space-xl lg:py-24">
        <div className="mx-auto max-w-[1320px] px-margin-mobile lg:px-margin">
          <div className="mb-space-xl flex flex-col justify-between gap-space-md sm:flex-row sm:items-end">
            <div>
              <span className="mb-space-xs block text-label-md uppercase tracking-[0.2em] text-primary">Household Favourites</span>
              <h2 className="font-display text-headline-lg-mobile lg:text-headline-lg text-on-surface">Handpicked for Your Home</h2>
              <p className="mt-1 max-w-xl text-body-md text-on-surface-variant">
                Small batches, thoughtful picks, and pantry favourites to bring a little more goodness to everyday life.
              </p>
            </div>
            <Link
              href="/shop"
              className="inline-flex shrink-0 items-center gap-space-xs text-label-lg text-primary-container transition-colors hover:text-primary"
            >
              View All Products
              <IconArrowRight size={18} />
            </Link>
          </div>

          {showcase.length > 0 ? (
            <ProductGrid products={showcase} />
          ) : apiOffline ? (
            <div className="card-soft p-space-lg">
              <h3 className="font-semibold text-on-surface">Store is warming up</h3>
              <p className="mt-space-xs text-body-sm text-on-surface-variant">
                The catalogue isn&apos;t reachable right now, so shelves look empty. Please refresh in a moment.
              </p>
            </div>
          ) : catalogueEmpty ? (
            <div className="card-soft p-space-lg">
              <h3 className="font-semibold text-on-surface">Our shelves are being stocked</h3>
              <p className="mt-space-xs text-body-sm text-on-surface-variant">
                The catalogue is empty for now — products appear here the moment they are approved in the store
                admin. Please check back shortly.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-4">
              {[...Array(4)].map((_, i) => (
                <ProductCardSkeleton key={i} />
              ))}
            </div>
          )}
        </div>
      </section>

      {/* ---------------- Heritage story ---------------- */}
      {storyEnabled && (
      <section className="w-full overflow-hidden bg-background py-space-xl lg:py-28">
        <div className="mx-auto max-w-[1320px] px-margin-mobile lg:px-margin">
          <div className="grid grid-cols-1 items-center gap-space-xl lg:grid-cols-12">
            {/* Left single-arch magazine visual */}
            <div className="relative lg:col-span-5">
              <div className="relative mx-auto max-w-md lg:max-w-none">
                <div className="absolute -inset-3 -rotate-1 rounded-t-[160px] rounded-b-2xl bg-surface-container-high" aria-hidden />
                <div className="relative overflow-hidden rounded-t-[150px] rounded-b-xl shadow-xl">
                  {storyImage.startsWith("http") ? (
                    // Owner-configured external story image renders as-is (unoptimized).
                     
                    <img
                      src={storyImage}
                      alt="Annaadhya heritage story"
                      className="h-[380px] w-full object-cover object-center transition-transform duration-700 hover:scale-105 sm:h-[520px]"
                    />
                  ) : (
                    <Image
                      src={storyImage}
                      alt="Sunlit traditional Indian kitchen with a brass thali, honey jar and jali window light"
                      width={1200}
                      height={896}
                      sizes="(max-width: 1024px) 90vw, 42vw"
                      className="h-[380px] w-full object-cover object-center transition-transform duration-700 hover:scale-105 sm:h-[520px]"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-t from-inverse-surface/30 via-transparent to-transparent" aria-hidden />
                </div>
                {/* Floating quote card */}
                <div className="absolute -bottom-6 -right-4 hidden max-w-[240px] rounded-xl bg-surface-container-lowest p-space-md shadow-xl sm:block">
                  <p className="font-display text-[1rem] italic leading-snug text-primary-container">
                    &ldquo;{storyQuote}&rdquo;
                  </p>
                  {storyQuoteAttribution ? (
                    <span className="mt-2 block text-[0.625rem] font-bold uppercase tracking-wider text-on-surface-variant">
                      {storyQuoteAttribution}
                    </span>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Right magazine narrative */}
            <div className="space-y-space-md lg:col-span-7 lg:pl-space-xl">
              <span className="text-label-md uppercase tracking-[0.2em] text-primary">{storyEyebrow}</span>
              <h2 className="font-display text-headline-lg-mobile lg:text-headline-lg text-on-surface">
                {storyTitle}{storyTitleAccent ? <> <br /><span className="font-normal italic text-primary">{storyTitleAccent}</span></> : null}
              </h2>
              <p className="text-body-lg leading-relaxed text-on-surface-variant">
                {storyText}
              </p>

              <div className="grid grid-cols-1 gap-space-md pt-space-xs sm:grid-cols-2">
                <div className="rounded-lg bg-surface-container p-space-md shadow-sm">
                  <div className="mb-1 flex items-center gap-space-xs text-primary">
                    <IconCoffee size={20} />
                    <h4 className="text-[1.125rem] font-semibold text-on-surface">For Meaningful Moments</h4>
                  </div>
                  <p className="text-body-sm leading-relaxed text-on-surface-variant">
                    Enriching morning herbal teas, wholesome family breakfasts, and comforting homemade delicacies.
                  </p>
                </div>
                <div className="rounded-lg bg-surface-container p-space-md shadow-sm">
                  <div className="mb-1 flex items-center gap-space-xs text-primary">
                    <IconSparkles size={20} />
                    <h4 className="text-[1.125rem] font-semibold text-on-surface">For Festive Celebrations</h4>
                  </div>
                  <p className="text-body-sm leading-relaxed text-on-surface-variant">
                    Auspicious offerings of pure kesar and royal nuts shared across Diwali, Eid, and joyful reunions.
                  </p>
                </div>
              </div>

              <div className="pt-space-md">
                <Link href={storyCtaHref} className="btn-primary inline-flex items-center justify-center px-8 py-3.5 text-label-lg">
                  {storyCtaLabel}
                </Link>
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ---------------- Premium gifting banner (feature-flagged in settings + CMS) ---------------- */}
      {giftCollectionEnabled && giftingEnabled && (
      <section className="relative w-full overflow-hidden bg-primary-container py-space-xl text-on-primary lg:py-24">
        <div className="pointer-events-none absolute -bottom-32 -left-32 h-96 w-96 rounded-full bg-on-tertiary-container/10 blur-3xl" aria-hidden />
        <div className="pointer-events-none absolute -right-32 -top-32 h-96 w-96 rounded-full bg-surface-container-lowest/5 blur-3xl" aria-hidden />

        <div className="relative z-10 mx-auto max-w-[1320px] px-margin-mobile lg:px-margin">
          <div className="grid grid-cols-1 items-center gap-space-xl lg:grid-cols-12">
            <div className="space-y-space-md lg:col-span-6">
              <div className="inline-flex items-center gap-space-xs rounded-full bg-on-tertiary-container/20 px-3.5 py-1">
                <span className="text-label-sm font-bold uppercase tracking-[0.2em] text-tertiary-fixed">Thoughtful Celebrations</span>
              </div>
              <h2 className="font-display text-display-lg-mobile lg:text-display-lg leading-tight tracking-tight text-surface">
                {giftingTitle}{giftingTitleAccent ? <> <br /><span className="font-normal italic text-tertiary-fixed">{giftingTitleAccent}</span></> : null}
              </h2>
              <p className="max-w-lg text-body-lg leading-relaxed text-surface-variant">
                {giftingCopy}
              </p>
              <div className="flex flex-wrap items-center gap-space-md pt-space-xs">
                <Link
                  href={giftingCtaHref}
                  className="inline-flex items-center justify-center rounded-sm bg-on-tertiary-container px-8 py-3.5 text-label-lg text-tertiary shadow-md transition-all duration-300 hover:bg-tertiary-fixed hover:shadow-lg"
                >
                  {giftingCtaLabel}
                </Link>
                <Link
                  href="/contact"
                  className="inline-flex items-center justify-center rounded-sm bg-surface/10 px-7 py-3.5 text-label-lg font-semibold text-surface shadow-sm transition-all duration-300 hover:bg-surface/20"
                >
                  Corporate Gifting
                </Link>
              </div>
              <div className="grid grid-cols-1 gap-space-md pt-space-md text-label-sm text-surface-variant sm:grid-cols-2">
                <div className="flex items-center gap-space-xs">
                  <IconPenLine size={18} className="text-tertiary-fixed" />
                  <span>Handwritten Calligraphy Cards</span>
                </div>
                <div className="flex items-center gap-space-xs">
                  <IconTruck size={18} className="text-tertiary-fixed" />
                  <span>Direct Doorstep Pan-India Courier</span>
                </div>
              </div>
            </div>

            {/* Luxury gifting photograph + real product overlay */}
            <div className="lg:col-span-6">
              <div className="relative overflow-hidden rounded-2xl bg-primary shadow-2xl">
                <Image
                  src={giftingImage}
                  alt={giftingImage === "/images/gifting-royal-hamper.webp"
                    ? "Opulent festive gift box in heritage maroon velvet with gold embossing, honey jars, saffron and dry fruits"
                    : "Annaadhya gifting banner"}
                  width={1376}
                  height={768}
                  sizes="(max-width: 1024px) 100vw, 50vw"
                  className="h-[300px] w-full object-cover object-center transition-transform duration-700 hover:scale-105 sm:h-[440px]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-primary/60 via-transparent to-transparent" aria-hidden />
                {giftProduct && giftPrice !== null && (
                  <div className="absolute bottom-6 left-6 right-6 flex items-center justify-between rounded-xl bg-inverse-surface/80 px-5 py-3 text-on-surface backdrop-blur-md">
                    <div className="flex flex-col">
                      <span className="text-[0.625rem] font-bold uppercase tracking-widest text-tertiary-fixed">
                        {giftProduct.name}
                      </span>
                      <span className="text-body-sm text-surface-bright">{giftProduct.subtitle}</span>
                    </div>
                    <span className="text-[1.375rem] font-bold leading-7 text-surface-bright text-tabular">
                      {formatINR(giftPrice, false)}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </section>
      )}

      {/* ---------------- Newsletter (feature-flagged in settings) ---------------- */}
      {newsletterEnabled && (
      <section className="w-full bg-background py-space-xl lg:py-24">
        <div className="mx-auto max-w-4xl px-margin-mobile lg:px-margin">
          <div className="rounded-2xl bg-surface-container-low p-space-xl text-center shadow-sm lg:p-16">
            <span className="mb-space-xs block text-label-md uppercase tracking-[0.2em] text-primary">The Art of Giving</span>
            <h2 className="font-display mx-auto mb-space-sm max-w-xl text-headline-md text-on-surface">
              Heirloom Recipes, First Harvests &amp; Private Sales
            </h2>
            <p className="mx-auto mb-space-lg max-w-lg text-body-md text-on-surface-variant">
              Be the first to receive thoughtful notes on seasonal favourites, curated collections, and special releases.
            </p>
            <NewsletterForm variant="hero" />
            <p className="mt-space-md text-label-sm text-on-surface-variant">
              We honour your privacy. Receive only seasonal announcements and harvest updates.
            </p>
          </div>
        </div>
      </section>
      )}
    </div>
  );
}
