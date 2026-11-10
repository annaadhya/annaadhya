"use client";
/**
 * /expenses — the Expenses console per the approved "Modern Indian Heritage" design.
 *
 * Everything on this page is real: no demo rows are invented, no metric is computed
 * in the browser. Feature map (design → implementation):
 *  - summary cards (Total Expenses / Paid / Pending Payment / Expense Records) come
 *    from the API's summary block, computed server-side over the SAME filtered set
 *    as the table below — the two can never disagree, and the numbers cover the
 *    whole filtered dataset, never just the visible page;
 *  - Expense Trend (area/line) and Spending by Category (donut) aggregate the same
 *    filtered set; the trend bucket size (daily/weekly/monthly) is chosen by the API
 *    from the selected span; charts re-fetch with every period/filter change;
 *  - search (⌘K, debounced) matches description, vendor/payee, reference and the
 *    expense id — server-side;
 *  - filters: period (This month / Last 30 days / Last 90 days / Custom — IST),
 *    category (distinct categories present in the period), payment status, payment
 *    method, plus a reset; filters compose with search;
 *  - Export Ledger → the established audited XLSX export
 *    (GET /admin/reports/exports/expenses) carrying the current period; needs
 *    reports:export — honestly disabled otherwise (CSV is not offered because a
 *    browser-side export could only see the current page);
 *  - Add / Edit open the drawer form; amounts are typed in rupees and stored as
 *    integer paise; settlement is validated as a whole (paid ⇒ settled = total,
 *    pending ⇒ settled = 0, partially paid ⇒ strictly between) on the client AND
 *    re-validated server-side;
 *  - View opens the detail drawer straight from the fetched row (the ledger row IS
 *    the full record — no extra round-trip);
 *  - Delete asks a real confirmation dialog that names the record before the API
 *    call; table/metrics/charts refresh only after the backend confirms;
 *  - receipts: the platform's upload infrastructure (Cloudinary) is not configured
 *    in this deployment, so the form offers an attachment LINK instead of faking an
 *    uploader — a real upload button will be wired to POST /admin/media once the
 *    Cloudinary env vars are set;
 *  - raw commodity stock (honey, kesar, dry fruits) is procured under the Purchases
 *    console — creating or editing an expense never touches inventory, and purchase
 *    records never become expenses (no double counting).
 *
 * Data: GET /admin/expenses?from=&to=&search=&category=&status=&method=&page=&pageSize=
 */
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ApiError,
  apiDelete,
  apiGet,
  apiPost,
  can,
  downloadFile,
} from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import {
  dateInputToMillis,
  formatDateTime,
  formatDate,
  formatINR,
  formatNumber,
  istDayEnd,
  istDayStart,
  millisToDateInput,
  paiseToRupeeInput,
  rupeesToPaise,
} from "@/lib/format";
import { useToast } from "@/lib/toast";
import {
  EXPENSE_STATUSES,
  type ExpenseDoc,
  type ExpensePage,
  type ExpensePaymentMethod,
  type ExpenseStatus,
} from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { Skeleton, TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Dialog } from "@/components/ui/dialog";
import { Drawer } from "@/components/ui/drawer";
import { CategoryDonut } from "@/components/category-donut";
import { ExpenseTrendChart } from "@/components/expense-trend-chart";
import {
  IconBag,
  IconCheckCircle,
  IconClock,
  IconDownload,
  IconWallet,
} from "@/components/dashboard-icons";
import { IconExpenses } from "@/components/nav-items";

const PAGE_SIZES = [10, 25, 50] as const;
const SEARCH_DEBOUNCE_MS = 350;

/** Suggested operating categories (the form stays free-form via the datalist). */
const CATEGORY_SUGGESTIONS = [
  "Packaging",
  "Shipping & Delivery",
  "Marketing",
  "Software & Tools",
  "Inventory Handling",
  "Office & Operations",
  "Travel & Transport",
  "Professional Services",
  "Utilities",
  "Other",
];

type PeriodPreset = "month" | "30d" | "90d" | "all" | "custom";

const PERIOD_PRESETS: { value: PeriodPreset; label: string }[] = [
  { value: "month", label: "This month" },
  { value: "30d", label: "Last 30 days" },
  { value: "90d", label: "Last 90 days" },
  { value: "all", label: "All time" },
  { value: "custom", label: "Custom range…" },
];

const STATUS_OPTIONS: { value: ExpenseStatus; label: string }[] = [
  { value: "paid", label: "Status: Paid" },
  { value: "pending", label: "Status: Pending" },
  { value: "partially_paid", label: "Status: Partially paid" },
];

const METHOD_OPTIONS: { value: ExpensePaymentMethod; label: string }[] = [
  { value: "cash", label: "Paid by Cash" },
  { value: "upi", label: "Paid by UPI" },
  { value: "bank_transfer", label: "Paid by Bank transfer" },
  { value: "card", label: "Paid by Card" },
  { value: "other", label: "Paid by Other" },
];

function statusLabel(status: ExpenseStatus): string {
  switch (status) {
    case "paid":
      return "Paid";
    case "pending":
      return "Pending";
    case "partially_paid":
      return "Partially paid";
  }
}

function statusTone(status: ExpenseStatus): "green" | "amber" | "honey" {
  switch (status) {
    case "paid":
      return "green";
    case "pending":
      return "amber";
    case "partially_paid":
      return "honey";
  }
}

function methodLabel(method: ExpensePaymentMethod): string {
  switch (method) {
    case "cash":
      return "Cash";
    case "upi":
      return "UPI";
    case "bank_transfer":
      return "Bank transfer";
    case "card":
      return "Card";
    case "other":
      return "Other";
  }
}

interface PeriodWindow {
  from?: number;
  to?: number;
  label: string;
}

/** Start of the IST calendar month containing `millis` (the "This month" preset). */
function istMonthStart(millis: number): number {
  const shifted = new Date(millis + 330 * 60_000);
  return Date.UTC(shifted.getUTCFullYear(), shifted.getUTCMonth(), 1) - 330 * 60_000;
}

function resolvePeriod(preset: PeriodPreset, customFrom: string, customTo: string): PeriodWindow {
  const now = Date.now();
  switch (preset) {
    case "all":
      return { label: "All time" };
    case "month":
      return { from: istMonthStart(now), to: istDayEnd(now), label: "This month" };
    case "30d":
      return { from: istDayStart(now - 29 * 86_400_000), to: istDayEnd(now), label: "Last 30 days" };
    case "90d":
      return { from: istDayStart(now - 89 * 86_400_000), to: istDayEnd(now), label: "Last 90 days" };
    case "custom": {
      if (!customFrom || !customTo) return { label: "Custom range — pick dates" };
      const from = istDayStart(dateInputToMillis(customFrom));
      const to = istDayEnd(dateInputToMillis(customTo));
      if (from > to) return { label: "Custom range — from must be before to" };
      return { from, to, label: `${customFrom} → ${customTo}` };
    }
  }
}

/** Windowed page list: 1 … c-1 c c+1 … last. */
function pageWindow(current: number, total: number): (number | "…")[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages = new Set<number>([1, total, current - 1, current, current + 1]);
  const sorted = [...pages].filter((p) => p >= 1 && p <= total).sort((a, b) => a - b);
  const out: (number | "…")[] = [];
  let prev = 0;
  for (const p of sorted) {
    if (p - prev > 1) out.push("…");
    out.push(p);
    prev = p;
  }
  return out;
}

interface MetricCardProps {
  label: string;
  value: string;
  note: React.ReactNode;
  tone: "primary" | "secondary" | "gold" | "neutral";
  icon: React.ReactNode;
}

/** Same visual recipe as the Customers console metric card. */
function MetricCard({ label, value, note, tone, icon }: MetricCardProps) {
  const tones = {
    primary: { text: "text-primary", chip: "bg-primary-fixed text-on-primary-fixed-variant" },
    secondary: { text: "text-secondary", chip: "bg-secondary-fixed text-on-secondary-fixed-variant" },
    gold: { text: "text-on-tertiary-fixed-variant", chip: "bg-tertiary-fixed text-on-tertiary-fixed-variant" },
    neutral: { text: "text-on-surface", chip: "bg-surface-container-high text-on-surface-variant" },
  }[tone];
  return (
    <div className="relative overflow-hidden rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)] transition-shadow hover:shadow-[0_2px_12px_rgba(39,24,16,0.08)]">
      <span aria-hidden className="absolute -right-4 -bottom-4 -z-0 h-20 w-20 rounded-full bg-surface-container-high/40" />
      <div className="relative flex items-start justify-between gap-2">
        <span className="label-eyebrow text-on-surface-variant">{label}</span>
        <span aria-hidden className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${tones.chip}`}>
          {icon}
        </span>
      </div>
      <p className={`relative mt-1 font-display text-[28px] font-semibold leading-9 ${tones.text}`}>{value}</p>
      <div className="relative mt-2 flex items-center gap-1.5 text-xs text-on-surface-variant">{note}</div>
    </div>
  );
}

interface ExpenseFormState {
  id: string | null; // null = create, string = edit
  description: string;
  category: string;
  amount: string; // rupees, converted once at submit
  date: string;
  payee: string;
  status: ExpenseStatus;
  method: ExpensePaymentMethod | "";
  amountPaid: string; // rupees; only editable for partially_paid
  reference: string;
  notes: string;
  attachmentUrl: string;
}

function emptyExpenseForm(): ExpenseFormState {
  return {
    id: null,
    description: "",
    category: "",
    amount: "",
    date: millisToDateInput(Date.now()),
    payee: "",
    status: "paid",
    method: "",
    amountPaid: "",
    reference: "",
    notes: "",
    attachmentUrl: "",
  };
}

function formFromDoc(doc: ExpenseDoc): ExpenseFormState {
  return {
    id: doc.id,
    description: doc.description,
    category: doc.category,
    amount: paiseToRupeeInput(doc.amountPaise),
    date: millisToDateInput(doc.date),
    payee: doc.payee ?? "",
    status: doc.status,
    method: doc.paymentMethod ?? "",
    amountPaid: doc.status === "partially_paid" ? paiseToRupeeInput(doc.amountPaidPaise) : "",
    reference: doc.reference ?? "",
    notes: doc.notes ?? "",
    attachmentUrl: doc.attachmentUrl ?? "",
  };
}

export default function ExpensesPage() {
  usePageTitle("Expenses");
  const { principal } = useAuth();
  const toast = useToast();
  const canWrite = can(principal, "expenses:write");
  const canExport = can(principal, "reports:export");

  /* ------------------------------- filter state ------------------------------ */
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState<ExpenseStatus | "">("");
  const [method, setMethod] = useState<ExpensePaymentMethod | "">("");
  const [period, setPeriod] = useState<PeriodPreset>("month");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(10);

  const searchInputRef = useRef<HTMLInputElement>(null);

  // Deep link: ?q= prefills the search (mirrors the Orders console).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const q = params.get("q");
    if (q) {
      setSearchInput(q);
      setSearch(q.trim());
    }
  }, []);

  // ⌘K / Ctrl+K focuses search — matches the console's keyboard hint.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Debounced search — typing never fires one request per keystroke.
  useEffect(() => {
    const t = window.setTimeout(() => setSearch(searchInput.trim()), SEARCH_DEBOUNCE_MS);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const periodWindow = useMemo(() => resolvePeriod(period, customFrom, customTo), [period, customFrom, customTo]);

  const { data, loading, error, reload } = useApiQuery<ExpensePage>(
    () =>
      apiGet<ExpensePage>("/admin/expenses", {
        from: periodWindow.from,
        to: periodWindow.to,
        search: search || undefined,
        category: category || undefined,
        status: status || undefined,
        method: method || undefined,
        page,
        pageSize,
      }),
    [periodWindow.from, periodWindow.to, search, category, status, method, page, pageSize],
  );

  function resetFilters() {
    setSearchInput("");
    setSearch("");
    setCategory("");
    setStatus("");
    setMethod("");
    setPeriod("month");
    setCustomFrom("");
    setCustomTo("");
    setPage(1);
  }

  /* --------------------------------- export ---------------------------------- */
  const [exporting, setExporting] = useState(false);
  async function exportLedger() {
    setExporting(true);
    try {
      await downloadFile("/admin/reports/exports/expenses", {
        from: periodWindow.from,
        to: periodWindow.to,
        includeDemo: "true", // the table shows demo rows (DEMO chip) — the export matches the screen
      });
      toast.success("Export ready", "annaadhya-expenses .xlsx downloaded for the selected period.");
    } catch (err) {
      toast.error("Export failed", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setExporting(false);
    }
  }

  /* ------------------------------ add/edit form ------------------------------ */
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<ExpenseFormState>(emptyExpenseForm);
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  const openCreate = useCallback(() => {
    setForm(emptyExpenseForm());
    setFormError(null);
    setFormOpen(true);
  }, []);

  const openEdit = useCallback((doc: ExpenseDoc) => {
    setForm(formFromDoc(doc));
    setFormError(null);
    setFormOpen(true);
  }, []);

  async function submitForm(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    const categoryValue = form.category.trim();
    const description = form.description.trim();
    if (categoryValue.length < 2) return void setFormError("Category is required (2+ characters).");
    if (description.length < 2) return void setFormError("Description is required (2+ characters).");
    const amountPaise = rupeesToPaise(form.amount);
    if (Number.isNaN(amountPaise) || amountPaise <= 0) return void setFormError("Amount must be greater than ₹0.");
    const date = dateInputToMillis(form.date);
    if (!Number.isFinite(date) || date <= 0) return void setFormError("Pick a valid expense date.");

    // Settlement rules mirror the server's superRefine — fail fast with field-level context.
    let amountPaidPaise: number | undefined;
    if (form.status === "partially_paid") {
      amountPaidPaise = rupeesToPaise(form.amountPaid);
      if (Number.isNaN(amountPaidPaise) || amountPaidPaise <= 0 || amountPaidPaise >= amountPaise) {
        return void setFormError(
          "For a partially paid expense the settled amount must be greater than ₹0 and less than the total.",
        );
      }
    }

    setSaving(true);
    try {
      const body = {
        date,
        category: categoryValue,
        amountPaise,
        description,
        payee: form.payee.trim() || undefined,
        reference: form.reference.trim() || undefined,
        notes: form.notes.trim() || undefined,
        attachmentUrl: form.attachmentUrl.trim() || undefined,
        status: form.status,
        paymentMethod: form.method || undefined,
        ...(form.status === "partially_paid" ? { amountPaidPaise } : {}),
      };
      if (form.id) {
        await apiPost<ExpenseDoc>(`/admin/expenses/${form.id}`, body);
        toast.success("Expense updated", `${categoryValue} · ${formatINR(amountPaise)}`);
      } else {
        await apiPost<ExpenseDoc>("/admin/expenses", body);
        toast.success("Expense recorded", `${categoryValue} · ${formatINR(amountPaise)}`);
      }
      setFormOpen(false);
      reload();
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setSaving(false);
    }
  }

  /* ------------------------------ detail drawer ------------------------------ */
  const [detail, setDetail] = useState<ExpenseDoc | null>(null);
  const closeDetail = useCallback(() => setDetail(null), []);

  /* ------------------------------ delete dialog ------------------------------ */
  const [deleteTarget, setDeleteTarget] = useState<ExpenseDoc | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function confirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await apiDelete(`/admin/expenses/${deleteTarget.id}`);
      toast.success("Expense deleted", `${deleteTarget.category} · ${formatINR(deleteTarget.amountPaise)}`);
      setDeleteTarget(null);
      if (detail?.id === deleteTarget.id) setDetail(null);
      reload();
    } catch (err) {
      toast.error("Could not delete expense", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setDeleting(false);
    }
  }

  /* --------------------------------- render ---------------------------------- */
  const summary = data?.summary;
  const rows = data?.items ?? [];
  const hasActiveFilters =
    Boolean(search) || Boolean(category) || Boolean(status) || Boolean(method) || period !== "month" || Boolean(customFrom || customTo);
  const isTrulyEmpty = data && data.total === 0 && !hasActiveFilters;
  const topCategory = data?.categories[0];

  return (
    <div>
      <PageHeader
        eyebrow={
          <span className="rounded-full bg-tertiary-fixed px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-widest text-on-tertiary-fixed-variant">
            Operating Ledger
          </span>
        }
        title="Expenses"
        description="Track business spending and manage operating expenses in one place. Raw commodity stock (honey, kesar, dry fruits) is booked under Purchases — this ledger is for overheads only."
        actions={
          <>
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-surface-container-lowest px-3 py-2 shadow-[0_1px_6px_rgba(39,24,16,0.06)] transition-colors hover:bg-surface-container-low">
              <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4 shrink-0 text-outline" fill="none" stroke="currentColor" strokeWidth="1.8">
                <rect x="3" y="5" width="18" height="16" rx="2" />
                <path d="M3 10h18M8 3v4m8-4v4" strokeLinecap="round" />
              </svg>
              <Select
                aria-label="Expense period"
                className="cursor-pointer border-0 bg-transparent p-0 pr-5 text-xs font-semibold text-on-surface shadow-none focus:ring-0"
                value={period}
                onChange={(e) => {
                  setPeriod(e.target.value as PeriodPreset);
                  setPage(1);
                }}
              >
                {PERIOD_PRESETS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.value === "custom" && customFrom && customTo ? `${customFrom} → ${customTo}` : p.label}
                  </option>
                ))}
              </Select>
            </label>
            <span title={canExport ? "Download the current period as XLSX" : "Needs the reports:export permission"}>
              <Button variant="secondary" onClick={() => void exportLedger()} disabled={!canExport || exporting} loading={exporting}>
                <IconDownload className="h-4 w-4" />
                Export Ledger
              </Button>
            </span>
            {canWrite ? (
              <Button onClick={openCreate}>+ Add Expense</Button>
            ) : null}
          </>
        }
      />

      {period === "custom" ? (
        <div className="mb-4 flex flex-wrap items-end gap-3 rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
          <label className="text-xs font-semibold text-on-surface-variant">
            From
            <input
              type="date"
              value={customFrom}
              max={customTo || undefined}
              onChange={(e) => {
                setCustomFrom(e.target.value);
                setPage(1);
              }}
              className="ml-2 rounded-lg bg-surface-container-low px-2 py-1.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <label className="text-xs font-semibold text-on-surface-variant">
            To
            <input
              type="date"
              value={customTo}
              min={customFrom || undefined}
              onChange={(e) => {
                setCustomTo(e.target.value);
                setPage(1);
              }}
              className="ml-2 rounded-lg bg-surface-container-low px-2 py-1.5 text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
            />
          </label>
          <span className="text-xs text-outline">Expense dates are IST calendar days. Cards, charts and the table all follow this range.</span>
        </div>
      ) : null}

      {/* ------------------------------ summary cards ------------------------------ */}
      {!data && loading ? (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" role="status" aria-label="Loading summary">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
              <Skeleton className="h-3 w-20" />
              <Skeleton className="mt-3 h-7 w-32" />
              <Skeleton className="mt-2 h-3 w-24" />
            </div>
          ))}
        </div>
      ) : summary ? (
        <div className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4" aria-label="Expense summary">
          <MetricCard
            label="Total Expenses"
            value={formatINR(summary.totalPaise)}
            tone="primary"
            icon={<IconWallet className="h-5 w-5" />}
            note={<span>recorded in {periodWindow.label.toLowerCase()}</span>}
          />
          <MetricCard
            label="Paid"
            value={formatINR(summary.paidPaise)}
            tone="secondary"
            icon={<IconCheckCircle className="h-5 w-5" />}
            note={
              <span>
                {summary.totalPaise > 0
                  ? `${Math.round((summary.paidPaise / summary.totalPaise) * 1000) / 10}% settled across ${formatNumber(summary.paidCount)} ${summary.paidCount === 1 ? "bill" : "bills"}`
                  : "nothing settled yet"}
              </span>
            }
          />
          <MetricCard
            label="Pending Payment"
            value={formatINR(summary.pendingPaise)}
            tone="gold"
            icon={<IconClock className="h-5 w-5" />}
            note={
              <span>
                awaiting settlement on{" "}
                {formatNumber(summary.pendingCount + summary.partiallyPaidCount)}{" "}
                {summary.pendingCount + summary.partiallyPaidCount === 1 ? "bill" : "bills"}
              </span>
            }
          />
          <MetricCard
            label="Expense Records"
            value={formatNumber(summary.recordCount)}
            tone="neutral"
            icon={<IconBag className="h-5 w-5" />}
            note={<span>{summary.partiallyPaidCount} partially paid in this view</span>}
          />
        </div>
      ) : null}
      {summary ? (
        <p className="mb-4 -mt-3 text-[11px] text-outline">
          Total counts every recorded expense — pending and partially paid bills included. Paid shows what has actually been
          settled; the difference is the outstanding balance. Purchases of stock are accounted under the Purchases console, never here.
        </p>
      ) : null}

      {/* ------------------------------- analytics -------------------------------- */}
      <div className="mb-6 grid grid-cols-1 gap-4 lg:grid-cols-12">
        <div className="rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)] lg:col-span-7">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="font-display text-lg font-semibold text-primary">Expense Trend</h2>
              <p className="text-xs text-on-surface-variant">
                {periodWindow.label}
                {periodWindow.from && periodWindow.to && period !== "custom"
                  ? ` · ${formatDate(periodWindow.from)} – ${formatDate(periodWindow.to)}`
                  : ""}
              </p>
            </div>
            {data ? (
              <span className="rounded-full bg-surface-container px-2.5 py-0.5 text-[11px] font-bold uppercase tracking-wider text-on-surface-variant">
                {data.trendUnit === "day" ? "Daily" : data.trendUnit === "week" ? "Weekly" : "Monthly"}
              </span>
            ) : null}
          </div>
          {loading && !data ? (
            <Skeleton className="h-56 w-full" />
          ) : (
            <ExpenseTrendChart buckets={data?.trend ?? []} unit={data?.trendUnit ?? "day"} />
          )}
        </div>
        <div className="rounded-xl bg-surface-container-lowest p-4 shadow-[0_1px_8px_rgba(39,24,16,0.05)] lg:col-span-5">
          <div className="mb-2">
            <h2 className="font-display text-lg font-semibold text-primary">Spending by Category</h2>
            <p className="text-xs text-on-surface-variant">Breakdown across operating overheads</p>
          </div>
          {loading && !data ? (
            <Skeleton className="mx-auto h-44 w-44" />
          ) : (
            <>
              <CategoryDonut
                rows={(data?.categories ?? []).map((c) => ({ categoryId: c.category, name: c.category, revenuePaise: c.totalPaise }))}
                centerCaption="recorded"
                emptyTitle="No spending in this view"
                emptyDescription="Category shares appear once expenses are recorded in the selected range."
              />
              {topCategory && summary && summary.totalPaise > 0 ? (
                <p className="mt-3 rounded-lg bg-surface-container px-3 py-1.5 text-center text-[11px] text-on-surface-variant">
                  {topCategory.category} represents the highest overhead at {topCategory.pct}% of this view.
                </p>
              ) : null}
            </>
          )}
        </div>
      </div>

      {/* ------------------------------- records ---------------------------------- */}
      <div className="overflow-hidden rounded-xl bg-surface-container-lowest shadow-[0_1px_8px_rgba(39,24,16,0.05)]">
        <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <div>
            <h2 className="font-display text-lg font-semibold text-primary">Expense Records</h2>
            <p className="text-xs text-on-surface-variant">View, search, and manage recorded operating expenses.</p>
          </div>
          {data ? (
            <span className="w-fit rounded-full bg-surface-container px-2.5 py-1 text-xs font-bold text-primary">
              {formatNumber(data.total)} total {data.total === 1 ? "entry" : "entries"}
            </span>
          ) : null}
        </div>

        {/* search + filters */}
        <div className="border-t border-outline-variant/30 bg-surface-container-low px-4 py-3 sm:px-6">
          <div className="flex flex-col gap-3 xl:flex-row xl:items-center">
            <div className="relative min-w-[240px] flex-1">
              <svg
                aria-hidden
                viewBox="0 0 24 24"
                className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-outline"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" strokeLinecap="round" />
              </svg>
              <input
                ref={searchInputRef}
                type="search"
                value={searchInput}
                onChange={(e) => {
                  setSearchInput(e.target.value);
                  setPage(1);
                }}
                placeholder="Search description, vendor, or reference…"
                aria-label="Search expenses"
                className="w-full rounded-lg bg-surface-container-lowest py-2.5 pl-11 pr-16 text-[13px] text-on-surface shadow-inner placeholder:text-on-surface-variant/70 focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <span
                aria-hidden
                className="absolute right-3 top-1/2 flex -translate-y-1/2 items-center gap-0.5 rounded bg-surface-container px-1.5 py-0.5 text-[11px] text-outline shadow-sm"
              >
                <kbd>⌘</kbd>
                <kbd>K</kbd>
              </span>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="w-44">
                <Select
                  aria-label="Filter by category"
                  className="cursor-pointer bg-surface-container-lowest py-2 text-xs font-semibold"
                  value={category}
                  onChange={(e) => {
                    setCategory(e.target.value);
                    setPage(1);
                  }}
                >
                  <option value="">All categories</option>
                  {(data?.categoryOptions ?? []).map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-44">
                <Select
                  aria-label="Filter by payment status"
                  className="cursor-pointer bg-surface-container-lowest py-2 text-xs font-semibold"
                  value={status}
                  onChange={(e) => {
                    setStatus(e.target.value as ExpenseStatus | "");
                    setPage(1);
                  }}
                >
                  <option value="">All statuses</option>
                  {STATUS_OPTIONS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </Select>
              </div>
              <div className="w-44">
                <Select
                  aria-label="Filter by payment method"
                  className="cursor-pointer bg-surface-container-lowest py-2 text-xs font-semibold"
                  value={method}
                  onChange={(e) => {
                    setMethod(e.target.value as ExpensePaymentMethod | "");
                    setPage(1);
                  }}
                >
                  <option value="">All payment methods</option>
                  {METHOD_OPTIONS.map((m) => (
                    <option key={m.value} value={m.value}>
                      {m.label}
                    </option>
                  ))}
                </Select>
              </div>
              <button
                type="button"
                title="Reset filters"
                aria-label="Reset filters"
                onClick={resetFilters}
                className="rounded-lg p-2 text-on-surface-variant transition-colors hover:bg-surface-container-lowest hover:text-primary"
              >
                <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8">
                  <path d="M4 6h9m7 0h-3M4 12h3m13 0h-9M4 18h9m5 0h-1" strokeLinecap="round" />
                  <circle cx="16" cy="6" r="2" />
                  <circle cx="10" cy="12" r="2" />
                  <circle cx="15" cy="18" r="2" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* table */}
        {loading ? (
          <TableSkeleton rows={8} cols={7} />
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : rows.length === 0 ? (
          isTrulyEmpty ? (
            <EmptyState
              icon={<IconExpenses className="h-6 w-6" />}
              title="No expenses yet"
              description="Record packaging, freight, marketing and other operating costs here. Stock purchases stay under the Purchases console."
              action={
                canWrite ? (
                  <Button size="sm" onClick={openCreate}>
                    + Add Expense
                  </Button>
                ) : null
              }
            />
          ) : (
            <EmptyState
              title="No expenses match"
              description="No records match the current search and filters."
              action={
                <Button variant="outline" size="sm" onClick={resetFilters}>
                  Clear filters
                </Button>
              }
            />
          )
        ) : (
          <>
            <Table>
              <THead>
                <TR>
                  <TH scope="col">Expense / Description</TH>
                  <TH scope="col">Category</TH>
                  <TH scope="col">Vendor / Payee</TH>
                  <TH scope="col">Date</TH>
                  <TH scope="col" className="text-right">
                    Amount
                  </TH>
                  <TH scope="col" className="text-center">
                    Status
                  </TH>
                  <TH scope="col" className="text-right">
                    Actions
                  </TH>
                </TR>
              </THead>
              <TBody>
                {rows.map((x) => {
                  const balance = Math.max(0, x.amountPaise - x.amountPaidPaise);
                  return (
                    <TR key={x.id} className="cursor-pointer" onClick={() => setDetail(x)}>
                      <TD className="max-w-[16rem]">
                        <span className="block truncate font-semibold text-on-surface" title={x.description}>
                          {x.description}
                        </span>
                        <span className="flex items-center gap-1.5 text-[11px] text-on-surface-variant">
                          <span className="font-mono">{x.id}</span>
                          {x.reference ? <span className="truncate">· {x.reference}</span> : null}
                          {x.isDemo ? (
                            <span className="rounded bg-tertiary-fixed px-1 py-0.5 text-[10px] font-bold uppercase tracking-wider text-on-tertiary-fixed-variant">
                              Demo
                            </span>
                          ) : null}
                        </span>
                      </TD>
                      <TD>
                        <Badge>{x.category}</Badge>
                      </TD>
                      <TD className="max-w-[12rem]">
                        <span className="block truncate text-on-surface" title={x.payee ?? undefined}>
                          {x.payee || <span className="italic text-outline">—</span>}
                        </span>
                      </TD>
                      <TD className="whitespace-nowrap text-on-surface-variant">{formatDate(x.date)}</TD>
                      <TD className="whitespace-nowrap text-right">
                        <span className="font-display text-[15px] font-bold text-primary">{formatINR(x.amountPaise)}</span>
                        {x.status === "partially_paid" ? (
                          <span className="block text-[11px] text-outline">bal. {formatINR(balance)}</span>
                        ) : null}
                      </TD>
                      <TD className="text-center">
                        <Badge tone={statusTone(x.status)}>{statusLabel(x.status)}</Badge>
                        {x.status === "partially_paid" ? (
                          <span className="mt-0.5 block text-[11px] text-outline">{formatINR(x.amountPaidPaise)} settled</span>
                        ) : null}
                      </TD>
                      <TD className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => setDetail(x)}
                            className="inline-block rounded bg-surface-container-low px-2.5 py-1 text-xs font-bold text-primary shadow-sm transition-colors hover:bg-surface-container"
                          >
                            View
                          </button>
                          {canWrite ? (
                            <>
                              <Button variant="ghost" size="sm" onClick={() => openEdit(x)}>
                                Edit
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-error hover:bg-error-container/40"
                                onClick={() => setDeleteTarget(x)}
                              >
                                Delete
                              </Button>
                            </>
                          ) : null}
                        </div>
                      </TD>
                    </TR>
                  );
                })}
              </TBody>
            </Table>

            {/* pagination footer */}
            <div className="flex flex-col items-center justify-between gap-3 border-t border-outline-variant/30 bg-surface-container-low px-4 py-3 text-[13px] text-on-surface-variant sm:flex-row sm:px-6">
              <div className="flex flex-wrap items-center gap-4">
                <span>
                  Showing{" "}
                  <strong className="text-on-surface">
                    {(data!.page - 1) * data!.pageSize + 1}–{Math.min(data!.page * data!.pageSize, data!.total)}
                  </strong>{" "}
                  of <strong className="text-on-surface">{formatNumber(data!.total)}</strong> records
                </span>
                <label className="flex items-center gap-2 text-xs">
                  <span className="text-xs font-semibold uppercase tracking-wider text-outline">Show</span>
                  <select
                    value={pageSize}
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPage(1);
                    }}
                    className="cursor-pointer rounded bg-surface-container-lowest px-2 py-1 text-xs font-semibold text-on-surface focus:outline-none focus:ring-1 focus:ring-primary"
                    aria-label="Expenses per page"
                  >
                    {PAGE_SIZES.map((n) => (
                      <option key={n} value={n}>
                        {n} per page
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <nav aria-label="Expenses pagination" className="flex items-center gap-1">
                <button
                  type="button"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  aria-label="Previous page"
                  className="rounded-lg bg-surface-container-lowest p-1.5 text-outline shadow-sm transition-colors hover:text-on-surface disabled:opacity-40"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m14 6-6 6 6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {pageWindow(data!.page, data!.totalPages).map((p, i) =>
                  p === "…" ? (
                    <span key={`gap-${i}`} className="px-1 text-outline">
                      …
                    </span>
                  ) : (
                    <button
                      key={p}
                      type="button"
                      onClick={() => setPage(p)}
                      aria-current={p === data!.page ? "page" : undefined}
                      className={`h-8 w-8 rounded-lg text-xs font-bold shadow-sm transition-colors ${
                        p === data!.page
                          ? "bg-primary text-on-primary"
                          : "bg-surface-container-lowest text-on-surface hover:bg-surface-container"
                      }`}
                    >
                      {p}
                    </button>
                  ),
                )}
                <button
                  type="button"
                  disabled={page >= data!.totalPages}
                  onClick={() => setPage((p) => p + 1)}
                  aria-label="Next page"
                  className="rounded-lg bg-surface-container-lowest p-1.5 text-outline shadow-sm transition-colors hover:text-on-surface disabled:opacity-40"
                >
                  <svg aria-hidden viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m10 6 6 6-6 6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </nav>
            </div>
          </>
        )}
      </div>

      {/* ----------------------------- add / edit drawer ---------------------------- */}
      <Drawer
        open={formOpen}
        onClose={() => setFormOpen(false)}
        title={
          <div>
            <h2 className="font-display text-lg font-semibold text-on-surface">{form.id ? "Edit expense" : "Add expense"}</h2>
            <p className="text-xs text-on-surface-variant">Amounts are typed in rupees and stored as integer paise.</p>
          </div>
        }
        footer={
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setFormOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" form="expense-form" loading={saving}>
              {form.id ? "Save changes" : "Record expense"}
            </Button>
          </div>
        }
      >
        <form id="expense-form" className="space-y-4" onSubmit={submitForm} noValidate>
          <Field label="Description" htmlFor="expense-description" required>
            <Textarea
              id="expense-description"
              rows={2}
              maxLength={500}
              value={form.description}
              onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
              placeholder="e.g. Festive tinplate canisters & gold seal foils"
              required
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Category" htmlFor="expense-category" required hint="Pick a suggestion or type your own">
              <Input
                id="expense-category"
                list="expense-category-suggestions"
                maxLength={60}
                value={form.category}
                onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                placeholder="Packaging"
                required
              />
              <datalist id="expense-category-suggestions">
                {[...new Set([...(data?.categoryOptions ?? []), ...CATEGORY_SUGGESTIONS])].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
            <Field label="Amount (₹)" htmlFor="expense-amount" required>
              <Input
                id="expense-amount"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.amount}
                onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                placeholder="1250.00"
                required
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Expense date" htmlFor="expense-date" required>
              <Input
                id="expense-date"
                type="date"
                value={form.date}
                onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                required
              />
            </Field>
            <Field label="Vendor / payee" htmlFor="expense-payee">
              <Input
                id="expense-payee"
                maxLength={120}
                value={form.payee}
                onChange={(e) => setForm((f) => ({ ...f, payee: e.target.value }))}
                placeholder="e.g. Khari Baoli Packaging Co."
              />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Payment status" htmlFor="expense-status" required>
              <Select
                id="expense-status"
                value={form.status}
                onChange={(e) => setForm((f) => ({ ...f, status: e.target.value as ExpenseStatus }))}
              >
                {EXPENSE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {statusLabel(s)}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="Payment method" htmlFor="expense-method">
              <Select
                id="expense-method"
                value={form.method}
                onChange={(e) => setForm((f) => ({ ...f, method: e.target.value as ExpensePaymentMethod | "" }))}
              >
                <option value="">Not specified</option>
                {METHOD_OPTIONS.map((m) => (
                  <option key={m.value} value={m.value}>
                    {methodLabel(m.value)}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          {form.status === "partially_paid" ? (
            <Field
              label="Amount settled (₹)"
              htmlFor="expense-amount-paid"
              required
              hint="Must be greater than ₹0 and less than the total — the balance stays pending."
            >
              <Input
                id="expense-amount-paid"
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={form.amountPaid}
                onChange={(e) => setForm((f) => ({ ...f, amountPaid: e.target.value }))}
                placeholder="750.00"
                required
              />
            </Field>
          ) : (
            <p className="rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface-variant">
              {form.status === "paid"
                ? "The full amount will be recorded as settled."
                : "Nothing will be recorded as settled yet — the full amount still counts as a recorded expense."}
            </p>
          )}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Reference number" htmlFor="expense-reference">
              <Input
                id="expense-reference"
                maxLength={120}
                value={form.reference}
                onChange={(e) => setForm((f) => ({ ...f, reference: e.target.value }))}
                placeholder="UPI ref, invoice no…"
              />
            </Field>
            <Field
              label="Receipt link"
              htmlFor="expense-attachment"
              hint="Paste a hosted bill/receipt URL — file upload lands when Cloudinary is configured."
            >
              <Input
                id="expense-attachment"
                type="url"
                maxLength={600}
                value={form.attachmentUrl}
                onChange={(e) => setForm((f) => ({ ...f, attachmentUrl: e.target.value }))}
                placeholder="https://…"
              />
            </Field>
          </div>
          <Field label="Notes" htmlFor="expense-notes">
            <Textarea
              id="expense-notes"
              rows={2}
              maxLength={1000}
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              placeholder="Internal context (optional)"
            />
          </Field>
          {formError ? (
            <p role="alert" className="rounded-md border border-error/30 bg-error-container p-2.5 text-sm text-on-error-container">
              {formError}
            </p>
          ) : null}
        </form>
      </Drawer>

      {/* ----------------------------- detail drawer ------------------------------ */}
      <Drawer
        open={detail !== null}
        onClose={closeDetail}
        title={
          detail ? (
            <div className="min-w-0">
              <p className="label-eyebrow text-on-surface-variant">{detail.id}</p>
              <h2 className="font-display text-lg font-semibold text-on-surface">{detail.description}</h2>
            </div>
          ) : null
        }
        footer={
          detail && canWrite ? (
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => openEdit(detail)}>
                Edit
              </Button>
              <Button variant="danger" onClick={() => setDeleteTarget(detail)}>
                Delete
              </Button>
            </div>
          ) : null
        }
      >
        {detail ? (
          <div className="space-y-5">
            <div className="rounded-xl bg-surface-container-low p-4">
              <div className="grid grid-cols-3 gap-3 text-center">
                <div>
                  <p className="label-eyebrow text-on-surface-variant">Total</p>
                  <p className="mt-1 font-display text-lg font-bold text-primary">{formatINR(detail.amountPaise)}</p>
                </div>
                <div>
                  <p className="label-eyebrow text-on-surface-variant">Settled</p>
                  <p className="mt-1 font-display text-lg font-bold text-secondary">{formatINR(detail.amountPaidPaise)}</p>
                </div>
                <div>
                  <p className="label-eyebrow text-on-surface-variant">Balance</p>
                  <p
                    className={`mt-1 font-display text-lg font-bold ${
                      detail.amountPaise - detail.amountPaidPaise > 0 ? "text-on-tertiary-fixed-variant" : "text-outline"
                    }`}
                  >
                    {formatINR(Math.max(0, detail.amountPaise - detail.amountPaidPaise))}
                  </p>
                </div>
              </div>
            </div>
            <dl className="space-y-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <dt className="text-on-surface-variant">Status</dt>
                <dd>
                  <Badge tone={statusTone(detail.status)}>{statusLabel(detail.status)}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-on-surface-variant">Category</dt>
                <dd>
                  <Badge>{detail.category}</Badge>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-on-surface-variant">Expense date</dt>
                <dd className="font-medium text-on-surface">{formatDate(detail.date)}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-on-surface-variant">Vendor / payee</dt>
                <dd className="text-right font-medium text-on-surface">{detail.payee || "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-on-surface-variant">Payment method</dt>
                <dd className="font-medium text-on-surface">{detail.paymentMethod ? methodLabel(detail.paymentMethod) : "—"}</dd>
              </div>
              <div className="flex items-center justify-between gap-3">
                <dt className="text-on-surface-variant">Reference</dt>
                <dd className="text-right font-medium text-on-surface">{detail.reference || "—"}</dd>
              </div>
              {detail.notes ? (
                <div>
                  <dt className="text-on-surface-variant">Notes</dt>
                  <dd className="mt-1 whitespace-pre-wrap rounded-lg bg-surface-container-low p-3 text-on-surface">{detail.notes}</dd>
                </div>
              ) : null}
              {detail.attachmentUrl ? (
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-on-surface-variant">Receipt</dt>
                  <dd>
                    <a
                      href={detail.attachmentUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block max-w-[14rem] truncate text-xs font-semibold text-secondary underline hover:text-primary"
                    >
                      Open receipt ↗
                    </a>
                  </dd>
                </div>
              ) : null}
            </dl>
            <div className="border-t border-outline-variant/30 pt-3 text-xs text-on-surface-variant">
              <p>Recorded by {detail.createdByName || detail.createdByUid} · {formatDateTime(detail.createdAt)}</p>
              {detail.updatedByName || detail.updatedByUid ? (
                <p className="mt-0.5">
                  Last updated by {detail.updatedByName || detail.updatedByUid} · {formatDateTime(detail.updatedAt)}
                </p>
              ) : null}
              <p className="mt-2 italic text-outline">
                Editing an expense never touches inventory, and supplier purchases stay under the Purchases console.
              </p>
            </div>
          </div>
        ) : null}
      </Drawer>

      {/* ----------------------------- delete dialog ------------------------------ */}
      <Dialog
        open={deleteTarget !== null}
        onClose={() => (deleting ? undefined : setDeleteTarget(null))}
        title="Delete this expense?"
        description="This permanently removes the record. Deletion cannot be undone."
      >
        {deleteTarget ? (
          <div className="space-y-4">
            <div className="rounded-xl bg-surface-container-low p-4 text-sm">
              <p className="font-semibold text-on-surface">{deleteTarget.description}</p>
              <p className="mt-1 text-xs text-on-surface-variant">
                {deleteTarget.category} · {formatDate(deleteTarget.date)} · {formatINR(deleteTarget.amountPaise)} ·{" "}
                {statusLabel(deleteTarget.status)}
              </p>
            </div>
            <p className="text-xs text-on-surface-variant">
              Summary cards and charts refresh only after the API confirms the deletion.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="ghost" disabled={deleting} onClick={() => setDeleteTarget(null)}>
                Cancel
              </Button>
              <Button variant="danger" loading={deleting} onClick={() => void confirmDelete()}>
                Delete expense
              </Button>
            </div>
          </div>
        ) : null}
      </Dialog>
    </div>
  );
}


