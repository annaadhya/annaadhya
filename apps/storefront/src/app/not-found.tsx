import type { Metadata } from "next";
import { getCategoryOverview, getNavigation, getNavigationConfigured } from "@/lib/api";
import { cmsNavLinks, resolveHeaderNav } from "@/lib/chrome-nav";
import { type PublishedCategorySlugs } from "@/lib/navigation-guard";
import { AnnouncementStrip } from "@/components/announcement-strip";
import { Header } from "@/components/header";
import { Footer } from "@/components/footer";
import { NotFoundView } from "@/components/not-found-view";

/** Private error surface — keep every 404 out of search indexes. */
export const metadata: Metadata = {
  title: "Page Not Found",
  robots: { index: false, follow: false },
};

/**
 * Root not-found boundary — serves COMPLETELY UNMATCHED URLs (no route match
 * at all). Next.js does not apply the (shop) group layout here, so the
 * storefront chrome is composed from the SAME shared components and the SAME
 * shared navigation rules used by the (shop) layout — exactly one
 * AnnouncementStrip, one Header, one Footer — around the approved 404 design.
 * Thrown notFound() inside (shop) routes keeps using the group's own boundary
 * with the group layout.
 */
export default async function GlobalNotFound() {
  // Same navigation rules as the (shop) layout: the overview IS the published
  // set; the header honours the Navigation manager's show/hide toggles (CMS
  // owns a configured surface) and every fallback is category-pruned.
  // null overview ⇒ API unreachable ⇒ publishedSlugs null ⇒ fail-open.
  const [overview, navigation, navConfigured] = await Promise.all([
    getCategoryOverview(),
    getNavigation(),
    getNavigationConfigured(),
  ]);
  const readyCategories = (overview?.categories ?? []).filter((c) => c.isReady);
  const publishedSlugs: PublishedCategorySlugs = overview
    ? new Set(overview.categories.map((c) => c.slug))
    : null;

  return (
    <>
      <AnnouncementStrip />
      {/* The root boundary sits outside the (shop) layout, so the header resolves
          through the same shared rule — dead category links and hidden toggles
          behave exactly as everywhere else on the site. */}
      <Header navItems={resolveHeaderNav({ navigation, navConfigured, publishedSlugs })} />
      <main className="flex-1">
        <NotFoundView />
      </main>
      <Footer
        categories={readyCategories.map((c) => ({ slug: c.slug, name: c.name }))}
        careLinks={cmsNavLinks(navigation, "footer-care", publishedSlugs)}
        legalLinks={cmsNavLinks(navigation, "footer-legal", publishedSlugs)}
        careConfigured={navConfigured ? navConfigured["footer-care"] > 0 : null}
        legalConfigured={navConfigured ? navConfigured["footer-legal"] > 0 : null}
      />
    </>
  );
}
