import type { ReactNode } from "react";
import { getCategoryOverview, getNavigation, getNavigationConfigured } from "@/lib/api";
import { cmsNavLinks, resolveHeaderNav } from "@/lib/chrome-nav";
import { type PublishedCategorySlugs } from "@/lib/navigation-guard";
import { AnnouncementStrip } from "@/components/announcement-strip";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { BottomNav } from "@/components/bottom-nav";

/** Full storefront chrome for every browsing surface (home, shop, product, cart,
 *  account, wishlist, policies…). The checkout flow uses the focused (checkout)
 *  chrome from the approved Stitch design instead.
 *
 *  Navigation links come from the admin Navigation manager (CMS) — but every
 *  category link is validated against the LIVE catalogue before it renders.
 *  Archiving a category therefore removes its navbar/footer links within
 *  seconds, automatically: no one has to revisit the Navigation manager to
 *  clean up. The curated built-in menu only steps in when the manager has
 *  never been configured for a surface (or its signal is unreachable —
 *  fail-open), so the admin's show/hide toggles always win: hiding every
 *  header item hides the menu, it never resurrects the curated defaults. */
export default async function ShopLayout({ children }: { children: ReactNode }) {
  const [overview, navigation, navConfigured] = await Promise.all([
    getCategoryOverview(),
    getNavigation(),
    getNavigationConfigured(),
  ]);

  // The overview's categories ARE the published set (the same list the
  // /category/[slug] route resolves against) — including not-yet-ready ones,
  // whose pages render the honest "coming soon" state instead of a 404.
  // null overview ⇒ catalogue unreachable ⇒ publishedSlugs null ⇒ fail open.
  const publishedSlugs: PublishedCategorySlugs = overview
    ? new Set(overview.categories.map((c) => c.slug))
    : null;

  const pick = (location: "header" | "footer-care" | "footer-legal") =>
    cmsNavLinks(navigation, location, publishedSlugs);

  // Admin-managed navigation wins: if the manager has saved header items, the
  // CMS owns the navbar outright — even "every item hidden" is an explicit
  // configuration and renders an empty menu (the show/hide toggles must never
  // look broken). The curated default only keeps the header complete when the
  // manager has never been configured (signal unreachable ⇒ fail-open with the
  // pre-configured behaviour). Either way the fallback menu is pruned by the
  // same catalogue rule so it can never point at an archived category.
  const headerItems = resolveHeaderNav({ navigation, navConfigured, publishedSlugs });

  const careSaved = navConfigured ? navConfigured["footer-care"] > 0 : null;
  const legalSaved = navConfigured ? navConfigured["footer-legal"] > 0 : null;

  return (
    <>
      <AnnouncementStrip />
      <Header navItems={headerItems} />
      <main className="flex-1">{children}</main>
      <Footer
        categories={(overview?.categories ?? [])
          .filter((c) => c.isReady)
          .map((c) => ({ slug: c.slug, name: c.name }))}
        careLinks={pick("footer-care")}
        legalLinks={pick("footer-legal")}
        careConfigured={careSaved}
        legalConfigured={legalSaved}
      />
      {/* Flow spacer matching the fixed BottomNav (nav + safe-area) so the footer's
          last line can never be pinned behind the bar on phones. */}
      <div
        aria-hidden
        className="h-[calc(4rem+env(safe-area-inset-bottom))] lg:hidden"
      />
      <BottomNav />
    </>
  );
}
