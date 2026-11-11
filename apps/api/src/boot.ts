/** NestJS bootstrap — Swagger/OpenAPI, global prefix, CORS, raw-body webhooks, lifecycle jobs. */
// Every app-level module is imported dynamically inside boot() so that ANY failure —
// including cold-start import crashes inside the serverless bundle — is caught and
// reported over HTTP, instead of dying as a bare 500 FUNCTION_INVOCATION_FAILED that
// carries no diagnostic information. Static imports are limited to node builtins and
// type-only imports (erased at compile time).
import * as http from "node:http";
import * as fs from "node:fs";
import * as os from "node:os";
import { resolve } from "node:path";
import type { DataClient } from "@annaadhya/data-core";

/**
 * Entrypoint-scanner marker (mirrors src/main.ts): platform entrypoint scanners
 * (Vercel find-entrypoint) reject candidate files whose source text lacks an
 * @nestjs/core import. Type-only, so it is erased at compile time and the
 * runtime dependency graph stays fully dynamic inside boot().
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import type { NestFactory } from "@nestjs/core";

const bootLog: string[] = [];
// Bumped with each diagnostic iteration; appears first in every boot report so a
// live deployment's exact build is identifiable from outside the dashboard.
const DEPLOY_BUILD = "v14-publish-hygiene";
bootLog.push(`build: ${DEPLOY_BUILD}`);

/**
 * Vercel keeps its proven flow (configure + app.listen at boot end; its bundler
 * wraps this module into a serverless handler). Managed-hosting deploys
 * (Hostinger) get the instant-listen flow below.
 */
const IS_VERCEL = Boolean(process.env.VERCEL);

// Vercel's Node runtime probes the PORT it injects; fall back to 3000 exactly like
// Vercel's documented NestJS example (process.env.PORT ?? 3000). A mismatch here
// would look like FUNCTION_INVOCATION_FAILED with no error in the logs.
const port = Number(process.env.PORT) || 3000;

/**
 * Directory census for the boot report: when the platform's publish step
 * truncates or transforms the artifact (e.g. packing the output dir with
 * npm-pack semantics, which always drops node_modules), the entry chain dies
 * on MODULE_NOT_FOUND before any HTTP server exists. The catch-path report
 * still runs, so a compact census of the process working directory and the
 * entry directory becomes the definitive answer about what the platform
 * actually published - instead of another blind fix round.
 */
function dirCensus(dir: string, label: string, withDeps = true): string[] {
  const lines: string[] = [`${label}: ${dir}`];
  try {
    const names = fs.readdirSync(dir);
    lines.push(`${label} top-level (${names.length} entries): ${names.slice(0, 40).join(", ")}${names.length > 40 ? " ..." : ""}`);
    const nm = resolve(dir, "node_modules");
    if (withDeps) {
      lines.push(
        fs.existsSync(nm)
          ? `${label}/node_modules: PRESENT (${fs.readdirSync(nm).length} top-level packages)`
          : `${label}/node_modules: MISSING <- runtime deps would not resolve`,
      );
    }
    const srcDir = resolve(dir, "src");
    if (fs.existsSync(srcDir)) {
      const srcFiles = fs.readdirSync(srcDir);
      lines.push(`${label}/src: PRESENT (${srcFiles.slice(0, 20).join(", ")}${srcFiles.length > 20 ? " ..." : ""})`);
    }
  } catch (e) {
    lines.push(`${label}: unreadable (${e instanceof Error ? e.message : String(e)})`);
  }
  return lines;
}

/**
 * File-based boot oracle for managed builders whose stderr.log is not exposed:
 * every boot writes annaadhya-boot-report.txt into the process working
 * directory (fallback: os.tmpdir()) with the exact verdict, which env vars are
 * SET vs unset (values never printed for secrets), and the boot progress log.
 * The report path is always echoed to stderr as well. Presence of the file at
 * all proves the process started; its content names the failing boot step.
 * v13: a "starting" report is written BEFORE any heavy import, so a process
 * killed mid-load (OOM, platform watchdog) still leaves a trace.
 */
const REPORT_FILE = "annaadhya-boot-report.txt";
const REPORTED_ENV_KEYS = [
  "NODE_ENV",
  "DATA_PROVIDER",
  "PORT",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_CLIENT_EMAIL",
  "FIREBASE_PRIVATE_KEY",
  "FIRESTORE_DATABASE_ID",
  "ADMIN_SETUP_KEY",
  "PAYMENT_PROVIDER",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
  "CORS_ORIGINS",
] as const;

function writeBootReport(status: string, extra: string[] = []): void {
  const envLines = REPORTED_ENV_KEYS.map((key) => {
    const value = process.env[key];
    if (value === undefined || value === "") return `${key}: unset`;
    if (key === "CORS_ORIGINS") {
      return `${key}: ${value.split(",").map((o) => o.trim()).join(" | ")}`;
    }
    if (key === "FIREBASE_PRIVATE_KEY" || key === "ADMIN_SETUP_KEY" || key === "RAZORPAY_KEY_SECRET") {
      return `${key}: SET (${value.length} chars)`;
    }
    return `${key}: ${value}`;
  });
  const body = [
    `Annaadhya API boot report - ${status}`,
    `time: ${new Date().toISOString()}`,
    `build: ${DEPLOY_BUILD}`,
    `cwd: ${process.cwd()}`,
    `entry dir: __dirname=${typeof __dirname === "string" ? __dirname : "(esm)"}`,
    `argv: ${JSON.stringify(process.argv.slice(0, 4))}`,
    `PORT injected by platform: ${process.env.PORT ?? "(not set)"}`,
    "",
    "environment (secret values hidden):",
    ...envLines,
    "",
    "published directory census:",
    ...dirCensus(process.cwd(), "cwd"),
    ...(typeof __dirname === "string" && resolve(__dirname) !== resolve(process.cwd())
      ? dirCensus(__dirname, "entry dir", false)
      : []),
    "",
    "boot progress:",
    ...bootLog,
    "",
    ...extra,
  ].join("\n") + "\n";
  console.error(`[boot] report (${status}):\n${body}`);
  for (const dir of [process.cwd(), os.tmpdir()]) {
    try {
      const target = resolve(dir, REPORT_FILE);
      fs.writeFileSync(target, body);
      console.error(`[boot] report written: ${target}`);
      return;
    } catch {
      // read-only or missing - try the next location
    }
  }
}

async function step<T>(name: string, fn: () => Promise<T>): Promise<T> {
  try {
    const result = await fn();
    bootLog.push(`ok: ${name}`);
    return result;
  } catch (err) {
    bootLog.push(`FAILED: ${name} -> ${err instanceof Error ? err.message : String(err)}`);
    throw err;
  }
}

/**
 * Instant listener (managed deploys only): a plain http.Server binds the port
 * in the first milliseconds of process start - before a single app module is
 * imported - and answers the deploy probe with HTTP 200 while the real app
 * loads. Once Nest is initialized, its Express instance is mounted onto this
 * same server (handler swap, zero port churn), so the platform's probe window
 * can never expire just because the module graph takes a while on cold disk.
 *
 * Modes: "starting" serves an explicit 200 JSON naming the build and the boot
 * progress so far; "failed" serves the boot-failure explanation (200 ON
 * PURPOSE - managed builders mark the whole deployment failed on any non-2xx).
 */
type ServerMode = { kind: "starting" } | { kind: "ready" } | { kind: "failed"; body: string };
let serverMode: ServerMode = { kind: "starting" };

function lightHandler(_req: http.IncomingMessage, res: http.ServerResponse): void {
  // 200 in both modes ON PURPOSE: managed builders (Hostinger) probe the app
  // during the deploy step and mark the entire deployment failed on a non-2xx.
  // "starting" body says ok:true with status:"starting"; after a boot failure
  // the body carries ok:false + the exact reason and fix.
  res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
  if (serverMode.kind === "failed") {
    res.end(serverMode.body);
    return;
  }
  res.end(
    JSON.stringify({
      ok: true,
      status: "starting",
      build: DEPLOY_BUILD,
      bootProgress: bootLog,
      hint: "API routes appear here as soon as initialization completes (this response is served by the instant listener)",
    }),
  );
}

const lightServer = http.createServer(lightHandler);
lightServer.on("error", (e) => {
  console.error("[boot] instant listener failed:", e);
  bootLog.push(`FAILED: instant listener on :${port} -> ${e instanceof Error ? e.message : String(e)}`);
  writeBootReport("FAILED");
});

async function boot(): Promise<void> {
  // t=0 trace: report BEFORE any heavy import. If this file exists but the
  // process dies later, the report names how far boot got; if it never
  // appears at all, the platform never actually executed the entry file.
  writeBootReport("starting");

  if (!IS_VERCEL) {
    await step(`instant listener on :${port} (answers probes before app load)`, async () => {
      await new Promise<void>((resolveListen, rejectListen) => {
        lightServer.once("listening", () => resolveListen());
        lightServer.once("error", rejectListen);
        lightServer.listen(port, "0.0.0.0");
      });
    });
  }

  // Local .env auto-load (gitignored, absent on Vercel -> silent no-op). MUST run before
  // any module that reads process.env is imported. Real environment variables keep
  // precedence over file values, so shell `export`/`set` overrides still win.
  const { loadDotEnvIfPresent } = await step("import @annaadhya/utils", () => import("@annaadhya/utils"));
  const loadedEnvFile = await step("load local .env (if present)", async () =>
    loadDotEnvIfPresent([resolve(process.cwd(), ".env")]),
  );
  if (loadedEnvFile) console.info(`[env] loaded ${loadedEnvFile}`);

  // reflect-metadata MUST evaluate before any module whose decorators run at import.
  await step("import reflect-metadata", () => import("reflect-metadata"));

  const NestFactory = await step("import @nestjs/core", async () => (await import("@nestjs/core")).NestFactory);
  const { AppModule } = await step("import AppModule (full DI graph)", () => import("./app.module"));
  const { loadEnv } = await step("import config/env", () => import("./config/env"));
  const { applySeed, InMemoryDataClient } = await step("import @annaadhya/data-core", () =>
    import("@annaadhya/data-core"),
  );
  const { DATA_CLIENT } = await step("import data tokens", () => import("./data/data.module"));
  const { CHECKOUT_SWEEPER } = await step("import app tokens", () => import("./app.tokens"));

  const env = await step("validate environment (loadEnv)", async () => loadEnv());

  const app = await step("NestFactory.create", () =>
    NestFactory.create(AppModule, {
      rawBody: true, // required for webhook signature verification
      logger: ["error", "warn", "log"],
    }),
  );

  // Platform deploy pipelines commonly health-check the site root ("/") after
  // starting the process; with the global prefix set, the Nest router would
  // 404 there. Serve a cheap 200 so a root probe can never fail a deployment.
  async function configurePrefixCorsRootProbe(): Promise<void> {
    app.setGlobalPrefix("api/v1", { exclude: ["api/docs", "api/docs-json"] });

    app.enableCors({
      origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
      credentials: true,
    });

    const expressApp = app.getHttpAdapter().getInstance() as {
      get(
        path: string,
        handler: (
          req: unknown,
          res: { status(code: number): { json(body: unknown): void } },
        ) => void,
      ): void;
    };
    expressApp.get("/", (_req, res) => {
      res.status(200).json({
        ok: true,
        service: "annaadhya-api",
        hint: "/api/v1/health",
        // Ops diagnostics (non-sensitive): the injected listen port is needed for
        // same-box loopback calls between our Node apps; the build tag identifies
        // which dist is live. Everything here is already observable externally.
        diag: {
          port: process.env.PORT ?? null,
          nodeEnv: process.env.NODE_ENV ?? null,
          build: DEPLOY_BUILD,
        },
      });
    });
  }

  // Swagger — the API contract surface for both frontends. Non-fatal by design:
  // docs are secondary to serving traffic, and setup is deferred behind the
  // handler swap on managed deploys so the real routes go live first.
  async function setupSwagger(): Promise<void> {
    const { DocumentBuilder, SwaggerModule } = await import("@nestjs/swagger");
    const swaggerConfig = new DocumentBuilder()
      .setTitle("Annaadhya Products API")
      .setDescription(
        "REST API for the Annaadhya e-commerce platform. " +
          "Authentication: Firebase ID tokens (mock-mode dev tokens in development). " +
          "All amounts are integer paise.",
      )
      .setVersion("1.0.0")
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerConfig);
    SwaggerModule.setup("api/docs", app, document);
  }

  if (IS_VERCEL) {
    // Vercel serverless flow: fully configure (incl. Swagger), then listen -
    // byte-compatible with the previously verified pipeline.
    await step("configure prefix/CORS/Swagger", async () => {
      await configurePrefixCorsRootProbe();
      await setupSwagger();
    });
    await step(`listen on :${port}`, () => app.listen(port, "0.0.0.0"));
  } else {
    // Managed-deploy flow: initialize without listening, then mount the
    // initialized Express instance onto the already-listening instant server.
    await step("configure prefix/CORS/root probe", configurePrefixCorsRootProbe);
    await step("init Nest app (routes ready, no listen)", () => app.init());
    await step("mount Nest onto instant listener (handler swap)", async () => {
      const expressApp = app.getHttpAdapter().getInstance() as unknown as http.RequestListener;
      lightServer.removeAllListeners("request");
      lightServer.on("request", expressApp);
      serverMode = { kind: "ready" };
    });

    // Swagger after the swap, fire-and-forget: /api/docs appearing a beat
    // later is preferable to delaying the first serving instant.
    void setupSwagger().catch((err: unknown) => {
      console.warn("[boot] Swagger setup failed:", err instanceof Error ? err.message : err);
    });
  }

  // CMS: ensure the built-in storefront pages exist (idempotent — never overwrites
  // existing docs). Runs for every provider so a fresh deployment serves the
  // shipped page content through the CMS without a manual seeding step.
  // Fire-and-forget on purpose: serverless cold starts must not wait on Firestore
  // round-trips (a blocked init shows up as FUNCTION_INVOCATION_FAILED). The admin
  // pages list re-runs ensureDefaults lazily, so a skipped boot pass self-heals.
  void (async () => {
    try {
      const { PagesService } = await import("./modules/content/pages.service");
      const pages = app.get(PagesService);
      await pages.ensureDefaults();
    } catch (err) {
      console.warn("[cms] Built-in page seeding failed:", err instanceof Error ? err.message : err);
    }
  })();

  // Mock-mode convenience: auto-seed the in-memory provider so the demo store is usable instantly.
  if (env.DATA_PROVIDER === "memory") {
    try {
      const data = app.get<DataClient>(DATA_CLIENT);
      if (data instanceof InMemoryDataClient) {
        const productCount = await data.count("products");
        if (productCount === 0) {
          const report = await applySeed(data);
          console.info(
            `[mock-mode] Seeded demo dataset: ${report.counts.products} products, ${report.counts.variants} variants, ${report.counts.orders} demo orders.`,
          );
        }
      }
    } catch (err) {
      console.warn("[mock-mode] Auto-seed failed:", err instanceof Error ? err.message : err);
    }
  }

  // Reservation expiry sweeper (also callable via admin endpoint)
  const checkout = app.get(CHECKOUT_SWEEPER) as { releaseExpiredReservations(): Promise<unknown> } | undefined;
  if (checkout) {
    setInterval(() => {
      checkout.releaseExpiredReservations().catch((err) => {
        console.warn("[reservations] expiry sweep failed:", err instanceof Error ? err.message : err);
      });
    }, 5 * 60 * 1000).unref?.();
  }

  console.info(`Annaadhya API serving on :${port} (prefix /api/v1, docs at /api/docs)`);
  console.info(
    `Mode: provider=${env.DATA_PROVIDER} auth=${env.firebaseConfigured ? "firebase" : "mock-dev-tokens"} payments=${env.razorpayConfigured ? "razorpay" : "mock"}${env.isProduction ? " PRODUCTION" : " (sandbox)"}`,
  );

  writeBootReport("ok");
}

/**
 * Boot-error visibility: any failure during boot (bad env, DI failure, import crash,
 * listen failure) still leaves the port bound and reports the exact reason plus boot
 * progress over HTTP. Deliberately minimal: step log + message + first stack frames,
 * no env values echoed back.
 */
boot().catch((err: unknown) => {
  const message = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
  const stack = err instanceof Error ? (err.stack ?? "").split("\n").slice(1, 6).join("\n") : "";
  const body = JSON.stringify({
    ok: false,
    bootFailed: true,
    build: DEPLOY_BUILD,
    error: message,
    bootProgress: bootLog,
    fix:
      "Set the deployment env vars (NODE_ENV, DATA_PROVIDER, FIREBASE_PROJECT_ID, " +
      "FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY, ADMIN_SETUP_KEY, RAZORPAY_*, " +
      "CORS_ORIGINS) and redeploy. Diagnostics: annaadhya-boot-report.txt in the " +
      "app working directory (fallback /tmp).",
  });
  writeBootReport("FAILED", [message, stack]);

  if (IS_VERCEL || !lightServer.listening) {
    // Vercel never had the instant listener; managed deploys only need the
    // fallback when the instant listener itself failed to bind.
    const server = http.createServer((_req, res) => {
      // HTTP 200 ON PURPOSE. Managed builders (Hostinger) probe the app during
      // the deploy step and mark the entire deployment failed on a non-2xx, so
      // a boot failure shows up only as an opaque "Deployment failed
      // unexpectedly" with zero diagnostics. Serving an explicit ok:false
      // explanation lets the deployment COMPLETE - the domain itself then names
      // the exact missing configuration. Real routes stay non-functional until
      // the env problem is fixed; this body says so on every path.
      res.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      res.end(body);
    });
    server.on("error", (e) => console.error("[boot] error-report server failed:", e));
    server.listen(port, "0.0.0.0");
    return;
  }

  // Managed deploy with a live instant listener: flip it to failure mode so
  // every request gets the explanation instead of the "starting" banner.
  serverMode = { kind: "failed", body };
});
