/** Expenses — integer-paise operating-expense ledger with settlement tracking.
 *
 *  Accounting rules enforced here (see the Expenses page spec):
 *  - Expense AMOUNT and PAYMENT STATUS are separate: a pending expense still counts
 *    towards total recorded expenses; only its settled portion is reported as paid.
 *  - Paid/settled amounts are normalized on write (paid → total, pending → 0,
 *    partially_paid → strictly between) so summary math is always plain integer sums.
 *  - Stock procurement (Purchases/Inventory) never auto-creates an expense and an
 *    expense never touches stock — the two workflows stay separate on purpose.
 *  - All aggregates (summary cards, trend, category split) are computed over the SAME
 *    filtered set as the returned page — server-side, never from the visible slice.
 */
import { Inject, Injectable } from "@nestjs/common";
import {
  COLLECTIONS,
  type ExpenseCategorySlice,
  type ExpenseDoc,
  type ExpensePage,
  type ExpenseStatus,
  type ExpenseSummary,
  type ExpenseTrendBucket,
  type ExpenseUpsertDto,
  type AuthPrincipal,
} from "@annaadhya/contracts";
import { notFound, type DataClient } from "@annaadhya/data-core";
import { newId, startOfIstDay } from "@annaadhya/utils";
import { DATA_CLIENT } from "../../data/data.module";

/**
 * Upper bound of rows scanned per ledger request. The query surface is a date-range
 * on `date` (served by Firestore's automatic single-field index) — category/status/
 * method/search filters apply in memory afterwards. A manually kept expense ledger
 * stays far below this; the cap keeps worst-case latency bounded.
 */
const SCAN_CAP = 5000;

const IST_OFFSET_MINUTES = 330;
const MONTHS_SHORT = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Shift epoch millis into the IST wall-clock frame (for calendar bucketing). */
function toIstFrame(millis: number): number {
  return millis + IST_OFFSET_MINUTES * 60_000;
}

/** Shift an IST-frame millis back to a real epoch. */
function fromIstFrame(istMillis: number): number {
  return istMillis - IST_OFFSET_MINUTES * 60_000;
}

/**
 * Fill in the settlement fields for rows recorded before payment tracking existed.
 * The historical model recorded money already spent → missing status means "paid".
 * Exported so the reports exporter shows the same normalized view.
 */
export function normalizeExpense(doc: ExpenseDoc): ExpenseDoc {
  const status: ExpenseStatus = doc.status ?? "paid";
  const amountPaidPaise =
    doc.amountPaidPaise ?? (status === "paid" ? doc.amountPaise : 0);
  return { ...doc, status, amountPaidPaise };
}

/** Remaining balance = total − settled (integer paise, never negative). */
export function expenseBalancePaise(doc: ExpenseDoc): number {
  return Math.max(0, doc.amountPaise - (doc.amountPaidPaise ?? 0));
}

/** Pick the trend bucket size from the scanned span (IST day boundaries). */
function pickTrendUnit(from: number | undefined, to: number | undefined): "day" | "week" | "month" {
  const start = from ?? 0;
  const end = to ?? Date.now();
  const spanDays = Math.max(1, Math.round((end - start) / 86_400_000));
  if (spanDays <= 31) return "day";
  if (spanDays <= 120) return "week";
  return "month";
}

/** Start of the IST week (Monday) containing `millis`. */
function startOfIstWeek(millis: number): number {
  const shifted = new Date(toIstFrame(millis));
  const day = shifted.getUTCDay(); // 0 = Sunday … 6 = Saturday
  const back = (day + 6) % 7; // Monday-start offset
  return startOfIstDay(millis) - back * 86_400_000;
}

/** Start of the IST calendar month containing `millis`. */
function startOfIstMonth(millis: number): number {
  const shifted = new Date(toIstFrame(millis));
  return fromIstFrame(Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1));
}

function bucketLabel(unit: "day" | "week" | "month", bucketStart: number): string {
  const d = new Date(toIstFrame(bucketStart));
  if (unit === "month") return `${MONTHS_SHORT[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
  return `${String(d.getUTCDate()).padStart(2, "0")} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

@Injectable()
export class ExpensesService {
  constructor(@Inject(DATA_CLIENT) private readonly data: DataClient) {}

  /** Raw list (raw docs, newest first) — used by the XLSX exporter and the total endpoint. */
  async list(filters: { from?: number; to?: number; category?: string } = {}): Promise<ExpenseDoc[]> {
    const where: { field: string; op: "==" | ">=" | "<="; value: unknown }[] = [];
    if (filters.from) where.push({ field: "date", op: ">=", value: filters.from });
    if (filters.to) where.push({ field: "date", op: "<=", value: filters.to });
    if (filters.category) where.push({ field: "category", op: "==", value: filters.category });
    const rows = await this.data.list<ExpenseDoc>(COLLECTIONS.expenses, {
      where,
      orderBy: [{ field: "date", direction: "desc" }],
      limit: SCAN_CAP,
    });
    return rows.map(normalizeExpense);
  }

  /**
   * Paginated ledger + authoritative aggregates. One filtered set drives items,
   * summary, trend and the category split, so the cards/charts/table always agree.
   * Date range filters in the query (indexed surface); everything else filters in
   * memory over the same scan.
   */
  async listPage(q: {
    from?: number;
    to?: number;
    search?: string;
    category?: string;
    status?: ExpenseStatus;
    method?: string;
    page: number;
    pageSize: number;
  }): Promise<ExpensePage> {
    const where: { field: string; op: "==" | ">=" | "<="; value: unknown }[] = [];
    if (q.from) where.push({ field: "date", op: ">=", value: q.from });
    if (q.to) where.push({ field: "date", op: "<=", value: q.to });

    const scanned = await this.data.list<ExpenseDoc>(COLLECTIONS.expenses, {
      where,
      orderBy: [{ field: "date", direction: "desc" }],
      limit: SCAN_CAP,
    });
    // Normalize legacy rows once — every computation below sees the same shape.
    let rows = scanned.map(normalizeExpense);

    // Category dropdown options: distinct categories present in the DATE RANGE,
    // computed before the narrower filters so the dropdown stays stable.
    const categoryOptions = [...new Set(rows.map((r) => r.category.trim()))]
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    if (q.category) {
      const wanted = q.category.trim().toLowerCase();
      rows = rows.filter((r) => r.category.trim().toLowerCase() === wanted);
    }
    if (q.status) rows = rows.filter((r) => r.status === q.status);
    if (q.method) rows = rows.filter((r) => r.paymentMethod === q.method);
    if (q.search) {
      const needle = q.search.trim().toLowerCase();
      rows = rows.filter(
        (r) =>
          r.description.toLowerCase().includes(needle) ||
          (r.payee ?? "").toLowerCase().includes(needle) ||
          (r.reference ?? "").toLowerCase().includes(needle) ||
          r.id.toLowerCase().includes(needle),
      );
    }

    const summary = summarize(rows);
    const trendUnit = pickTrendUnit(q.from, q.to);
    const trend = buildTrend(rows, trendUnit, q.from, q.to);
    const categories = buildCategorySplit(rows, summary.totalPaise);

    const total = rows.length;
    const totalPages = Math.max(1, Math.ceil(total / q.pageSize));
    const page = Math.min(q.page, totalPages);
    const start = (page - 1) * q.pageSize;

    return {
      items: rows.slice(start, start + q.pageSize),
      page,
      pageSize: q.pageSize,
      total,
      totalPages,
      summary,
      trend,
      trendUnit,
      categories,
      categoryOptions,
    };
  }

  async get(id: string): Promise<ExpenseDoc> {
    const doc = await this.data.get<ExpenseDoc>(COLLECTIONS.expenses, id);
    if (!doc) throw notFound("Expense not found");
    return normalizeExpense(doc);
  }

  async create(dto: ExpenseUpsertDto, actor: AuthPrincipal): Promise<ExpenseDoc> {
    return this.data.create<ExpenseDoc>(
      COLLECTIONS.expenses,
      {
        date: dto.date,
        category: dto.category,
        amountPaise: dto.amountPaise,
        description: dto.description,
        payee: dto.payee,
        reference: dto.reference,
        attachmentUrl: dto.attachmentUrl,
        notes: dto.notes,
        paymentMethod: dto.paymentMethod,
        ...normalizeSettlement(dto),
        createdByUid: actor.uid,
        createdByName: actor.displayName,
      } as object as ExpenseDoc,
      { id: newId("exp") },
    );
  }

  async update(id: string, dto: ExpenseUpsertDto, actor?: AuthPrincipal): Promise<ExpenseDoc> {
    await this.get(id);
    await this.data.update(COLLECTIONS.expenses, id, {
      date: dto.date,
      category: dto.category,
      amountPaise: dto.amountPaise,
      description: dto.description,
      payee: dto.payee,
      reference: dto.reference,
      attachmentUrl: dto.attachmentUrl,
      notes: dto.notes,
      paymentMethod: dto.paymentMethod,
      ...normalizeSettlement(dto),
      ...(actor ? { updatedByUid: actor.uid, updatedByName: actor.displayName } : {}),
    } as Partial<ExpenseDoc>);
    return this.get(id);
  }

  async delete(id: string): Promise<void> {
    await this.get(id);
    await this.data.delete(COLLECTIONS.expenses, id);
  }

  async total(filters: { from?: number; to?: number } = {}): Promise<number> {
    const rows = await this.list(filters);
    return rows.reduce((sum, e) => sum + e.amountPaise, 0);
  }
}

/**
 * Server-side settlement normalization (defence in depth — the DTO already validates):
 * paid settles the full amount, pending settles nothing, partially paid keeps the
 * client-supplied amount that passed the strictly-between check.
 */
function normalizeSettlement(dto: ExpenseUpsertDto): { status: ExpenseStatus; amountPaidPaise: number } {
  switch (dto.status) {
    case "paid":
      return { status: "paid", amountPaidPaise: dto.amountPaise };
    case "pending":
      return { status: "pending", amountPaidPaise: 0 };
    case "partially_paid":
      return { status: "partially_paid", amountPaidPaise: dto.amountPaidPaise ?? 0 };
  }
}

function summarize(rows: ExpenseDoc[]): ExpenseSummary {
  let totalPaise = 0;
  let paidPaise = 0;
  let paidCount = 0;
  let pendingCount = 0;
  let partiallyPaidCount = 0;
  for (const r of rows) {
    totalPaise += r.amountPaise;
    paidPaise += Math.min(r.amountPaidPaise ?? 0, r.amountPaise);
    if (r.status === "paid") paidCount++;
    else if (r.status === "pending") pendingCount++;
    else partiallyPaidCount++;
  }
  return {
    totalPaise,
    paidPaise,
    pendingPaise: totalPaise - paidPaise,
    recordCount: rows.length,
    paidCount,
    pendingCount,
    partiallyPaidCount,
  };
}

/** Bucket the filtered rows into IST-aligned day/week/month buckets, zero-filled
 *  across the WHOLE selected range (capped at today) so the trend has no gaps. */
function buildTrend(rows: ExpenseDoc[], unit: "day" | "week" | "month", rangeFrom?: number, rangeTo?: number): ExpenseTrendBucket[] {
  if (rows.length === 0) return [];
  const dates = rows.map((r) => r.date);
  const minDate = Math.min(...dates);
  const maxDate = Math.max(...dates);

  const startOf = (millis: number): number => {
    if (unit === "day") return startOfIstDay(millis);
    if (unit === "week") return startOfIstWeek(millis);
    return startOfIstMonth(millis);
  };
  const stepMillis = (): number => {
    if (unit === "day") return 86_400_000;
    if (unit === "week") return 7 * 86_400_000;
    return 30 * 86_400_000; // month walking uses calendar months below
  };

  const buckets = new Map<number, ExpenseTrendBucket>();
  const ensure = (bucketStart: number): ExpenseTrendBucket => {
    let b = buckets.get(bucketStart);
    if (!b) {
      const nextStart =
        unit === "month"
          ? startOfIstMonth(fromIstFrame(toIstFrame(bucketStart) + 32 * 86_400_000))
          : bucketStart + stepMillis();
      b = {
        start: bucketStart,
        end: nextStart - 1,
        label: bucketLabel(unit, bucketStart),
        totalPaise: 0,
        count: 0,
      };
      buckets.set(bucketStart, b);
    }
    return b;
  };

  // Zero-fill from the first bucket of the requested range (or first expense) up to
  // the last bucket of the range (capped at today) so the trend has no gaps.
  const first = startOf(rangeFrom ?? minDate);
  const last = Math.min(rangeTo ?? maxDate, Date.now());
  let cursor = first;
  // Hard cap the zero-fill iterations (e.g. "All time" + monthly over decades).
  for (let i = 0; i < 2000 && cursor <= last; i++) {
    ensure(cursor);
    const next =
      unit === "month"
        ? startOfIstMonth(fromIstFrame(toIstFrame(cursor) + 32 * 86_400_000))
        : cursor + stepMillis();
    if (next <= cursor) break; // safety — never loop forever
    cursor = next;
  }

  for (const r of rows) {
    const b = ensure(startOf(r.date));
    b.totalPaise += r.amountPaise;
    b.count += 1;
  }
  return [...buckets.values()].sort((a, b) => a.start - b.start);
}

/** Category split over the filtered rows; pct of the filtered total (no div-by-zero). */
function buildCategorySplit(rows: ExpenseDoc[], totalPaise: number): ExpenseCategorySlice[] {
  const byCategory = new Map<string, { totalPaise: number; count: number }>();
  for (const r of rows) {
    const key = r.category.trim() || "Uncategorised";
    const agg = byCategory.get(key) ?? { totalPaise: 0, count: 0 };
    agg.totalPaise += r.amountPaise;
    agg.count += 1;
    byCategory.set(key, agg);
  }
  return [...byCategory.entries()]
    .map(([category, agg]) => ({
      category,
      totalPaise: agg.totalPaise,
      count: agg.count,
      pct: totalPaise > 0 ? Math.round((agg.totalPaise / totalPaise) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.totalPaise - a.totalPaise || a.category.localeCompare(b.category));
}
