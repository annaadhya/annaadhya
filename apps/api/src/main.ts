/**
 * Platform entry shim.
 *
 * The deployable payload is generated at build time by scripts/bundle-vercel.mjs:
 * dist/src/boot.js (the real NestJS bootstrap) is bundled with rolldown into a
 * single self-contained file at src/.generated-main.js, with the Firebase/Google
 * stack kept external (it loads .proto data files from disk at runtime and is
 * included by the platform's file tracer from the hoisted node_modules).
 *
 * Why: the platform's function bundler could not resolve bare-specifier imports
 * from the pnpm workspace (boot crashed with "Cannot find module
 * 'reflect-metadata'" even with a hoisted layout). Feeding it one dependency-free
 * file removes its resolver from the equation entirely.
 *
 * require() (not import) is deliberate: the generated file does not exist at
 * typecheck time, and require() is not statically resolved by tsc.
 */

/**
 * Platform entrypoint detection: vercel/vercel packages/backends/src/
 * find-entrypoint.ts scans the entrypoint candidates' SOURCE text for
 * `from|require|import "@nestjs/core"` and rejects the file otherwise
 * ("No entrypoint found which imports nestjs"). This type-only import satisfies
 * that scan. `import type` is erased at compile time, so the platform bundler
 * never resolves @nestjs/core — the generated bundle below remains the sole
 * runtime dependency graph.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { NestFactory } from "@nestjs/core";

// eslint-disable-next-line @typescript-eslint/no-require-imports
require("./.generated-main.js");
