/**
 * Probe-only dist — publish-pipeline bisect switch (NOT part of normal builds).
 *
 * Replaces apps/api/dist with a few-file, ZERO-dependency stub: an http server
 * that binds PORT in the first milliseconds and answers every path with an
 * explicit 200 JSON. All entry-file conventions are covered (main.js, boot.js,
 * src/boot.js, src/main.js) so the panel's Entry File setting cannot matter.
 * Run AFTER a normal build only when diagnosing the platform's publish step:
 *
 *   pnpm run build && pnpm run dist:probe
 *
 * Interpretation:
 *   - probe dist deploys fine -> the publish pipeline works; the failing
 *     variable is the full dist's node_modules (size, file count, or install
 *     semantics applied to it by the platform).
 *   - probe dist ALSO fails   -> publish/config-side platform failure, with
 *     app code, dependencies and artifact size eliminated as causes.
 */
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const scriptDir = dirname(fileURLToPath(import.meta.url));
const dist = join(scriptDir, "..", "dist");

const STUB = `/**
 * Probe-only deployment stub - publish-pipeline bisect (no app code, no deps).
 * Serves an explicit 200 on every path so the deploy probe can only succeed.
 */
const http = require("node:http");
const port = Number(process.env.PORT) || 3000;
http
  .createServer((req, res) => {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
    res.end(
      JSON.stringify({
        ok: true,
        status: "probe-only-bisect",
        build: "probe-bisect",
        path: req && req.url,
        note: "This is the zero-dependency bisect deployment, not the real API.",
      }),
    );
  })
  .listen(port, "0.0.0.0", () => console.log("[probe-dist] serving on :" + port));
`;

if (!existsSync(dist)) mkdirSync(dist, { recursive: true });
for (const entry of readdirSync(dist)) {
  rmSync(join(dist, entry), { recursive: true, force: true });
}

writeFileSync(join(dist, "main.js"), STUB);
writeFileSync(join(dist, "boot.js"), STUB);
mkdirSync(join(dist, "src"));
writeFileSync(join(dist, "src", "boot.js"), STUB);
writeFileSync(join(dist, "src", "main.js"), STUB);

writeFileSync(
  join(dist, "package.json"),
  JSON.stringify(
    {
      name: "annaadhya-api-probe",
      version: "0.1.0",
      private: true,
      type: "commonjs",
      main: "main.js",
      scripts: { start: "node main.js" },
      annaadhya: {
        build: "probe-bisect",
        entryCandidates: ["main.js", "boot.js", "src/boot.js", "src/main.js"],
      },
    },
    null,
    2,
  ) + "\n",
);

writeFileSync(
  join(dist, "package-lock.json"),
  JSON.stringify(
    {
      name: "annaadhya-api-probe",
      version: "0.1.0",
      lockfileVersion: 3,
      requires: true,
      packages: { "": { name: "annaadhya-api-probe", version: "0.1.0", license: "UNLICENSED" } },
    },
    null,
    2,
  ) + "\n",
);

console.log(
  "[probe-dist] dist replaced with zero-dependency probe stub " +
    "(main.js, boot.js, src/boot.js, src/main.js, package.json, package-lock.json)",
);
