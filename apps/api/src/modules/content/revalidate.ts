/**
 * Best-effort on-demand cache revalidation for the storefront.
 *
 * When the API mutates CMS content (pages, navigation, homepage, categories) it
 * nudges the storefront's `/revalidate` endpoint so ISR caches refresh within
 * seconds instead of waiting out the TTL. Both env vars must be set for the
 * push to happen; when they are not, nothing fails — the storefront's
 * time-based revalidation (30-120s) remains the safety net.
 *
 * The push is strictly fire-and-forget: a failed revalidation MUST NOT fail the
 * admin's save (content persisted successfully either way), it only means the
 * storefront serves the previous snapshot a little longer.
 */

export interface RevalidatePayload {
  /** Cache tags to revalidate (the storefront tags its CMS fetches). */
  tags: string[];
  /** Static paths to revalidate (homepage, category pages, etc). */
  paths: string[];
}

export function revalidationConfigured(): boolean {
  return Boolean(process.env.STOREFRONT_REVALIDATE_URL && process.env.STOREFRONT_REVALIDATE_SECRET);
}

export async function pushRevalidate(payload: RevalidatePayload): Promise<boolean> {
  const url = process.env.STOREFRONT_REVALIDATE_URL;
  const secret = process.env.STOREFRONT_REVALIDATE_SECRET;
  if (!url || !secret) return false;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json", "x-revalidate-secret": secret },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(5_000),
    });
    return res.ok;
  } catch {
    // Network hiccup, timeout, deployment gap — never propagate to the caller.
    return false;
  }
}
