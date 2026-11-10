import path from "node:path";
import type { NextConfig } from "next";

/**
 * Minimal Next config. The admin panel is a client-rendered console behind auth:
 * API calls go directly from the browser to the NestJS API, so no rewrites/proxies
 * are configured here.
 *
 * On Vercel (services mode) the admin service is mounted under the /admin path
 * prefix via the top-level rewrite in the root vercel.json — basePath keeps the
 * app's routes and static assets aligned with that public path.
 */
const nextConfig: NextConfig = {
  reactStrictMode: true,
  basePath: "/admin",
  // Tracing root MUST be the monorepo root, never apps/admin. With the root pinned to
  // apps/admin, Vercel's serverless file tracing excluded the workspace packages that
  // live outside apps/admin (packages/contracts etc.), so the on-demand SSR lambda for
  // dynamic routes (e.g. /products/[id], /orders/[id]) crashed with a 500 on every
  // request while statically prerendered pages kept working. Pinning to the repo root
  // keeps the same guard against stray parent lockfiles AND gives the lambda the full
  // dependency closure.
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  webpack: (config) => {
    // The product form and the rich-text editor are the admin's runtime consumers of
    // @annaadhya/utils/rich-text (stripHtml). The package's exports map points that
    // specifier at dist/rich-text.js, but a plain `next build` — exactly what the
    // Vercel admin service runs — never produces workspace dist output, so webpack
    // resolution dies with "Module not found" and the deployment fails. Alias the
    // exact specifier to the TS source: the module is pure and dependency-free, so
    // webpack/SWC compiles it straight into the bundle — no dist step, no Vercel
    // build orchestration, single source of truth.
        config.resolve.alias["@annaadhya/contracts/cms-design"] = path.resolve(
      __dirname,
      "../../packages/contracts/src/cms-design.ts",
    );
    config.resolve.alias["@annaadhya/utils/rich-text"] = path.resolve(
      __dirname,
      "../../packages/utils/src/rich-text.ts",
    );
    // The order detail page uses the shared Shiprocket tracking-URL helper (the same
    // utility the storefront's Track Order button uses) — pure and dependency-free,
    // aliased to TS source so no dist step is needed at build time.
    config.resolve.alias["@annaadhya/utils/tracking"] = path.resolve(
      __dirname,
      "../../packages/utils/src/tracking.ts",
    );
    return config;
  },
};

export default nextConfig;
