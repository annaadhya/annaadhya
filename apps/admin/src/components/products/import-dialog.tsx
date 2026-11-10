"use client";
/**
 * ImportBatchDialog — CSV batch product creation for the catalogue (design's "Import Batch").
 * Each row creates ONE draft product with a single variant (safe default: nothing goes live
 * without an explicit publish). Mirrors the API's validation client-side so bad rows are
 * reported before any request is made; server errors are reported per row after the run.
 */
import { useEffect, useMemo, useState } from "react";
import { apiPost } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { rupeesToPaise } from "@/lib/format";
import { parseCsv } from "@/lib/csv";
import type { CategoryDoc } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";

const SKU_RE = /^[A-Z0-9][A-Z0-9\-_.]{2,40}$/;
const MAX_BATCH = 100;
const DEFAULT_DESCRIPTION = "Imported catalogue item. Full description to be added by the team.";

const SAMPLE_CSV = [
  "sku,name,subtitle,description,category,price,mrp,stock,pack,grams",
  "HON-EUC-250,Eucalyptus Forest Honey,Single-forest harvest,Cold-extracted eucalyptus honey from the Nilgiri foothills.,Wild & Floral Honey,549,699,40,250g Jar,250",
  "NUT-PEC-200,Heritage Pecans,Shelled pecan halves,Sun-dried pecan halves graded for gifting tins.,Dry Fruits & Nuts,720,,25,200g Tin,200",
].join("\n");

interface ParsedRow {
  line: number;
  sku: string;
  name: string;
  subtitle: string;
  description: string;
  categoryId: string;
  categoryName: string;
  pricePaise: number;
  mrpPaise?: number;
  stock: number;
  pack: string;
  grams: number;
}

interface RowError {
  line: number;
  sku: string;
  message: string;
}

function splitHeaderless(rows: string[][]): { header: string[]; body: string[][] } {
  const [header = [], ...body] = rows;
  return { header: header.map((h) => h.trim().toLowerCase()), body };
}

export function ImportBatchDialog({
  open,
  onClose,
  categories,
  existingSkus,
  onImported,
}: {
  open: boolean;
  onClose: () => void;
  categories: CategoryDoc[];
  existingSkus: Set<string>;
  onImported: () => void;
}) {
  const toast = useToast();
  const [raw, setRaw] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ created: number; errors: RowError[] } | null>(null);

  useEffect(() => {
    if (!open) {
      setRaw("");
      setRunning(false);
      setProgress(null);
      setResult(null);
    }
  }, [open]);

  const parsed = useMemo<{ rows: ParsedRow[]; errors: RowError[]; ready: boolean }>(() => {
    const rows: ParsedRow[] = [];
    const errors: RowError[] = [];
    if (!raw.trim()) return { rows, errors, ready: false };

    const { header, body } = splitHeaderless(parseCsv(raw));
    const col = (name: string) => header.indexOf(name);
    if (col("sku") < 0 || col("name") < 0 || col("price") < 0 || col("category") < 0) {
      errors.push({
        line: 1,
        sku: "—",
        message: 'Header row must include at least: sku, name, price, category (plus optional subtitle, description, mrp, stock, pack, grams)',
      });
      return { rows, errors, ready: false };
    }

    const seen = new Set<string>();
    body.forEach((cells, index) => {
      const line = index + 2;
      const get = (name: string) => (col(name) >= 0 ? (cells[col(name)] ?? "").trim() : "");
      const sku = get("sku").toUpperCase();
      const name = get("name");
      const pricePaise = rupeesToPaise(get("price"));

      const fail = (message: string) => errors.push({ line, sku: sku || "—", message });
      if (!SKU_RE.test(sku)) return fail("SKU must be 3-41 chars: A-Z, 0-9, dashes, dots or underscores");
      if (seen.has(sku)) return fail("Duplicate SKU inside this file");
      if (existingSkus.has(sku)) return fail("SKU already exists in the catalogue");
      if (name.length < 2 || name.length > 120) return fail("Name must be 2-120 characters");
      if (!Number.isFinite(pricePaise) || pricePaise <= 0) return fail("Price must be a positive rupee amount");

      const categoryInput = get("category");
      const category = categories.find(
        (c) => c.id === categoryInput || c.name.toLowerCase() === categoryInput.toLowerCase() || c.slug === categoryInput.toLowerCase(),
      );
      if (!category) return fail(`Unknown category "${categoryInput}"`);

      const mrpInput = get("mrp") ? rupeesToPaise(get("mrp")) : NaN;
      if (Number.isFinite(mrpInput) && mrpInput > 0 && mrpInput < pricePaise) {
        return fail("MRP cannot be lower than the selling price");
      }

      const stockRaw = get("stock");
      const stock = stockRaw === "" ? 0 : Number(stockRaw);
      if (!Number.isInteger(stock) || stock < 0) return fail("Stock must be a whole number ≥ 0");

      const gramsRaw = get("grams");
      const grams = gramsRaw === "" ? 100 : Number(gramsRaw);
      if (!Number.isFinite(grams) || grams <= 0) return fail("Grams must be a positive number");

      seen.add(sku);
      rows.push({
        line,
        sku,
        name,
        subtitle: get("subtitle").slice(0, 180),
        description: get("description").length >= 10 ? get("description") : DEFAULT_DESCRIPTION,
        categoryId: category.id,
        categoryName: category.name,
        pricePaise,
        mrpPaise: Number.isFinite(mrpInput) && mrpInput > 0 ? mrpInput : undefined,
        stock,
        pack: (get("pack") || "Standard").slice(0, 40),
        grams,
      });
    });

    if (rows.length > MAX_BATCH) {
      errors.push({ line: 0, sku: "—", message: `Batch too large — import at most ${MAX_BATCH} rows per run` });
      return { rows: rows.slice(0, MAX_BATCH), errors, ready: false };
    }
    return { rows, errors, ready: rows.length > 0 && errors.length === 0 };
  }, [raw, categories, existingSkus]);

  async function runImport() {
    if (!parsed.ready) return;
    setRunning(true);
    setResult(null);
    const errors: RowError[] = [];
    let created = 0;
    setProgress({ done: 0, total: parsed.rows.length });

    for (const [index, row] of parsed.rows.entries()) {
      try {
        await apiPost("/admin/catalogue/products", {
          sku: row.sku,
          name: row.name,
          subtitle: row.subtitle,
          description: row.description,
          categoryId: row.categoryId,
          typeLabel: row.categoryName,
          status: "draft",
          images: [],
          giftItem: false,
          seo: {},
          variants: [
            {
              sku: row.sku,
              packLabel: row.pack,
              grams: row.grams,
              pricePaise: row.pricePaise,
              mrpPaise: row.mrpPaise,
              status: "draft",
              stockOnHand: row.stock,
              lowStockThreshold: 5,
            },
          ],
        });
        created++;
      } catch (err) {
        errors.push({
          line: row.line,
          sku: row.sku,
          message: err instanceof Error ? err.message : "Unexpected error",
        });
      }
      setProgress({ done: index + 1, total: parsed.rows.length });
    }

    setProgress(null);
    setResult({ created, errors });
    setRunning(false);
    if (created > 0) {
      toast.success(`Imported ${created} product${created === 1 ? "" : "s"} as drafts`, "Review and publish them from the list");
      onImported();
    }
    if (errors.length > 0) {
      toast.error(`${errors.length} row${errors.length === 1 ? "" : "s"} could not be imported`, "Details are listed in the dialog");
    }
  }

  function downloadSample() {
    const blob = new Blob([SAMPLE_CSV], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "annaadhya-product-import-sample.csv";
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }

  return (
    <Dialog
      open={open}
      onClose={running ? () => undefined : onClose}
      title="Import batch"
      description="Upload a CSV to create draft products — one row per product with a single variant. Nothing is published automatically."
      wide
      footer={
        <div className="flex w-full flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={downloadSample}
            disabled={running}
            className="text-xs font-semibold text-secondary underline underline-offset-2 hover:text-on-secondary-fixed-variant disabled:opacity-50"
          >
            Download sample CSV
          </button>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={onClose} disabled={running}>
              Cancel
            </Button>
            <Button size="sm" onClick={runImport} disabled={!parsed.ready || running} loading={running}>
              {running && progress
                ? `Importing ${progress.done}/${progress.total}…`
                : `Import ${parsed.rows.length} draft${parsed.rows.length === 1 ? "" : "s"}`}
            </Button>
          </div>
        </div>
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-outline-variant/70 bg-surface-container-lowest px-3 text-sm font-semibold text-on-surface shadow-sm transition-colors hover:bg-surface-container">
            <svg viewBox="0 0 24 24" className="h-4 w-4 text-secondary" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M17 8l-5-5-5 5M12 3v12" />
            </svg>
            Choose CSV file
            <input
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              disabled={running}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (file) setRaw(await file.text());
                e.target.value = "";
              }}
            />
          </label>
          <p className="text-xs text-on-surface-variant">
            Columns: <span className="font-mono">sku, name, price, category</span> (required) ·{" "}
            <span className="font-mono">subtitle, description, mrp, stock, pack, grams</span> (optional)
          </p>
        </div>

        <textarea
          value={raw}
          onChange={(e) => setRaw(e.target.value)}
          disabled={running}
          rows={6}
          spellCheck={false}
          placeholder={"sku,name,subtitle,description,category,price,mrp,stock,pack,grams\nHON-EUC-250,Eucalyptus Forest Honey,…,Wild & Floral Honey,549,699,40,250g Jar,250"}
          aria-label="CSV content"
          className="w-full rounded-lg bg-surface-container-low p-3 font-mono text-xs text-on-surface placeholder:text-on-surface-variant/60 focus:bg-surface-container-lowest focus:outline-none focus:ring-1 focus:ring-primary"
        />

        {raw.trim() ? (
          <div className="space-y-2">
            <p className="label-tracked text-on-surface-variant">
              {parsed.rows.length} valid row{parsed.rows.length === 1 ? "" : "s"}
              {parsed.errors.length > 0 ? ` · ${parsed.errors.length} problem${parsed.errors.length === 1 ? "" : "s"}` : ""}
            </p>
            {parsed.errors.length > 0 ? (
              <ul className="scroll-slim max-h-40 space-y-1 overflow-y-auto rounded-lg bg-error-container/50 p-2.5 text-xs text-on-error-container">
                {parsed.errors.map((err, i) => (
                  <li key={`${err.line}-${i}`}>
                    <span className="font-semibold">Row {err.line || "header"}{err.sku !== "—" ? ` (${err.sku})` : ""}:</span> {err.message}
                  </li>
                ))}
              </ul>
            ) : null}
            {result ? (
              <div
                role="status"
                className="rounded-lg bg-secondary-container/60 p-2.5 text-xs text-on-secondary-container"
              >
                <span className="font-semibold">Last run:</span> {result.created} created
                {result.errors.length > 0 ? `, ${result.errors.length} failed (listed above)` : "."} New drafts appear in
                the list — publish them when they are ready.
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}
