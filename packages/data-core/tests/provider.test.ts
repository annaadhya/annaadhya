import { describe, expect, it } from "vitest";
import { InMemoryDataClient } from "../src/memory.provider";
import { applySeed, resetDemoData, validateDataset, planSeed, DEMO_SEED_BATCH } from "../src/seed/engine";
import { COLLECTIONS } from "@annaadhya/contracts";
import { toPaise, sumPaise } from "@annaadhya/utils";

describe("InMemoryDataClient", () => {
  it("refuses production env", () => {
    expect(() => new InMemoryDataClient({ nodeEnv: "production" })).toThrow(/never allowed in production/);
  });

  it("supports CRUD, filtering and ordering", async () => {
    const db = new InMemoryDataClient({ nodeEnv: "test" });
    await db.create("things", { name: "b", n: 2 });
    await db.create("things", { name: "a", n: 1 });
    const asc = await db.list("things", { orderBy: [{ field: "n", direction: "asc" }] });
    expect(asc.map((r) => (r as { n: number }).n)).toEqual([1, 2]);
    const filtered = await db.list("things", { where: [{ field: "name", op: "==", value: "a" }] });
    expect(filtered).toHaveLength(1);
  });

  it("transactions apply atomically (no writes on throw)", async () => {
    const db = new InMemoryDataClient({ nodeEnv: "test" });
    const doc = await db.create("counters", { value: 1 });
    await expect(
      db.runTransaction(async (tx) => {
        const cur = await tx.get<{ value: number }>("counters", doc.id);
        tx.update("counters", doc.id, { value: cur!.value + 1 });
        throw new Error("rollback");
      }),
    ).rejects.toThrow("rollback");
    const after = await db.get<{ value: number }>("counters", doc.id);
    expect(after!.value).toBe(1);
  });

  it("transactions give read-your-writes within the same transaction", async () => {
    const db = new InMemoryDataClient({ nodeEnv: "test" });
    const id = await db.runTransaction((tx) => {
      const newId = tx.create("rows", { v: 1 });
      return newId;
    });
    const row = await db.get<{ v: number }>("rows", id);
    expect(row?.v).toBe(1);
  });
});

describe("demo seed isolation", () => {
  it("dataset validates cleanly", async () => {
    const report = await validateDataset();
    expect(report.ok).toBe(true);
    expect(report.counts.products).toBe(22); // 20 base + 2 Gift Hampers (Task: gift-boxes live)
    expect(report.counts.variants).toBe(83);
  });

  it("plan (dry-run) writes nothing", async () => {
    const db = new InMemoryDataClient({ nodeEnv: "test" });
    const plan = await planSeed();
    expect(plan.counts.products).toBe(22);
    expect(await db.count(COLLECTIONS.products)).toBe(0);
  });

  it("apply seeds demo records, all marked isDemo with seedBatch", async () => {
    const db = new InMemoryDataClient({ nodeEnv: "test" });
    const report = await applySeed(db);
    expect(report.ok).toBe(true);
    expect(await db.count(COLLECTIONS.products)).toBe(22);
    expect(await db.count(COLLECTIONS.productVariants)).toBe(83);
    expect(await db.count(COLLECTIONS.orders)).toBe(12);
    const anyProduct = (await db.list(COLLECTIONS.products, { limit: 1 }))[0] as {
      isDemo: boolean;
      seedBatch?: string;
    };
    expect(anyProduct.isDemo).toBe(true);
    expect(anyProduct.seedBatch).toBe(DEMO_SEED_BATCH);
  });

  it("apply is idempotent (re-run keeps counts stable)", async () => {
    const db = new InMemoryDataClient({ nodeEnv: "test" });
    await applySeed(db);
    await applySeed(db);
    expect(await db.count(COLLECTIONS.products)).toBe(22);
    expect(await db.count(COLLECTIONS.orders)).toBe(12);
  });

  it("reset deletes ONLY demo records and leaves live records untouched", async () => {
    const db = new InMemoryDataClient({ nodeEnv: "test" });
    await applySeed(db);
    await db.create(COLLECTIONS.products, { sku: "LIVE-001" }, { id: "live-product", isDemo: false });
    await db.create(COLLECTIONS.orders, { orderNumber: "LIVE-ORDER" }, { id: "live-order", isDemo: false });

    const report = await resetDemoData(db);
    expect(report.ok).toBe(true);
    expect(await db.count(COLLECTIONS.products)).toBe(1);
    expect(await db.count(COLLECTIONS.orders)).toBe(1);
    const liveProduct = await db.get<{ sku: string }>(COLLECTIONS.products, "live-product");
    const liveOrder = await db.get<{ orderNumber: string }>(COLLECTIONS.orders, "live-order");
    expect(liveProduct?.sku).toBe("LIVE-001");
    expect(liveOrder?.orderNumber).toBe("LIVE-ORDER");
  });

  it("demo order totals use integer paise arithmetic", async () => {
    const db = new InMemoryDataClient({ nodeEnv: "test" });
    await applySeed(db);
    const orders = await db.list<{ subtotalPaise: number; totalPaise: number; items: { lineTotalPaise: number }[] }>(
      COLLECTIONS.orders,
    );
    for (const o of orders) {
      const itemSum = sumPaise(o.items.map((i) => i.lineTotalPaise));
      expect(itemSum).toBe(o.subtotalPaise);
      expect(Number.isInteger(o.totalPaise)).toBe(true);
      expect(o.totalPaise).toBeGreaterThanOrEqual(o.subtotalPaise);
    }
  });

  it("demo prices match the planning workbook", async () => {
    const db = new InMemoryDataClient({ nodeEnv: "test" });
    await applySeed(db);
    const variants = await db.list<{ sku: string; pricePaise: number }>(COLLECTIONS.productVariants, {
      where: [{ field: "sku", op: "==", value: "AN-HNY-001-250G" }],
    });
    expect(variants[0]?.pricePaise).toBe(toPaise(199));
  });
});
