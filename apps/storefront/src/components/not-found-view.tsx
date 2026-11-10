import Image from "next/image";
import Link from "next/link";
import { getCategoryOverview, getPublicSettings } from "@/lib/api";
import { pruneDeadCategoryLinks } from "@/lib/navigation-guard";
import {
  IconArrowRight,
  IconBadgeCheck,
  IconDroplet,
  IconFlower2,
  IconGift,
  IconHeadset,
  IconHouse,
  IconLeaf,
  IconMail,
  IconSearch,
  IconShoppingBag,
  IconSparkles,
  IconSprout,
} from "@/components/icons";

/**
 * The approved Stitch 404 design — "Looks like this page has wandered off."
 *
 * Wired to the real storefront (shared by both not-found boundaries — the
 * (shop) group boundary for thrown notFound(), the root boundary for
 * unmatched URLs; each composes exactly one header + footer around it):
 *  - recovery links point only at real routes (/shop, /, the four real
 *    categories — gift hampers lives at /category/gift-boxes in the catalogue —
 *    and /contact). No placeholder hrefs, no invented destinations;
 *  - the quick search performs a genuine shop search (GET /shop?search=…, the
 *    same param the approved shop toolbar consumes);
 *  - the still life reuses the permanent brand asset /images/hero-pantry-
 *    still-life.webp (no Stitch preview URLs);
 *  - the hospitality banner renders the store's LIVE support email from
 *    public settings — the design's "concierge@" address was not invented
 *    into the page. Business hours are omitted entirely: no schedule exists
 *    in the store settings to quote honestly.
 */
/** Real destinations only — slugs verified against the seeded catalogue. */
const TREASURY = [
  {
    href: "/shop",
    icon: IconShoppingBag,
    title: "Shop All Pantry",
    copy: "Explore the complete seasonal treasury of small-batch Indian forest and mountain harvests.",
  },
  {
    href: "/category/honey",
    icon: IconDroplet,
    title: "Wild & Floral Honey",
    copy: "Raw, cold-filtered honeys gathered by independent beekeepers across forest belts and Himalayan valleys.",
  },
  {
    href: "/category/kesar",
    icon: IconFlower2,
    title: "Kashmiri Mongra Kesar",
    copy: "Deep scarlet saffron threads from the historic soils of Pampore, hand-culled and lab-tested.",
  },
  {
    href: "/category/dry-fruits",
    icon: IconSprout,
    title: "Sun-Dried Dry Fruits",
    copy: "Mamra almonds, jumbo cashews and snow walnuts, listed only after supplier verification.",
  },
  {
    href: "/category/gift-boxes",
    icon: IconGift,
    title: "Artisanal Gift Hampers",
    copy: "Curated presentation boxes for weddings, festivities and corporate tokens of goodwill.",
  },
] as const;

export async function NotFoundView() {
  const [settings, overview] = await Promise.all([getPublicSettings(), getCategoryOverview()]);
  const supportEmail = settings?.store.supportEmail?.trim() ?? "";
  // The treasury cards follow the live catalogue like every other storefront
  // surface: an archived category's card is dropped (no 404-into-404 loops),
  // and an unreachable API skips the prune (fail-open).
  const publishedSlugs = overview ? new Set(overview.categories.map((c) => c.slug)) : null;
  const treasury = pruneDeadCategoryLinks(TREASURY, publishedSlugs);

  return (
    <div className="bg-surface">
      {/* Atmospheric heritage glows */}
      <div className="relative w-full overflow-hidden">
        <div
          className="pointer-events-none absolute -top-40 right-1/4 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-tertiary-fixed-dim/20 to-transparent blur-3xl"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute top-1/2 -left-32 h-[420px] w-[420px] rounded-full bg-gradient-to-tr from-surface-container-high/60 to-transparent blur-2xl"
          aria-hidden
        />

        <div className="relative mx-auto w-full max-w-7xl px-margin-mobile pt-space-md pb-space-xl lg:px-margin">
          {/* 1. Breadcrumb */}
          <nav
            aria-label="Breadcrumb"
            className="mb-space-lg flex items-center gap-space-xs font-body-sm text-body-sm text-on-surface-variant"
          >
            <Link href="/" className="flex items-center gap-1 transition-colors hover:text-primary">
              <IconHouse size={16} />
              <span>Home</span>
            </Link>
            <span className="select-none text-outline-variant" aria-hidden>
              /
            </span>
            <span className="font-medium text-primary">404 Not Found</span>
          </nav>

          {/* 2. Hero — editorial asymmetrical lockup + heirloom plinth */}
          <section className="my-space-lg grid grid-cols-1 items-center gap-space-xl lg:grid-cols-12 lg:gap-gutter">
            {/* Left column — recovery content */}
            <div className="flex flex-col items-start gap-space-md lg:col-span-7">
              <div className="inline-flex items-center gap-space-xs rounded-full bg-surface-container px-space-md py-1 text-primary shadow-sm">
                <IconLeaf size={15} className="text-tertiary-fixed-dim" />
                <span className="font-label-sm text-label-sm font-bold uppercase tracking-[0.14em]">
                  Page Not Found
                </span>
              </div>

              {/* Stylized 404 heading lockup */}
              <div className="relative flex flex-col">
                <span
                  aria-hidden
                  className="font-display -mb-4 select-none text-[88px] leading-[92px] tracking-tighter text-primary/15 lg:-mb-7 lg:text-[124px] lg:leading-[110px]"
                >
                  404
                </span>
                <h1 className="font-display text-headline-lg-mobile tracking-tight text-primary lg:text-display-lg">
                  Looks like this page has wandered off.
                </h1>
              </div>

              {/* Serif ornament divider */}
              <div className="my-space-xs flex w-full max-w-md items-center gap-space-sm" aria-hidden>
                <div className="h-px flex-1 bg-gradient-to-r from-tertiary-fixed-dim to-transparent" />
                <span className="font-display text-[16px] leading-none text-tertiary-fixed-dim">✦</span>
                <div className="h-px flex-1 bg-gradient-to-l from-tertiary-fixed-dim to-transparent" />
              </div>

              <p className="max-w-xl font-body-lg text-body-lg leading-relaxed text-on-surface-variant">
                The page you are seeking may have been renamed, seasonally retired, or the path
                holds a quiet typographical slip. Let us shepherd you back to something exquisite.
              </p>

              {/* Recovery actions */}
              <div className="flex w-full flex-wrap items-center gap-space-md pt-space-sm sm:w-auto">
                <Link
                  href="/shop"
                  className="btn-primary group inline-flex items-center justify-center gap-space-xs rounded-lg px-space-xl py-space-sm font-label-lg text-label-lg shadow-md"
                >
                  <span>Explore All Products</span>
                  <IconArrowRight size={18} className="transition-transform group-hover:translate-x-1" />
                </Link>
                <Link
                  href="/"
                  className="inline-flex items-center justify-center gap-space-xs rounded-lg bg-surface-container-low px-space-lg py-space-sm font-label-lg text-label-lg text-primary shadow-sm transition-colors hover:bg-surface-container"
                >
                  <IconHouse size={18} />
                  <span>Return to Homepage</span>
                </Link>
              </div>

              {/* Quick search — a real shop search, same param as the approved toolbar */}
              <div className="mt-space-sm w-full max-w-md pt-space-sm">
                <p className="mb-space-xs font-label-sm text-label-sm uppercase tracking-wider text-on-surface-variant">
                  Looking for a particular pantry item?
                </p>
                <form action="/shop" method="get" role="search" className="relative flex items-center">
                  <IconSearch size={20} className="pointer-events-none absolute left-3 text-on-surface-variant" />
                  <input
                    type="text"
                    name="search"
                    aria-label="Search the shop"
                    placeholder="Try 'Forest Honey', 'Mongra Kesar', 'Mamra Almonds'..."
                    className="w-full rounded-lg bg-surface-container-lowest py-2.5 pr-24 pl-10 font-body-sm text-body-sm text-on-surface shadow-sm transition-shadow placeholder:text-on-surface-variant/70 focus:ring-2 focus:ring-primary/40 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="absolute right-1.5 rounded bg-primary px-space-md py-1.5 font-label-sm text-label-sm text-on-primary transition-colors hover:bg-primary-container"
                  >
                    Search
                  </button>
                </form>
              </div>
            </div>

            {/* Right column — arched heritage still life with stamp */}
            <div className="flex flex-col items-center lg:col-span-5 lg:items-end">
              <div className="relative w-full max-w-md">
                <div className="relative overflow-hidden rounded-b-xl rounded-t-[120px] bg-surface-container-low shadow-xl">
                  <div className="absolute inset-x-0 top-4 z-10 flex justify-center">
                    <span className="rounded-full bg-surface/90 px-space-md py-0.5 font-label-sm text-[10px] font-bold tracking-widest uppercase text-tertiary shadow-sm backdrop-blur-md">
                      Annaadhya Reserve
                    </span>
                  </div>
                  <div className="relative aspect-[4/5] w-full overflow-hidden">
                    <Image
                      src="/images/hero-pantry-still-life.webp"
                      alt="Artisanal pantry still life: a glass jar of golden honey with almonds, cashews, pistachios and saffron arranged on rustic paper over aged wood"
                      fill
                      sizes="(min-width: 1024px) 448px, 100vw"
                      className="object-cover transition-transform duration-700 ease-out hover:scale-105"
                    />
                    <div
                      className="absolute inset-x-0 bottom-0 h-28 bg-gradient-to-t from-inverse-surface/85 via-inverse-surface/30 to-transparent"
                      aria-hidden
                    />
                    <div className="absolute inset-x-4 bottom-4 text-center">
                      <p className="font-body-sm text-body-sm text-inverse-on-surface italic">
                        &ldquo;Heirloom harvests &amp; single-origin pantry staples, crafted with
                        generational care.&rdquo;
                      </p>
                    </div>
                  </div>
                </div>
                <div className="absolute -bottom-5 -left-4 flex items-center gap-space-xs rounded-xl bg-surface-container-lowest p-space-sm shadow-lg lg:-left-6">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary text-on-primary">
                    <IconBadgeCheck size={20} />
                  </div>
                  <div className="flex flex-col pr-space-xs">
                    <span className="font-label-sm text-label-sm font-bold text-primary">
                      100% Purity Certified
                    </span>
                    <span className="text-[11px] leading-tight text-on-surface-variant">
                      GI Tagged &amp; Lab-Tested Terroirs
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </section>

          {/* 3. Curated treasury — real routes only */}
          <section className="mt-space-xl pt-space-xl">
            <div className="mx-auto mb-space-lg flex max-w-2xl flex-col items-center text-center">
              <span className="mb-space-xs font-label-sm text-label-sm font-bold uppercase tracking-[0.16em] text-secondary">
                Curated Treasury
              </span>
              <h2 className="font-display text-headline-lg-mobile text-primary lg:text-headline-lg">
                Perhaps you&apos;ll find it here
              </h2>
              <div className="my-space-xs flex items-center gap-2" aria-hidden>
                <span className="h-px w-8 bg-tertiary-fixed-dim" />
                <span className="text-xs text-tertiary-fixed-dim">◆</span>
                <span className="h-px w-8 bg-tertiary-fixed-dim" />
              </div>
              <p className="font-body-md text-body-md text-on-surface-variant">
                Browse our signature artisanal collections or speak with our estate concierge for
                personalized assistance.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2 lg:grid-cols-3">
              {treasury.map((card) => (
                <Link
                  key={card.href}
                  href={card.href}
                  className="group flex flex-col justify-between rounded-xl bg-surface-container-lowest p-space-lg shadow-sm transition-all duration-300 hover:bg-surface-container-low hover:shadow-md"
                >
                  <div className="mb-space-md flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-surface-container text-primary transition-colors group-hover:bg-primary group-hover:text-on-primary">
                      <card.icon size={26} />
                    </div>
                    <IconArrowRight
                      size={20}
                      className="-rotate-45 text-outline-variant transition-colors group-hover:text-primary"
                    />
                  </div>
                  <div>
                    <h3 className="mb-1 font-display text-headline-sm text-primary transition-colors group-hover:text-primary-container">
                      {card.title}
                    </h3>
                    <p className="font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
                      {card.copy}
                    </p>
                  </div>
                </Link>
              ))}

              {/* Concierge card — routes to the real contact workflow */}
              <Link
                href="/contact"
                className="group flex flex-col justify-between rounded-xl bg-secondary p-space-lg text-on-secondary shadow-sm transition-all duration-300 hover:bg-secondary/95 hover:shadow-md"
              >
                <div className="mb-space-md flex items-start justify-between">
                  <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-on-secondary/15 text-on-secondary transition-colors group-hover:bg-on-secondary group-hover:text-secondary">
                    <IconHeadset size={26} />
                  </div>
                  <IconArrowRight size={20} className="text-secondary-fixed transition-transform group-hover:translate-x-1" />
                </div>
                <div>
                  <h3 className="mb-1 font-display text-headline-sm text-on-secondary">Estate Concierge Desk</h3>
                  <p className="font-body-sm text-body-sm leading-relaxed text-secondary-container">
                    Need guidance on an order or a bespoke consignment? Our desk is at your service.
                  </p>
                </div>
              </Link>
            </div>
          </section>

          {/* 4. Hospitality banner — live support email only, no invented hours */}
          <section className="mt-space-xl pt-space-md">
            <div className="relative flex flex-col items-center justify-between gap-space-lg overflow-hidden rounded-2xl bg-surface-container p-space-lg shadow-sm md:flex-row lg:p-space-xl">
              <div className="absolute -right-10 -bottom-10 h-44 w-44 rounded-full bg-primary/5" aria-hidden />
              <div className="flex max-w-2xl items-start gap-space-md">
                <div className="mt-1 flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <IconSparkles size={24} />
                </div>
                <div>
                  <h3 className="mb-1 font-display text-headline-sm text-primary">
                    A Gentle Detour in Good Taste
                  </h3>
                  <p className="font-body-sm text-body-sm leading-relaxed text-on-surface-variant">
                    Every journey in good taste occasionally takes an unexpected turn. Our team is
                    always on hand if you require assistance tracing an order or a seasonal release.
                  </p>
                </div>
              </div>
              <div className="flex shrink-0 flex-col items-start gap-space-xs md:items-end md:text-right">
                {supportEmail ? (
                  <a
                    href={`mailto:${supportEmail}`}
                    className="flex items-center gap-1.5 font-label-lg text-label-lg font-bold text-primary hover:underline"
                  >
                    <IconMail size={18} />
                    {supportEmail}
                  </a>
                ) : (
                  <Link
                    href="/contact"
                    className="flex items-center gap-1.5 font-label-lg text-label-lg font-bold text-primary hover:underline"
                  >
                    <IconMail size={18} />
                    Write to us via the contact page
                  </Link>
                )}
                <span className="flex items-center gap-1.5 font-body-sm text-body-sm text-on-surface-variant">
                  Replies route to the real store inbox — no chatbots, no queues.
                </span>
              </div>
            </div>
          </section>
        </div>
      </div>
    </div>
  );
}
