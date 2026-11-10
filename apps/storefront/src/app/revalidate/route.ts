/** On-demand cache revalidation — the API nudges this endpoint after CMS content
 *  changes (pages, navigation, homepage, categories) so ISR caches refresh within
 *  seconds instead of waiting out the TTL.
 *
 *  SECURITY: requires the shared REVALIDATE_SECRET header; the path lives outside
 *  /api/* because the platform rewrite forwards /api/(.*) to the API service.
 *  When REVALIDATE_SECRET is unset the endpoint is disabled (403) and the
 *  storefront falls back to time-based revalidation only. */
import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const ALLOWED_TAGS = new Set(["cms", "pages", "navigation", "homepage", "categories", "settings"]);

export async function POST(req: Request) {
  const secret = process.env.REVALIDATE_SECRET;
  if (!secret) {
    return NextResponse.json({ ok: false, error: "Revalidation is not configured" }, { status: 403 });
  }
  if (req.headers.get("x-revalidate-secret") !== secret) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }

  let body: { tags?: unknown; paths?: unknown };
  try {
    body = (await req.json()) as { tags?: unknown; paths?: unknown };
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid JSON body" }, { status: 400 });
  }

  const tags = Array.isArray(body.tags) ? body.tags.filter((t): t is string => typeof t === "string" && ALLOWED_TAGS.has(t)) : [];
  const paths = Array.isArray(body.paths)
    ? body.paths.filter((p): p is string => typeof p === "string" && p.startsWith("/") && !p.startsWith("//"))
    : [];

  for (const tag of tags) revalidateTag(tag);
  for (const path of paths) revalidatePath(path);

  return NextResponse.json({ ok: true, revalidated: { tags, paths } });
}
