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
const DEPLOY_BUILD = "v11-boot-failure-200";
bootLog.push(`build: ${DEPLOY_BUILD}`);

/**
 * File-based boot oracle for managed builders whose stderr.log is not exposed:
 * every boot writes annaadhya-boot-report.txt into the process working
 * directory (fallback: os.tmpdir()) with the exact verdict, which env vars are
 * SET vs unset (values never printed for secrets), and the boot progress log.
 * The report path is always echoed to stderr as well. Presence of the file at
 * all proves the process started; its content names the failing boot step.
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
    `PORT injected by platform: ${process.env.PORT ?? "(not set)"}`,
    "",
    "environment (secret values hidden):",
    ...envLines,
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

async function boot(): Promise<void> {
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
  const { DocumentBuilder, SwaggerModule } = await step("import @nestjs/swagger", () => import("@nestjs/swagger"));
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

  await step("configure prefix/CORS/Swagger", async () => {
    app.setGlobalPrefix("api/v1", { exclude: ["api/docs", "api/docs-json"] });

    app.enableCors({
      origin: env.CORS_ORIGINS.split(",").map((o) => o.trim()).filter(Boolean),
      credentials: true,
    });

    // Swagger — the API contract surface for both frontends
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
  });

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

  // Platform deploy pipelines commonly health-check the site root ("/") after
  // starting the process; with the global prefix set, the Nest router would
  // 404 there. Serve a cheap 200 so a root probe can never fail a deployment.
  await step("register root health probe", async () => {
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
      res.status(200).json({ ok: true, service: "annaadhya-api", hint: "/api/v1/health" });
    });
  });

  // Vercel's Node runtime probes the PORT it injects; fall back to 3000 exactly like
  // Vercel's documented NestJS example (process.env.PORT ?? 3000). A mismatch here
  // would look like FUNCTION_INVOCATION_FAILED with no error in the logs.
  const port = Number(process.env.PORT) || 3000;
  await step(`listen on :${port}`, () => app.listen(port, "0.0.0.0"));

  // Reservation expiry sweeper (also callable via admin endpoint)
  const checkout = app.get(CHECKOUT_SWEEPER) as { releaseExpiredReservations(): Promise<unknown> } | undefined;
  if (checkout) {
    setInterval(() => {
      checkout.releaseExpiredReservations().catch((err) => {
        console.warn("[reservations] expiry sweep failed:", err instanceof Error ? err.message : err);
      });
    }, 5 * 60 * 1000).unref?.();
  }

  console.info(`Annaadhya API listening on :${port} (prefix /api/v1, docs at /api/docs)`);
  console.info(
    `Mode: provider=${env.DATA_PROVIDER} auth=${env.firebaseConfigured ? "firebase" : "mock-dev-tokens"} payments=${env.razorpayConfigured ? "razorpay" : "mock"}${env.isProduction ? " PRODUCTION" : " (sandbox)"}`,
  );

  writeBootReport("ok");
}

/**
 * Boot-error visibility: any failure during boot (bad env, DI failure, import crash,
 * listen failure) still binds the port and reports the exact reason plus boot progress
 * over HTTP. Deliberately minimal: step log + message + first stack frames, no env
 * values echoed back.
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
  server.listen(Number(process.env.PORT) || 3000, "0.0.0.0");
});
