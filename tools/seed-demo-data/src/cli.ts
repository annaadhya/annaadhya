/**
 * seed-demo-data CLI — validate | dry-run | seed | reset-demo
 *
 * Safety model:
 *  - every written record is isDemo:true + seedBatch, ids are deterministic (idempotent re-runs)
 *  - reset deletes ONLY isDemo documents (live records are never touched)
 *  - destructive commands require explicit acknowledgement flags and refuse to run against
 *    environments that look production-like
 */
import { parseArgs } from "node:util";
import { resolve } from "node:path";
import { loadDotEnvIfPresent } from "@annaadhya/utils";
import {
  InMemoryDataClient,
  FirestoreDataClient,
  parseFirestoreCredentials,
  applySeed,
  planSeed,
  resetDemoData,
  validateDataset,
  DEMO_SEED_BATCH,
  type DataClient,
} from "@annaadhya/data-core";

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    "i-understand-demo-reset": { type: "boolean", default: false },
    firestore: { type: "boolean", default: false },
    batch: { type: "string", default: DEMO_SEED_BATCH },
  },
});

const command = positionals[0] ?? "validate";

// Local .env auto-load: the canonical credentials file is apps/api/.env (shared with the
// API dev server — one file serves both). A .env next to the current directory wins if
// present. Shell-set variables always override file values (Node loadEnvFile semantics).
const loadedEnvFile = loadDotEnvIfPresent([
  resolve(process.cwd(), "../../apps/api/.env"), // pnpm --filter runs with cwd = this package dir
  resolve(process.cwd(), ".env"),
]);
if (loadedEnvFile) console.log(`[env] loaded ${loadedEnvFile}`);

function looksProductionish(): boolean {
  return (
    process.env.NODE_ENV === "production" ||
    String(process.env.FIREBASE_PROJECT_ID ?? "").includes("-prod")
  );
}

async function getClient(): Promise<DataClient> {
  if (values.firestore) {
    const creds = parseFirestoreCredentials(process.env);
    if (!creds) {
      console.error("FIRESTORE requested but credentials are missing.");
      console.error("Put FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY in apps/api/.env (auto-loaded)");
      console.error("or set them via shell env — see docs/environment-setup.md.");
      process.exit(1);
    }
    console.log(`Provider: Firestore project "${creds.projectId}"`);
    return new FirestoreDataClient(creds);
  }
  console.log("Provider: in-memory (mock mode — data is not persisted anywhere)");
  return new InMemoryDataClient({ nodeEnv: process.env.NODE_ENV ?? "development" });
}

function printReport(r: {
  ok: boolean;
  mode: string;
  counts: Record<string, number>;
  errors: string[];
  warnings: string[];
}): void {
  console.log(`\n== ${r.mode.toUpperCase()} ${r.ok ? "OK" : "FAILED"} ==`);
  for (const [k, v] of Object.entries(r.counts)) console.log(`  ${k}: ${v}`);
  for (const e of r.errors) console.log(`  ERROR: ${e}`);
  for (const w of r.warnings) console.log(`  note: ${w}`);
  if (r.errors.length > 0) process.exitCode = 1;
}

async function main(): Promise<void> {
  switch (command) {
    case "validate": {
      printReport(await validateDataset());
      break;
    }
    case "dry-run": {
      console.log("Dry-run — nothing is written.");
      printReport(await planSeed());
      break;
    }
    case "seed": {
      const db = await getClient();
      console.log(`Seeding demo dataset (batch ${values.batch})…`);
      printReport(await applySeed(db, values.batch));
      break;
    }
    case "reset-demo": {
      if (looksProductionish() && !values.firestore) {
        console.error("Refusing: NODE_ENV looks production-like. Reset demo data only against dev/staging targets.");
        process.exit(1);
      }
      if (!values["i-understand-demo-reset"]) {
        console.error("This DELETES every record with isDemo:true from the target data store.");
        console.error("Re-run with --i-understand-demo-reset to proceed. Live (non-demo) records are never touched.");
        process.exit(1);
      }
      const db = await getClient();
      console.log(`Resetting demo records (batch filter: ${values.batch === DEMO_SEED_BATCH ? "all demo records" : values.batch})…`);
      printReport(await resetDemoData(db, values.batch === DEMO_SEED_BATCH ? undefined : values.batch));
      break;
    }
    default:
      console.error(`Unknown command "${command}". Use: validate | dry-run | seed | reset-demo`);
      process.exit(1);
  }
}

void main();
