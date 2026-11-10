/**
 * Expenses console service tests — run the exact production code paths against the
 * in-memory provider: settlement normalization/validation, summary metrics, trend
 * bucketing, category split, legacy-row normalization, search/filters, pagination.
 */
import { beforeEach, describe, expect, it } from "vitest";
import { InMemoryDataClient } from "@annaadhya/data-core";
import { COLLECTIONS, expenseUpsertSchema, type AuthPrincipal, type ExpenseDoc } from "@annaadhya/contracts";
import { ZodError } from "zod";
import { ExpensesService, expenseBalancePaise, normalizeExpense } from "../src/modules/expenses/expenses.service";

process.env.NODE_ENV = "test";
process.env.DATA_PROVIDER = "memory";

let db: InMemoryDataClient;
let expenses: ExpensesService;

const owner: AuthPrincipal = {
  uid: "test-owner",
  email: "owner@test.dev",
  provider: "dev",
  role: "owner",
  permissions: ["expenses:read", "expenses:write"],
  isStaff: true,
  displayName: "Test Owner",
};

/** IST day start for a 2026 calendar date (matches the service's bucketing frame). */
function istDay(y: number, m: number, d: number): number {
  return Date.parse(`${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}T00:00:00+05:30`);
}

async function seedExpense(overrides: Partial<ExpenseDoc> & { date: number; amountPaise: number; category: string }): Promise<ExpenseDoc> {
  const dto = expenseUpsertSchema.parse({
    date: overrides.date,
    category: overrides.category,
    amountPaise: overrides.amountPaise,
    description: overrides.description ?? "Test expense",
    payee: overrides.payee,
    reference: overrides.reference,
    notes: overrides.notes,
    status: overrides.status ?? "paid",
    amountPaidPaise: overrides.amountPaidPaise,
    paymentMethod: overrides.paymentMethod,
  });
  const doc = await expenses.create(dto, owner);
  if (overrides.isDemo) {
    await db.update(COLLECTIONS.expenses, doc.id, { isDemo: true } as Partial<ExpenseDoc>);
  }
  return doc;
}

beforeEach(async () => {
  db = new InMemoryDataClient({ nodeEnv: "test" });
  expenses = new ExpensesService(db);
});

describe("settlement normalization", () => {
  it("paid expenses store the full amount as settled", async () => {
    const doc = await seedExpense({ date: istDay(2026, 2, 5), amountPaise: 450000, category: "Packaging" });
    expect(doc.status).toBe("paid");
    expect(doc.amountPaidPaise).toBe(450000);
    expect(expenseBalancePaise(doc)).toBe(0);
  });

  it("pending expenses settle nothing but keep the recorded amount", async () => {
    const doc = await seedExpense({ date: istDay(2026, 2, 6), amountPaise: 300000, category: "Marketing", status: "pending" });
    expect(doc.amountPaidPaise).toBe(0);
    expect(expenseBalancePaise(doc)).toBe(300000);
  });

  it("partially paid expenses keep a strictly-between settled amount", async () => {
    const doc = await seedExpense({
      date: istDay(2026, 2, 7),
      amountPaise: 275000,
      category: "Packaging",
      status: "partially_paid",
      amountPaidPaise: 150000,
    });
    expect(doc.amountPaidPaise).toBe(150000);
    expect(expenseBalancePaise(doc)).toBe(125000);
  });

  it("rejects a paid amount exceeding the total", () => {
    expect(() =>
      expenseUpsertSchema.parse({
        date: istDay(2026, 2, 5),
        category: "Packaging",
        amountPaise: 100000,
        description: "Overpaid bill",
        status: "partially_paid",
        amountPaidPaise: 150000,
      }),
    ).toThrow(ZodError);
  });

  it("rejects a partially paid expense whose settled amount equals the total", () => {
    expect(() =>
      expenseUpsertSchema.parse({
        date: istDay(2026, 2, 5),
        category: "Packaging",
        amountPaise: 100000,
        description: "Fully settled but marked partial",
        status: "partially_paid",
        amountPaidPaise: 100000,
      }),
    ).toThrow(ZodError);
  });

  it("rejects negative, zero and non-integer amounts", () => {
    for (const amountPaise of [0, -500, 1250.5]) {
      expect(() =>
        expenseUpsertSchema.parse({ date: istDay(2026, 2, 5), category: "Packaging", amountPaise, description: "Bad amount" }),
      ).toThrow(ZodError);
    }
  });

  it("normalizes legacy rows without a status to paid", () => {
    const legacy = {
      id: "exp_legacy",
      createdAt: 1,
      updatedAt: 1,
      isDemo: false,
      date: istDay(2026, 1, 10),
      category: "freight",
      amountPaise: 80000,
      description: "Courier charges",
      createdByUid: "u1",
    } as ExpenseDoc;
    const normalized = normalizeExpense(legacy);
    expect(normalized.status).toBe("paid");
    expect(normalized.amountPaidPaise).toBe(80000);
    expect(expenseBalancePaise(normalized)).toBe(0);
  });
});

describe("listPage aggregates", () => {
  it("summary covers the whole filtered set: total, settled, outstanding, counts", async () => {
    await seedExpense({ date: istDay(2026, 2, 1), amountPaise: 450000, category: "Packaging" }); // paid
    await seedExpense({ date: istDay(2026, 2, 2), amountPaise: 300000, category: "Marketing", status: "pending" });
    await seedExpense({ date: istDay(2026, 2, 3), amountPaise: 275000, category: "Packaging", status: "partially_paid", amountPaidPaise: 150000 });
    await seedExpense({ date: istDay(2026, 3, 15), amountPaise: 100000, category: "Utilities" }); // next month

    const feb = await expenses.listPage({ from: istDay(2026, 2, 1), to: istDay(2026, 2, 28) + 86_399_999, page: 1, pageSize: 10 });
    expect(feb.total).toBe(3);
    expect(feb.summary.totalPaise).toBe(1025000);
    expect(feb.summary.paidPaise).toBe(600000); // 450000 + 150000
    expect(feb.summary.pendingPaise).toBe(425000); // 300000 + 125000
    expect(feb.summary.paidCount).toBe(1);
    expect(feb.summary.pendingCount).toBe(1);
    expect(feb.summary.partiallyPaidCount).toBe(1);

    // Metrics must NOT be limited to the visible page — ask for 2 rows, summary still sees all 3.
    const paged = await expenses.listPage({ from: istDay(2026, 2, 1), to: istDay(2026, 2, 28) + 86_399_999, page: 1, pageSize: 2 });
    expect(paged.items).toHaveLength(2);
    expect(paged.summary.recordCount).toBe(3);
    expect(paged.summary.totalPaise).toBe(1025000);
  });

  it("buckets the trend by IST day for short spans and monthly for long spans", async () => {
    await seedExpense({ date: istDay(2026, 2, 1), amountPaise: 100000, category: "Packaging" });
    await seedExpense({ date: istDay(2026, 2, 1), amountPaise: 50000, category: "Marketing" });
    await seedExpense({ date: istDay(2026, 2, 3), amountPaise: 25000, category: "Packaging" });

    const daily = await expenses.listPage({ from: istDay(2026, 2, 1), to: istDay(2026, 2, 7) + 86_399_999, page: 1, pageSize: 10 });
    expect(daily.trendUnit).toBe("day");
    expect(daily.trend.map((b) => b.totalPaise)).toEqual([150000, 0, 25000, 0, 0, 0, 0]);
    expect(daily.trend[0].count).toBe(2);

    const yearly = await expenses.listPage({ from: istDay(2025, 1, 1), to: istDay(2026, 2, 28) + 86_399_999, page: 1, pageSize: 10 });
    expect(yearly.trendUnit).toBe("month");
    const feb2026 = yearly.trend.find((b) => b.label === "Feb 2026");
    expect(feb2026?.totalPaise).toBe(175000);
  });

  it("splits spending by category with reconciling percentages", async () => {
    await seedExpense({ date: istDay(2026, 2, 1), amountPaise: 750000, category: "Packaging" });
    await seedExpense({ date: istDay(2026, 2, 2), amountPaise: 250000, category: "Marketing" });

    const page = await expenses.listPage({ from: istDay(2026, 2, 1), to: istDay(2026, 2, 28) + 86_399_999, page: 1, pageSize: 10 });
    expect(page.categories).toEqual([
      { category: "Packaging", totalPaise: 750000, count: 1, pct: 75 },
      { category: "Marketing", totalPaise: 250000, count: 1, pct: 25 },
    ]);
    expect(page.categories.reduce((s, c) => s + c.pct, 0)).toBe(100);
    expect(page.categoryOptions.sort()).toEqual(["Marketing", "Packaging"]);
  });

  it("zero-total datasets produce zeroed metrics, empty charts and no division errors", async () => {
    const page = await expenses.listPage({ page: 1, pageSize: 10 });
    expect(page.total).toBe(0);
    expect(page.summary).toEqual({
      totalPaise: 0,
      paidPaise: 0,
      pendingPaise: 0,
      recordCount: 0,
      paidCount: 0,
      pendingCount: 0,
      partiallyPaidCount: 0,
    });
    expect(page.trend).toEqual([]);
    expect(page.categories).toEqual([]);
    expect(page.totalPages).toBe(1);
  });

  it("search matches description, payee and reference; filters compose", async () => {
    await seedExpense({ date: istDay(2026, 2, 1), amountPaise: 450000, category: "Packaging", description: "Tin canisters & seal foils", payee: "Khari Baoli Co.", reference: "INV-77" });
    await seedExpense({ date: istDay(2026, 2, 2), amountPaise: 125000, category: "Shipping & Delivery", description: "BlueDart courier", payee: "BlueDart Express", reference: "AWB-99" });
    await seedExpense({ date: istDay(2026, 2, 3), amountPaise: 300000, category: "Marketing", description: "Photography", status: "pending", payee: "Studio" });

    const byPayee = await expenses.listPage({ search: "khari", page: 1, pageSize: 10 });
    expect(byPayee.total).toBe(1);
    const byRef = await expenses.listPage({ search: "awb", page: 1, pageSize: 10 });
    expect(byRef.total).toBe(1);
    const composed = await expenses.listPage({ search: "courier", status: "pending", page: 1, pageSize: 10 });
    expect(composed.total).toBe(0); // courier is paid, so status+search compose to empty
    const byMethod = await expenses.listPage({ method: "upi", page: 1, pageSize: 10 });
    expect(byMethod.total).toBe(0);
  });

  it("paginates the filtered set and clamps out-of-range pages", async () => {
    for (let d = 1; d <= 12; d++) {
      await seedExpense({ date: istDay(2026, 2, d), amountPaise: 10000 * d, category: "Packaging" });
    }
    const p1 = await expenses.listPage({ from: istDay(2026, 2, 1), to: istDay(2026, 2, 28) + 86_399_999, page: 1, pageSize: 10 });
    expect(p1.items).toHaveLength(10);
    expect(p1.totalPages).toBe(2);
    // newest first
    expect(p1.items[0].amountPaise).toBe(120000);
    const p3 = await expenses.listPage({ from: istDay(2026, 2, 1), to: istDay(2026, 2, 28) + 86_399_999, page: 3, pageSize: 10 });
    expect(p3.page).toBe(2); // clamped to the last valid page
    expect(p3.items).toHaveLength(2);
  });

  it("respects the date range in every aggregate (card/table/chart consistency)", async () => {
    await seedExpense({ date: istDay(2026, 1, 15), amountPaise: 500000, category: "Office & Operations" });
    await seedExpense({ date: istDay(2026, 2, 10), amountPaise: 200000, category: "Packaging" });

    const feb = await expenses.listPage({ from: istDay(2026, 2, 1), to: istDay(2026, 2, 28) + 86_399_999, page: 1, pageSize: 10 });
    expect(feb.summary.totalPaise).toBe(200000);
    expect(feb.categories.map((c) => c.category)).toEqual(["Packaging"]);
    expect(feb.trend.reduce((s, b) => s + b.totalPaise, 0)).toBe(200000);
  });
});

describe("CRUD metadata & audit", () => {
  it("create stamps created-by metadata; update preserves it and stamps updated-by", async () => {
    const created = await seedExpense({ date: istDay(2026, 2, 5), amountPaise: 450000, category: "Packaging" });
    expect(created.createdByUid).toBe("test-owner");
    expect(created.createdByName).toBe("Test Owner");

    const updated = await expenses.update(
      created.id,
      expenseUpsertSchema.parse({
        date: created.date,
        category: "Packaging",
        amountPaise: 475000,
        description: "Tin canisters (revised quote)",
        status: "pending",
      }),
      owner,
    );
    expect(updated.amountPaise).toBe(475000);
    expect(updated.createdByUid).toBe("test-owner"); // creation metadata preserved
    expect(updated.updatedByUid).toBe("test-owner");
    expect(updated.status).toBe("pending");
    expect(updated.amountPaidPaise).toBe(0);
    // no duplicate doc was created
    const all = await db.list<ExpenseDoc>(COLLECTIONS.expenses, {});
    expect(all).toHaveLength(1);
  });

  it("delete removes exactly the target record", async () => {
    const a = await seedExpense({ date: istDay(2026, 2, 5), amountPaise: 100000, category: "Utilities" });
    await seedExpense({ date: istDay(2026, 2, 6), amountPaise: 200000, category: "Utilities" });
    await expenses.delete(a.id);
    const all = await db.list<ExpenseDoc>(COLLECTIONS.expenses, {});
    expect(all).toHaveLength(1);
    expect(all[0].id).not.toBe(a.id);
  });
});
