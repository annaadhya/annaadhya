#!/usr/bin/env node
/**
 * standalone-postbuild.mjs — packs `next build` output:"standalone" into the
 * single-entry shape Hostinger's managed Node.js runtime expects.
 *
 * Hostinger executes one entry file from the configured Output Directory (it
 * does not run `next start`). Two adjustments are needed for a monorepo:
 *
 *   1. Next emits .next/standalone/apps/<app>/server.js when the tracing root
 *      is the monorepo root. Hostinger looks for server.js directly inside the
 *      Output Directory, so this script flattens .next/standalone/apps/<app>/*
 *      up to .next/standalone/ (merging the inner and outer node_modules trees)
 *      and removes the mirrored apps/ subtree.
 *   2. Standalone output never includes client assets: .next/static and the
 *      public/ folder are copied into the standalone root explicitly.
 *
 * Vercel ignores output:"standalone", so on Vercel this is a no-op: when no
 * .next/standalone directory exists the script logs and exits 0 (it must never
 * fail a non-Hostinger build). App-agnostic on purpose — the same file lives
 * in apps/storefront/scripts and apps/admin/scripts.
 */
import { cpSync, existsSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const appRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const standalone = path.join(appRoot, ".next", "standalone");
const tag = `[standalone-postbuild:${path.basename(appRoot)}]`;

if (!existsSync(standalone)) {
  console.log(`${tag} no .next/standalone output — nothing to pack (Vercel/dev build). Skipping.`);
  process.exit(0);
}

// 1. Flatten the monorepo mirror: .next/standalone/apps/<app>/* -> .next/standalone/
const appName = path.basename(appRoot); // e.g. "storefront"
const appsDirName = path.basename(path.dirname(appRoot)); // e.g. "apps"
const mirrored = path.join(standalone, appsDirName, appName);
if (existsSync(mirrored)) {
  // fs.cpSync merges directory trees: inner node_modules files land alongside
  // the outer hoisted ones without clobbering siblings.
  cpSync(mirrored, standalone, { recursive: true, force: true });
  rmSync(path.join(standalone, appsDirName), { recursive: true, force: true });
  console.log(`${tag} flattened ${path.relative(appRoot, mirrored)} -> ${path.relative(appRoot, standalone)}`);
}

// 2. Client static assets (build-time hashed chunks the runtime never re-emits)
const staticSrc = path.join(appRoot, ".next", "static");
if (existsSync(staticSrc)) {
  cpSync(staticSrc, path.join(standalone, ".next", "static"), { recursive: true, force: true });
  console.log(`${tag} copied .next/static -> standalone/.next/static`);
} else {
  console.error(`${tag} WARNING: .next/static missing — client assets will 404`);
}

// 3. public/ (brand imagery, icons, robots-adjacent assets)
if (existsSync(path.join(appRoot, "public"))) {
  cpSync(path.join(appRoot, "public"), path.join(standalone, "public"), { recursive: true, force: true });
  console.log(`${tag} copied public -> standalone/public`);
}

// 4. Sanity: the runtime's entry file must sit at the output-dir root
const serverJs = path.join(standalone, "server.js");
if (!existsSync(serverJs)) {
  console.error(`${tag} ERROR: standalone/server.js not found after packing`);
  process.exit(1);
}
const mb = (p) => `${(statSync(p).size / 1024 / 1024).toFixed(1)} MB`;
console.log(`${tag} ready: ${path.relative(appRoot, standalone)}/server.js (${mb(serverJs)})`);
