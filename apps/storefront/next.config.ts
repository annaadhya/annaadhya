import path from "node:path";
import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Hostinger's managed Node.js runtime executes a single entry file from the
  // configured Output Directory (it does not run `next start`), so the build
  // must emit a self-contained standalone server. Vercel ignores this option,
  // so the services-mode deployment is unaffected.
  output: "standalone",
  // The tracing root MUST be the monorepo root, never the app dir — same guard
  // as the admin config: keeps the standalone bundle's dependency closure
  // complete for files that live outside apps/storefront (workspace packages).
  outputFileTracingRoot: path.join(__dirname, "..", ".."),
  images: {
    // Brand imagery is pre-optimized WebP in /public/images; product imagery is
    // SVG placeholders (Cloudinary photography later). The Vercel image optimizer
    // (/_next/image) is unreachable in this services-mode deployment — the root
    // catch-all rewrite forwards it to the storefront app, which 404s — so
    // next/image renders direct, already-sized sources instead.
    unoptimized: true,
    dangerouslyAllowSVG: true,
    contentDispositionType: "inline",
  },
  webpack: (config) => {
    // The PDP is the one runtime consumer of @annaadhya/utils/rich-text (the
    // dependency-free rich-text sanitiser). The package's exports map points that
    // specifier at dist/rich-text.js, but a plain `next build` — exactly what the
    // Vercel storefront service runs — never produces workspace dist output, so
    // webpack resolution dies with "Module not found" and the deployment fails.
    // Every other workspace import in this app is type-only (erased at compile
    // time), which is why this only surfaced when the rich-text work landed.
    // Alias the exact specifier to the TS source: the module is pure and
    // dependency-free, so webpack/SWC compiles it straight into the bundle —
    // no dist step, no Vercel build orchestration, single source of truth.
        config.resolve.alias["@annaadhya/contracts/cms-design"] = path.resolve(
      __dirname,
      "../../packages/contracts/src/cms-design.ts",
    );
    config.resolve.alias["@annaadhya/utils/rich-text"] = path.resolve(
      __dirname,
      "../../packages/utils/src/rich-text.ts",
    );
    // The order pages use the shared Shiprocket tracking-URL helper — same pure,
    // dependency-free source-alias treatment as rich-text above.
    config.resolve.alias["@annaadhya/utils/tracking"] = path.resolve(
      __dirname,
      "../../packages/utils/src/tracking.ts",
    );
    return config;
  },
};

export default nextConfig;
