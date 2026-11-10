import type { MetadataRoute } from "next";

export default function robots(): MetadataRoute.Robots {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
  const isProduction = process.env.NEXT_PUBLIC_SITE_URL?.startsWith("https://") ?? false;

  return {
    // Staging/preview deployments must not be indexed.
    rules: isProduction
      ? [{ userAgent: "*", allow: "/", disallow: ["/account", "/checkout", "/cart", "/wishlist"] }]
      : [{ userAgent: "*", disallow: "/" }],
    sitemap: isProduction ? `${base}/sitemap.xml` : undefined,
  };
}
