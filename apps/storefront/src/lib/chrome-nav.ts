/**
 * Shared composition of the storefront chrome navigation (header menu and the
 * footer's care/legal columns) from the admin Navigation manager's saved items.
 *
 * Ownership rule (why the "configured" counts exist): the curated DEFAULT_NAV
 * and the footer's static link lists are a graceful fallback for a manager that
 * was never set up — NOT a resurrection switch. The public /navigation list
 * only carries enabled items, so "every item hidden" is indistinguishable from
 * "nothing saved" there; the counts from /navigation/configured close that gap.
 * Once an admin has saved items for a surface (any enabled state), that surface
 * is CMS-owned: hiding every item hides the menu/column, and the show/hide
 * toggles can never look broken. An unreachable configured-signal fails open to
 * the pre-existing behaviour (CMS items when present, curated defaults
 * otherwise), and every list — curated or CMS — is category-pruned: an unknown
 * catalogue DROPS category links instead of showing them, so a deploy-time
 * build race can never re-render a category the owner deleted.
 */
import type { NavConfiguredCounts } from "./api";
import type { PublicNavigationItem } from "./types";
import { DEFAULT_NAV } from "./default-nav";
import { pruneDeadCategoryLinks, type PublishedCategorySlugs } from "./navigation-guard";

export type NavLink = { href: string; label: string };

export interface ChromeNavInputs {
  navigation: PublicNavigationItem[];
  navConfigured: NavConfiguredCounts | null;
  publishedSlugs: PublishedCategorySlugs;
}

/** Enabled CMS links for one navigation location, ordered, category-pruned. */
export function cmsNavLinks(
  navigation: PublicNavigationItem[],
  location: "header" | "footer-care" | "footer-legal",
  publishedSlugs: PublishedCategorySlugs,
): NavLink[] {
  return pruneDeadCategoryLinks(
    navigation
      .filter((n) => n.location === location)
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((n) => ({ href: n.href, label: n.label })),
    publishedSlugs,
  );
}

/** Header menu: CMS-owned when the manager has saved header items (even if
 *  every one is currently hidden — an explicit configuration); the curated
 *  fallback menu only steps in for a never-configured manager or when the
 *  configured-signal is unreachable (fail-open, pre-existing behaviour). */
export function resolveHeaderNav({ navigation, navConfigured, publishedSlugs }: ChromeNavInputs): NavLink[] {
  const cmsHeader = cmsNavLinks(navigation, "header", publishedSlugs);
  const saved = navConfigured ? navConfigured.header : null;
  if (saved !== null && saved > 0) return cmsHeader;
  if (saved === null && cmsHeader.length > 0) return cmsHeader;
  return pruneDeadCategoryLinks(DEFAULT_NAV, publishedSlugs);
}
