/**
 * Zero-dependency .env auto-load for local development, built on Node's built-in
 * process.loadEnvFile (Node >= 20.12; the runtime is probed, older versions degrade
 * gracefully). Makes the documented "cp .env.example .env, then run" flow work with
 * no shell export/set incantations — Windows CMD users especially.
 *
 * Semantics (verified against Node 24, matches documented --env-file behavior):
 *  - the first EXISTING candidate path wins; later candidates are never read
 *  - variables already present in the real environment are NEVER overridden, so
 *    one-off shell overrides (`export`, CMD `set`, PowerShell `$env:`) keep priority
 *  - double-quoted values are unquoted and their \n escapes are EXPANDED to real newlines
 *    by Node's parser (verified on Node 24); unquoted values keep literal backslash-n.
 *    Both end up as a valid PEM downstream: parseFirestoreCredentials converts literal
 *    \n to real newlines, and real newlines pass through that replace() untouched.
 *  - unparseable lines are skipped by Node's parser, not fatal — missing variables
 *    surface downstream as explicit unconfigured states (env.ts Zod gate, the seed
 *    CLI's credential check), never as silent fake success
 *
 * Returns the loaded path so callers can log WHICH file was read. Values are never
 * echoed. No candidate exists -> silent no-op (CI/serverless always take that path;
 * the gitignored file never ships in deployments).
 */
import { existsSync } from "node:fs";
import { resolve } from "node:path";

type LoadEnvFile = (path?: string) => void;

export function loadDotEnvIfPresent(candidates: string[]): string | null {
  const filePath = candidates.map((candidate) => resolve(candidate)).find((p) => existsSync(p));
  if (!filePath) return null;

  // Structural probe instead of trusting @types/node: the method is optional at
  // runtime on the supported Node floor (20.9 - 20.11 lack it).
  const loadEnvFile = (process as unknown as { loadEnvFile?: LoadEnvFile }).loadEnvFile;
  if (typeof loadEnvFile !== "function") {
    console.warn(
      `[env] ${filePath} found, but this Node runtime lacks process.loadEnvFile (needs Node >= 20.12). ` +
        "Set the variables via the shell (export / set / $env:) or upgrade Node.",
    );
    return null;
  }

  loadEnvFile.call(process, filePath);
  return filePath;
}
