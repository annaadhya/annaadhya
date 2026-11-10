"use client";
/**
 * VariantsTable — the design's "Variants & Tiered Pricing" section: an editable
 * heritage table (variant option, SKU, MRP strike, selling price, net weight,
 * stock pill) with add / duplicate / remove and DRAG-TO-REORDER. Editing is
 * inline; prices are typed in RUPEES and converted once at submit (see product-form.tsx).
 *
 * Row order is the storefront display order: the submit loop stamps each row's
 * index as sortOrder and the API sorts by (sortOrder, grams) — the grip handle
 * drags rows, the arrows cover keyboard/touch, both persist.
 */
import { useState } from "react";
import type { VariantRow } from "./product-form";

const GripIcon = () => (
  <svg viewBox="0 0 24 24" className="h-[18px] w-[18px]" fill="currentColor" aria-hidden>
    <circle cx="9" cy="6" r="1.6" />
    <circle cx="15" cy="6" r="1.6" />
    <circle cx="9" cy="12" r="1.6" />
    <circle cx="15" cy="12" r="1.6" />
    <circle cx="9" cy="18" r="1.6" />
    <circle cx="15" cy="18" r="1.6" />
  </svg>
);

const MenuIcon = ({ path }: { path: string }) => (
  <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={path} />
  </svg>
);

const cellInput =
  "h-9 w-full min-w-0 rounded-lg bg-surface-container-lowest px-2.5 text-on-surface shadow-[0_0_0_1px_rgba(217,193,194,0.6)] transition-shadow placeholder:text-on-surface-variant/40 focus:outline-none focus:shadow-[0_0_0_2px_#541620]";

export function VariantsTable({
  rows,
  setRows,
  canWrite,
}: {
  rows: VariantRow[];
  setRows: React.Dispatch<React.SetStateAction<VariantRow[]>>;
  canWrite: boolean;
}) {
  // Drag-to-reorder: the grip starts the drag, any other row accepts the drop.
  // Arrow buttons cover keyboard + touch — both paths produce the same row order.
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [overKey, setOverKey] = useState<string | null>(null);

  function moveVariant(from: number, to: number) {
    setRows((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  }

  function patch(key: string, changes: Partial<VariantRow>) {
    setRows((prev) => prev.map((r) => (r.key === key ? { ...r, ...changes } : r)));
  }

  function duplicate(row: VariantRow) {
    const base = row.sku.replace(/\s+/g, "");
    let suffix = 2;
    const candidate = () => `${base}-C${suffix}`.toUpperCase().slice(0, 41);
    while (rows.some((r) => r.sku.toUpperCase() === candidate()) && suffix < 99) suffix += 1;
    setRows((prev) => {
      const idx = prev.findIndex((r) => r.key === row.key);
      const copy: VariantRow = {
        ...row,
        key: `v${Math.random().toString(36).slice(2, 9)}`,
        id: undefined, // a duplicate is a NEW variant — never reuse the source's id
        sku: candidate(),
      };
      return [...prev.slice(0, idx + 1), copy, ...prev.slice(idx + 1)];
    });
  }

  function remove(row: VariantRow) {
    setRows((prev) => prev.filter((r) => r.key !== row.key));
  }

  return (
    <div>
      <div className="flex flex-col gap-2 pb-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-body-sm text-on-surface-variant">
          Configure SKU variants, packaging formats, weight metrics and stock levels. Prices are typed in rupees.
        </p>
        {canWrite ? (
          <button
            type="button"
            onClick={() => setRows((prev) => [...prev, {
              key: `v${Math.random().toString(36).slice(2, 9)}`,
              sku: "",
              packLabel: "",
              grams: "",
              price: "",
              mrp: "",
              status: "published",
              stockOnHand: "0",
              lowStockThreshold: "5",
            }])}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-secondary-container px-4 py-2 text-label-md font-semibold text-on-secondary-container transition-colors hover:bg-secondary-fixed"
          >
            <MenuIcon path="M12 5v14M5 12h14" />
            Add Variant
          </button>
        ) : null}
      </div>

      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[52rem] text-left">
          <thead>
            <tr className="bg-surface-container-low text-on-surface-variant">
              <th className="label-eyebrow rounded-l-lg px-3 py-2.5">Variant Option</th>
              <th className="label-eyebrow px-3 py-2.5">SKU</th>
              <th className="label-eyebrow px-3 py-2.5">MRP (₹)</th>
              <th className="label-eyebrow px-3 py-2.5">Selling Price (₹)</th>
              <th className="label-eyebrow px-3 py-2.5">Net Wt. (g)</th>
              <th className="label-eyebrow px-3 py-2.5">Stock Units</th>
              <th className="label-eyebrow rounded-r-lg px-3 py-2.5 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="text-body-sm text-on-surface">
            {rows.length === 0 ? (
              <tr>
                <td colSpan={7} className="rounded-lg bg-surface-container-low px-3 py-4 text-sm text-on-surface-variant">
                  No variants yet — add at least one sellable pack. Every variant needs its own SKU, price and stock.
                </td>
              </tr>
            ) : null}
            {rows.map((row, idx) => {
              const stock = Number(row.stockOnHand || "0");
              const threshold = Number(row.lowStockThreshold || "0");
              const low = Number.isFinite(stock) && Number.isFinite(threshold) && stock > 0 && stock <= threshold;
              const out = !Number.isFinite(stock) || stock <= 0;
              return (
                <tr
                  key={row.key}
                  className={`border-b border-outline-variant/30 last:border-b-0 hover:bg-surface-container-low/50 ${
                    dragKey === row.key
                      ? "opacity-50"
                      : dragKey && overKey === row.key
                        ? "bg-primary-container/30 ring-1 ring-inset ring-primary/40"
                        : ""
                  }`}
                  onDragOver={(e) => {
                    if (!dragKey || dragKey === row.key) return;
                    e.preventDefault();
                    setOverKey(row.key);
                  }}
                  onDragLeave={() => setOverKey((k) => (k === row.key ? null : k))}
                  onDrop={(e) => {
                    e.preventDefault();
                    const from = rows.findIndex((r) => r.key === dragKey);
                    const to = rows.findIndex((r) => r.key === row.key);
                    if (from >= 0 && to >= 0) moveVariant(from, to);
                    setDragKey(null);
                    setOverKey(null);
                  }}
                >
                  {/* Variant option (pack label) */}
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {canWrite ? (
                        <button
                          type="button"
                          draggable
                          onDragStart={() => setDragKey(row.key)}
                          onDragEnd={() => {
                            setDragKey(null);
                            setOverKey(null);
                          }}
                          aria-label={`Drag to reorder variant ${idx + 1}`}
                          title="Drag to reorder — the storefront shows variants in this order"
                          className="cursor-grab text-outline transition-colors hover:text-on-surface active:cursor-grabbing"
                        >
                          <GripIcon />
                        </button>
                      ) : (
                        <span aria-hidden className="text-outline/60">
                          <GripIcon />
                        </span>
                      )}
                      <span className="w-5 shrink-0 text-xs font-semibold text-outline">{idx + 1}.</span>
                      <input
                        aria-label={`Variant ${idx + 1} option label`}
                        value={row.packLabel}
                        disabled={!canWrite}
                        onChange={(e) => patch(row.key, { packLabel: e.target.value })}
                        placeholder="e.g. 350g Artisanal Glass Jar"
                        className={`${cellInput} font-medium`}
                      />
                    </div>
                  </td>
                  {/* SKU */}
                  <td className="px-3 py-3">
                    <input
                      aria-label={`Variant ${idx + 1} SKU`}
                      value={row.sku}
                      disabled={!canWrite}
                      onChange={(e) => patch(row.key, { sku: e.target.value.toUpperCase() })}
                      placeholder="HON-WLD-350"
                      className={`${cellInput} w-36 font-mono text-xs uppercase tracking-wider text-on-surface-variant`}
                    />
                  </td>
                  {/* MRP */}
                  <td className="px-3 py-3">
                    <input
                      aria-label={`Variant ${idx + 1} MRP in rupees`}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={row.mrp}
                      disabled={!canWrite}
                      onChange={(e) => patch(row.key, { mrp: e.target.value })}
                      placeholder="750"
                      className={`${cellInput} w-24 text-outline line-through placeholder:no-underline`}
                    />
                  </td>
                  {/* Selling price */}
                  <td className="px-3 py-3">
                    <input
                      aria-label={`Variant ${idx + 1} selling price in rupees`}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={row.price}
                      disabled={!canWrite}
                      onChange={(e) => patch(row.key, { price: e.target.value })}
                      placeholder="650"
                      className={`${cellInput} w-24 font-semibold text-primary`}
                    />
                  </td>
                  {/* Net weight */}
                  <td className="px-3 py-3">
                    <input
                      aria-label={`Variant ${idx + 1} net weight in grams`}
                      type="number"
                      min="0"
                      step="0.1"
                      inputMode="decimal"
                      value={row.grams}
                      disabled={!canWrite}
                      onChange={(e) => patch(row.key, { grams: e.target.value })}
                      placeholder="350"
                      className={`${cellInput} w-24`}
                    />
                  </td>
                  {/* Stock */}
                  <td className="px-3 py-3">
                    <div className="flex flex-col items-start gap-1">
                      <input
                        aria-label={`Variant ${idx + 1} stock units`}
                        type="number"
                        min="0"
                        step="1"
                        value={row.stockOnHand}
                        disabled={!canWrite}
                        onChange={(e) => patch(row.key, { stockOnHand: e.target.value })}
                        className={`${cellInput} w-20`}
                      />
                      <span
                        className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
                          out
                            ? "bg-error-container text-on-error-container"
                            : low
                              ? "bg-tertiary-fixed text-on-tertiary-fixed"
                              : "bg-secondary-container text-on-secondary-container"
                        }`}
                      >
                        <span
                          aria-hidden
                          className={`h-1.5 w-1.5 rounded-full ${
                            out ? "bg-error" : low ? "bg-tertiary" : "bg-secondary"
                          } ${low ? "animate-pulse" : ""}`}
                        />
                        {out ? "Out of stock" : low ? `${row.stockOnHand} units (Low)` : `${row.stockOnHand} units`}
                      </span>
                      <label className="flex items-center gap-1 text-[11px] text-outline">
                        Low at
                        <input
                          aria-label={`Variant ${idx + 1} low-stock threshold`}
                          type="number"
                          min="0"
                          step="1"
                          value={row.lowStockThreshold}
                          disabled={!canWrite}
                          onChange={(e) => patch(row.key, { lowStockThreshold: e.target.value })}
                          className="h-6 w-12 rounded bg-surface-container-lowest px-1 text-center text-[11px] shadow-[0_0_0_1px_rgba(217,193,194,0.6)] focus:outline-none focus:shadow-[0_0_0_2px_#541620] disabled:opacity-60"
                        />
                      </label>
                    </div>
                  </td>
                  {/* Actions */}
                  <td className="px-3 py-3 text-right">
                    <div className="inline-flex items-center gap-1">
                      {canWrite ? (
                        <>
                          <button
                            type="button"
                            title="Move variant up"
                            aria-label={`Move variant ${idx + 1} up`}
                            disabled={idx === 0}
                            onClick={() => moveVariant(idx, idx - 1)}
                            className="rounded p-1 text-outline transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-30"
                          >
                            <MenuIcon path="M12 19V5m-7 7 7-7 7 7" />
                          </button>
                          <button
                            type="button"
                            title="Move variant down"
                            aria-label={`Move variant ${idx + 1} down`}
                            disabled={idx === rows.length - 1}
                            onClick={() => moveVariant(idx, idx + 1)}
                            className="rounded p-1 text-outline transition-colors hover:bg-surface-container hover:text-on-surface disabled:opacity-30"
                          >
                            <MenuIcon path="M12 5v14m7-7-7 7-7-7" />
                          </button>
                          <button
                            type="button"
                            title="Duplicate variant"
                            aria-label={`Duplicate variant ${idx + 1}`}
                            onClick={() => duplicate(row)}
                            className="rounded p-1 text-outline transition-colors hover:bg-surface-container hover:text-on-surface"
                          >
                            <MenuIcon path="M8 8h12v12H8zM4 16V4h12" />
                          </button>
                          <button
                            type="button"
                            title="Remove variant"
                            aria-label={`Remove variant ${idx + 1}`}
                            onClick={() => remove(row)}
                            className="rounded p-1 text-outline transition-colors hover:bg-surface-container hover:text-error"
                          >
                            <MenuIcon path="M3 6h18M8 6V4h8v2m-9 0 1 14h8l1-14" />
                          </button>
                        </>
                      ) : null}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {rows.length >= 20 ? (
        <p className="mt-2 text-xs text-outline">The catalogue supports up to 20 variants per product.</p>
      ) : null}
    </div>
  );
}
