/** API access — server components call the API through the Vercel service binding
 *  (API_URL, injected at runtime); browsers call the same origin, so the default is
 *  the relative /api/v1 prefix which the platform rewrite routes to the api service. */
import type {
  CategoryDoc,
  CategoryOverview,
  HomepageDoc,
  Page,
  ProductWithVariantsShape,
  PublicNavigationItem,
  PublicPageDoc,
  PublicStoreSettings,
} from "./types";

// Vercel services binding: the injected value is the api service's base URL (origin
// only), so the global prefix /api/v1 is appended here. Locally (and for any manual
// override) accept either an origin or an origin that already ends with /api/v1.
const RAW_API_URL = (process.env.API_URL ?? "http://localhost:4000")
  .trim()
  .replace(/\/+$/, "")
  .replace(/\/api\/v1$/, "");
export const API_URL = `${RAW_API_URL}/api/v1`;

// Browser-side base. NEXT_PUBLIC_API_URL is only needed for `next dev` against a
// separately running API; on Vercel it must stay unset so calls are same-origin
// (browser code cannot resolve service bindings — they are server-side only).
export const PUBLIC_API_URL = process.env.NEXT_PUBLIC_API_URL ?? "/api/v1";

export interface ApiEnvelope<T> {
  ok: boolean;
  data?: T;
  error?: { code: string; message: string; details?: unknown };
}

export async function apiGet<T>(path: string, revalidate = 60, tags?: string[]): Promise<T | null> {
  try {
    const res = await fetch(`${API_URL}${path}`, {
      next: { revalidate, ...(tags && tags.length > 0 ? { tags } : {}) },
      headers: { "content-type": "application/json" },
    });
    if (!res.ok) return null;
    const body = (await res.json()) as ApiEnvelope<T>;
    return body.ok ? body.data ?? null : null;
  } catch {
    // API offline during build/preview — pages render their empty states.
    return null;
  }
}

export async function apiPost<T>(path: string, body: unknown, token?: string): Promise<T> {
  const res = await fetch(`${PUBLIC_API_URL}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      ...(token ? { authorization: `Bearer ${token}` } : {}),
    },
    body: JSON.stringify(body),
  });
    const json = (await res.json()) as ApiEnvelope<T>;
  if (!json.ok) {
    throw new Error(json.error?.message ?? `Request failed (${res.status})`);
  }
  return json.data as T;
}

export async function apiGetAuth<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${PUBLIC_API_URL}${path}`, {
    headers: { authorization: `Bearer ${token}` },
  });
  const json = (await res.json()) as ApiEnvelope<T>;
  if (!json.ok) throw new Error(json.error?.message ?? `Request failed (${res.status})`);
  return json.data as T;
}

/* --------------------------- server-side catalogue --------------------------- */

export async function getCategories(): Promise<CategoryDoc[]> {
  // Tagged "cms"+"categories" so the API's category-mutation webhook (fires on
  // create/update/delete — including archiving) refreshes these reads within
  // seconds; the 120s window is only the safety net for a missed push.
  return (await apiGet<CategoryDoc[]>("/categories", 120, ["categories", "cms"])) ?? [];
}

/** One roundtrip for the shop page: every category + its sellable product count + the total.
 *  Replaces the old pattern of one products request per category pill (N+1 fan-out).
 *  Tagged like getCategories so archived categories leave every cached render fast. */
export async function getCategoryOverview(): Promise<CategoryOverview | null> {
  return apiGet<CategoryOverview>("/categories/overview", 120, ["categories", "cms"]);
}

export async function getProducts(params: URLSearchParams): Promise<Page<ProductWithVariantsShape> | null> {
  return apiGet<Page<ProductWithVariantsShape>>(`/products?${params.toString()}`, 45);
}

export async function getProduct(slug: string): Promise<ProductWithVariantsShape | null> {
  return apiGet<ProductWithVariantsShape>(`/products/slug/${encodeURIComponent(slug)}`, 60);
}

/** Same-category companions for the product page ("You may also like"). */
export async function getRelatedProducts(slug: string): Promise<ProductWithVariantsShape[]> {
  return (
    (await apiGet<ProductWithVariantsShape[]>(`/products/slug/${encodeURIComponent(slug)}/related`, 60)) ?? []
  );
}

export async function getBestsellers(): Promise<ProductWithVariantsShape[]> {
  return (await apiGet<ProductWithVariantsShape[]>("/products/bestsellers", 90)) ?? [];
}

export async function getFeatured(): Promise<ProductWithVariantsShape[]> {
  return (await apiGet<ProductWithVariantsShape[]>("/products/featured", 90)) ?? [];
}

export async function getPlatformStatus(): Promise<{
  mode: { dataProvider: string; authentication: string; payments: string; sandbox: boolean };
  paymentsSandbox: boolean;
  codEnabled: boolean;
} | null> {
  return apiGet("/auth/platform-status", 30);
}

/** Whitelisted store settings (support email/phone, address, socials) — powers the
 *  contact page. Null when the API is offline; callers render honest fallbacks.
 *  Tagged "settings" so the /revalidate webhook (nudged by the API on every
 *  settings save) refreshes the hero/announcement within seconds. */
export async function getPublicSettings(): Promise<PublicStoreSettings | null> {
  return apiGet<PublicStoreSettings>("/settings/public", 120, ["settings"]);
}

/* -------------------------------- CMS content --------------------------------- */

/** CMS reads are tagged `cms` so the storefront /revalidate webhook (nudged by
 *  the API on every admin save) can refresh them on demand; the revalidate
 *  window stays as a safety net for missed pushes. */

export async function getPage(slug: string): Promise<PublicPageDoc | null> {
  return apiGet<PublicPageDoc>(`/pages/${encodeURIComponent(slug)}`, 60, ["cms", "pages"]);
}

export async function getPublishedPages(): Promise<PublicPageDoc[]> {
  return (await apiGet<PublicPageDoc[]>("/pages", 120, ["cms", "pages"])) ?? [];
}

export async function getNavigation(): Promise<PublicNavigationItem[]> {
  return (await apiGet<PublicNavigationItem[]>("/navigation", 60, ["cms", "navigation"])) ?? [];
}

/** Saved navigation-item counts per location, regardless of enabled state.
 *  Null when the API is unreachable. Distinguishes "Navigation manager never
 *  configured for this surface" (the curated fallback menus apply) from "admin
 *  saved items here" (the CMS owns the surface — even when every item is
 *  currently hidden, which is an explicit configuration, not a gap). */
export interface NavConfiguredCounts {
  header: number;
  "footer-care": number;
  "footer-legal": number;
}

export async function getNavigationConfigured(): Promise<NavConfiguredCounts | null> {
  return apiGet<NavConfiguredCounts>("/navigation/configured", 60, ["cms", "navigation"]);
}

export async function getHomepageConfig(): Promise<HomepageDoc | null> {
  return apiGet<HomepageDoc>("/homepage", 60, ["cms", "homepage"]);
}
