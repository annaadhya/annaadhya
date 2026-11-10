/**
 * Built-in page → storefront URL map (mirrors apps/api …/content-urls.ts).
 * Built-in CMS pages render at frozen storefront routes; custom pages live
 * under /p/{slug}. Kept in sync with the API so admins always see the URL
 * a nav link will actually produce.
 */
export const BUILTIN_PAGE_ROUTES: Record<string, string> = {
  "our-story": "/about",
  faq: "/faq",
  contact: "/contact",
  shipping: "/policies/shipping",
  returns: "/policies/returns",
  privacy: "/policies/privacy",
  terms: "/policies/terms",
};

export function storefrontUrlForPageSlug(slug: string): string {
  return BUILTIN_PAGE_ROUTES[slug] ?? `/p/${slug}`;
}
