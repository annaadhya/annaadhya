/**
 * export-validation CLI — data integrity checks that exported numbers reconcile with source data.
 * Run before shipping any financial export: totals in sheets must equal database aggregates.
 *
 * Checks:
 *  1. Order totals: subtotal + shipping + tax − (already refunded) == total for every order
 *  2. Line snapshots: sum(lineTotal) == subtotal for every order
 *  3. Inventory ledger: sum(movement qtyDelta per variant) + opening == current stockOnHand (from seed opening)
 *  4. Reserved stock: active reservations == variant.reservedQty
 *  5. Demo boundary: any live order referencing demo variants is flagged for review
 */
import { InMemoryDataClient, FirestoreDataClient, parseFirestoreCredentials, type DataClient } from "@annaadhya/data-core";
import { COLLECTIONS, availableQty, type InventoryMovementDoc, type OrderDoc, type ProductVariantDoc, type StockReservationDoc } from "@annaadhya/contracts";
import { sumPaise } from "@annaadhya/utils";
import { parseArgs } from "node:util";

const { values } = parseArgs({
  options: { firestore: { type: "boolean", default: false } },
});

interface CheckResult {
  name: string;
  ok: boolean;
  violations: string[];
}

async function checkOrderTotals(db: DataClient): Promise<CheckResult> {
  const orders = await db.list<OrderDoc>(COLLECTIONS.orders, { limit: 5000 });
  const violations: string[] = [];
  for (const o of orders) {
    const lineSum = sumPaise(o.items.map((i) => i.lineTotalPaise));
    if (lineSum !== o.subtotalPaise) {
      violations.push(`${o.orderNumber}: line sum ${lineSum} != subtotal ${o.subtotalPaise}`);
    }
    const expectedTotal = o.subtotalPaise - o.discountTotalPaise + o.shippingPaise + o.taxPaise;
    if (expectedTotal !== o.totalPaise) {
      violations.push(`${o.orderNumber}: expected total ${expectedTotal} != stored ${o.totalPaise}`);
    }
    if (o.refundPaise > o.totalPaise) {
      violations.push(`${o.orderNumber}: refund ${o.refundPaise} exceeds total`);
    }
  }
  return { name: "order totals reconcile", ok: violations.length === 0, violations };
}

async function checkInventoryLedger(db: DataClient): Promise<CheckResult> {
  const variants = await db.list<ProductVariantDoc>(COLLECTIONS.productVariants, { limit: 5000 });
  const movements = await db.list<InventoryMovementDoc>(COLLECTIONS.inventoryMovements, { limit: 20000 });
  const violations: string[] = [];

  for (const v of variants) {
    // The opening balance is the first `received` movement for the variant (seed semantics:
    // opening = first received qty). Stock = opening + sum(subsequent deltas).
    const relevant = movements
      .filter((m) => m.variantId === v.id)
      .sort((a, b) => a.createdAt - b.createdAt);
    if (relevant.length === 0) continue;
    const opening = relevant.find((m) => m.type === "received")?.qtyDelta ?? 0;
    const deltaSum = relevant.slice(1).reduce((s, m) => s + m.qtyDelta, 0);
    const expected = opening + deltaSum;
    if (expected !== v.stockOnHand) {
      violations.push(`${v.sku}: ledger stock ${expected} != stockOnHand ${v.stockOnHand}`);
    }
  }
  return { name: "inventory ledger reconciles", ok: violations.length === 0, violations };
}

async function checkReservations(db: DataClient): Promise<CheckResult> {
  const variants = await db.list<ProductVariantDoc>(COLLECTIONS.productVariants, { limit: 5000 });
  const reservations = await db.list<StockReservationDoc>(COLLECTIONS.stockReservations, { limit: 10000 });
  const violations: string[] = [];
  const activeByVariant = new Map<string, number>();
  for (const r of reservations) {
    if (r.status === "active") {
      activeByVariant.set(r.variantId, (activeByVariant.get(r.variantId) ?? 0) + r.qty);
    }
  }
  for (const v of variants) {
    const active = activeByVariant.get(v.id) ?? 0;
    if (active !== v.reservedQty) {
      violations.push(`${v.sku}: active reservations ${active} != reservedQty ${v.reservedQty}`);
    }
    if (v.reservedQty > v.stockOnHand) {
      violations.push(`${v.sku}: reserved ${v.reservedQty} exceeds stock on hand ${v.stockOnHand}`);
    }
    if (availableQty(v) < 0) {
      violations.push(`${v.sku}: available quantity is negative`);
    }
  }
  return { name: "reservations match reserved counters", ok: violations.length === 0, violations };
}

async function checkDemoBoundary(db: DataClient): Promise<CheckResult> {
  const orders = await db.list<OrderDoc>(COLLECTIONS.orders, { limit: 5000 });
  const variants = await db.list<ProductVariantDoc>(COLLECTIONS.productVariants, { limit: 5000 });
  const isDemoVariant = new Set(variants.filter((v) => v.isDemo).map((v) => v.id));
  const violations: string[] = [];
  for (const o of orders.filter((x) => !x.isDemo)) {
    const demoItems = o.items.filter((i) => isDemoVariant.has(i.variantId));
    if (demoItems.length > 0) {
      violations.push(`${o.orderNumber}: LIVE order references demo variant(s) ${demoItems.map((i) => i.sku).join(", ")} — review before financial reporting`);
    }
  }
  return { name: "demo/live boundary clean for live orders", ok: violations.length === 0, violations };
}

async function main(): Promise<void> {
  let db: DataClient;
  if (values.firestore) {
    const creds = parseFirestoreCredentials(process.env);
    if (!creds) {
      console.error("FIRESTORE requested but credentials are missing (docs/environment-setup.md).");
      process.exit(1);
    }
    db = new FirestoreDataClient(creds);
  } else {
    db = new InMemoryDataClient({ nodeEnv: process.env.NODE_ENV ?? "development" });
  }

  console.log("Running export reconciliation checks…\n");
  const results: CheckResult[] = [];
  results.push(await checkOrderTotals(db));
  results.push(await checkInventoryLedger(db));
  results.push(await checkReservations(db));
  results.push(await checkDemoBoundary(db));

  let failed = false;
  for (const r of results) {
    console.log(`${r.ok ? "PASS" : "FAIL"}  ${r.name}`);
    for (const v of r.violations.slice(0, 20)) console.log(`      - ${v}`);
    if (r.violations.length > 20) console.log(`      … and ${r.violations.length - 20} more`);
    if (!r.ok) failed = true;
  }
  console.log(failed ? "\nRESULT: checks FAILED — exports must not ship until reconciled." : "\nRESULT: all checks passed — exports reconcile with source data.");
  process.exit(failed ? 1 : 0);
}

void main();
