/** Shared URL mapping between CMS content and storefront routes.
 *  Built-in pages render at their established storefront URLs — these routes
 *  are frozen API-side so admins can never accidentally break a live URL. */

export const BUILTIN_PAGE_ROUTES: Record<string, string> = {
  "our-story": "/about",
  faq: "/faq",
  contact: "/contact",
  shipping: "/policies/shipping",
  returns: "/policies/returns",
  privacy: "/policies/privacy",
  terms: "/policies/terms",
};

/** Storefront URL for a page record. Custom pages live under /p/{slug}. */
export function storefrontUrlForPage(page: { slug: string; builtIn: boolean }): string {
  if (page.builtIn) return BUILTIN_PAGE_ROUTES[page.slug] ?? `/p/${page.slug}`;
  return `/p/${page.slug}`;
}
