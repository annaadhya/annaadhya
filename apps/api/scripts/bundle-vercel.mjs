/**
 * Generates the self-contained deployable entry for Vercel.
 *
 * Bundles dist/src/boot.js (compiled NestJS bootstrap) plus the entire app graph
 * into ONE CommonJS file written to BOTH src/.generated-main.js and
 * dist/src/.generated-main.js, so the require("./.generated-main.js") in
 * src/main.ts resolves regardless of which entry convention the platform uses.
 * The platform's function bundler therefore only has to handle relative imports
 * and node builtins — no bare-specifier resolution, which it cannot do reliably
 * in this pnpm workspace.
 *
 * Externals: the Firebase/Google stack. firebase-admin lazily loads .proto and
 * other data files from disk inside node_modules, so it must stay a runtime
 * require; the platform's file tracer includes those files from the hoisted
 * (real-file) node_modules produced by node-linker=hoisted in .npmrc.
 *
 * swagger-ui-dist is external for the same class of reason: @nestjs/swagger
 * serves the Swagger UI's static assets (swagger-ui-bundle.js, .css, ...) via
 * express.static, resolving the directory at RUNTIME through
 * require('swagger-ui-dist/absolute-path.js') — which returns path.resolve
 * (__dirname of the swagger-ui-dist package). If rolldown inlines that module,
 * __dirname silently becomes the directory of THIS bundle file, express.static
 * mounts a nonexistent path, and /api/docs renders a white page (the HTML and
 * /api/docs-json need no assets, so they keep working — exactly the symptom to
 * watch for). Keeping it external preserves both the runtime resolution AND the
 * file tracer's package-level inclusion of node_modules/swagger-ui-dist.
 *
 * Stubs: @nestjs/microservices and @nestjs/websockets are optional peers of
 * @nestjs/core that this HTTP-only API never uses. NestFactory/NestApplication
 * reference them via lazy loadPackage() requires, which would otherwise emit
 * noisy UNRESOLVED_IMPORT warnings on every build. Replacing them with empty
 * stub modules keeps the graph resolvable and warning-free; the stubbed code
 * paths are never invoked by this application.
 *
 * Run AFTER `pnpm run build` (needs dist/). Invoked from vercel.json buildCommand.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { rolldown } from "rolldown";

const EXTERNAL = [
  /^firebase-admin(\/.+)?$/,
  /^@google-cloud\//,
  /^google-gax(\/.+)?$/,
  /^@grpc\//,
  /^google-auth-library(\/.+)?$/,
  /^googleapis-common(\/.+)?$/,
  /^gaxios(\/.+)?$/,
  /^gtoken(\/.+)?$/,
  // Swagger UI static assets are served from disk at runtime (see header note).
  /^swagger-ui-dist(\/.+)?$/,
];

// Optional NestJS transports — replaced by empty stub modules so the shipped
// loadPackage() call sites resolve cleanly. Never executed by this app.
const STUBBED = /^@nestjs\/(microservices|websockets)(\/.+)?$/;

const bundle = await rolldown({
  input: new URL("../dist/src/boot.js", import.meta.url).pathname,
  platform: "node",
  external: (id) => EXTERNAL.some((re) => re.test(id)),
  plugins: [
    {
      name: "stub-optional-nest-transports",
      resolveId(id) {
        if (STUBBED.test(id)) return `\0stub:${id}`;
        return null;
      },
      load(id) {
        if (id.startsWith("\0stub:")) return { code: "module.exports = {};" };
        return null;
      },
    },
  ],
});

const result = await bundle.generate({
  format: "cjs",
  codeSplitting: false,
  exports: "auto",
});

const code = result.output[0].code;
for (const target of [
  new URL("../src/.generated-main.js", import.meta.url).pathname,
  new URL("../dist/src/.generated-main.js", import.meta.url).pathname,
]) {
  mkdirSync(dirname(target), { recursive: true });
  writeFileSync(target, code);
  console.log(`[bundle-vercel] wrote ${target}`);
}
