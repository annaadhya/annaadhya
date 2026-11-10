/**
 * Self-contained dist assembler for Hostinger managed Node.js hosting.
 *
 * Hostinger runs the deployed app from the OUTPUT DIRECTORY (apps/api/dist):
 * whatever that folder contains at the end of the build is the entire runtime.
 * tsc output alone (launcher + dist/src/**) cannot boot there - the compiled
 * bootstrap requires @nestjs/*, firebase-admin, @annaadhya/* etc., and none of
 * that resolves inside dist. This mirrors the storefront's working shape:
 * Next standalone ships its own node_modules, so we ship ours too.
 *
 * How: `pnpm deploy --prod` materializes a pruned, flat, real-file
 * node_modules (workspace packages packed in, no symlinks) into a temp dir;
 * we move that node_modules into dist and remove the temp. Result:
 *
 *   apps/api/dist/main.js          (launcher: require("./src/boot.js"))
 *   apps/api/dist/src/**           (compiled bootstrap)
 *   apps/api/dist/node_modules/**  (prod deps, hoisted real files)
 *
 * Skipped on Vercel (its pipeline bundles its own entrypoint via
 * .generated-main.js) or when ASSEMBLE_DIST=0. Runs after tsc +
 * emit-dist-main via the package build script.
 */
import { cpSync, existsSync, readdirSync, renameSync, rmSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const apiDir = resolve(scriptDir, "..");
const dist = join(apiDir, "dist");
const repoRoot = resolve(apiDir, "..", "..");
const tmp = join(repoRoot, ".api-deploy-tmp");

if (process.env.VERCEL || process.env.ASSEMBLE_DIST === "0") {
  console.log("[assemble-dist] skipped (Vercel pipeline or ASSEMBLE_DIST=0)");
  process.exit(0);
}

if (!existsSync(join(dist, "src", "boot.js"))) {
  console.error("[assemble-dist] dist/src/boot.js missing - run tsc first");
  process.exit(1);
}

rmSync(tmp, { recursive: true, force: true });

console.log(
  `[assemble-dist] pnpm deploy --prod -> ${tmp} (installs pruned prod deps; ~30-60s)`,
);
const res = spawnSync(
  "pnpm",
  ["--filter", "@annaadhya/api", "deploy", "--prod", tmp],
  { cwd: repoRoot, stdio: "inherit" },
);
if (res.status !== 0) {
  console.error("[assemble-dist] pnpm deploy failed");
  process.exit(res.status ?? 1);
}

const srcNodeModules = join(tmp, "node_modules");
if (!existsSync(srcNodeModules)) {
  console.error("[assemble-dist] deploy produced no node_modules");
  process.exit(1);
}

rmSync(join(dist, "node_modules"), { recursive: true, force: true });
try {
  renameSync(srcNodeModules, join(dist, "node_modules"));
} catch {
  cpSync(srcNodeModules, join(dist, "node_modules"), { recursive: true });
  rmSync(srcNodeModules, { recursive: true, force: true });
}
rmSync(tmp, { recursive: true, force: true });

// Sanitize for the platform copy. pnpm deploy materializes top-level packages
// as real dirs but leaves (a) a vestigial .pnpm virtual store and (b) .bin
// symlink shims. The virtual store is dead weight (top level is flat real
// files, verified by a zero-symlink census outside .bin), and .bin shims are
// CLI launchers nothing requires at runtime. Strip both so the tree is 100%
// real files - it survives any copy semantics (preserving or dereferencing).
const nm = join(dist, "node_modules");
rmSync(join(nm, ".pnpm"), { recursive: true, force: true });
let sanitized = 0;
  (function walk(d) {
    for (const e of readdirSync(d, { withFileTypes: true })) {
      const p = join(d, e.name);
      if (e.name === ".bin" && e.isDirectory()) {
        rmSync(p, { recursive: true, force: true });
        sanitized++;
      } else if (e.isSymbolicLink()) {
        rmSync(p, { force: true });
        sanitized++;
      } else if (e.isDirectory()) {
        walk(p);
      }
    }
  })(nm);

let symlinks = 0;
(function walk(d) {
  for (const e of readdirSync(d, { withFileTypes: true })) {
    if (e.isSymbolicLink()) symlinks++;
    else if (e.isDirectory()) walk(join(d, e.name));
  }
})(nm);
if (symlinks > 0) {
  console.error(`[assemble-dist] ${symlinks} symlinks survived sanitization`);
  process.exit(1);
}

console.log(
  `[assemble-dist] dist/node_modules: ${readdirSync(nm).length} top-level entries, ` +
    `${sanitized} .bin/symlink artifacts stripped, ${symlinks} symlinks left`,
);
console.log("[assemble-dist] done - dist is self-contained, real files only");
