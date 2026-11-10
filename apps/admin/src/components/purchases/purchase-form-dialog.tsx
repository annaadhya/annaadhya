"use client";
/**
 * New Purchase / Edit Draft modal for the Purchases console (heritage design language).
 *
 * - Real suppliers (from /admin/suppliers) and real catalogue variants back every picker.
 * - Line items: variant, qty, unit, unit cost ₹ (prefilled from the supplier's negotiated
 *   rate where one matches the SKU), line discount ₹ and GST %; totals are computed live
 *   for display only — the server recomputes authoritative money on save.
 * - Save as Draft keeps the record a draft (nothing enters inventory); Create & Confirm
 *   posts status "ordered" through the same validation. Receiving stock happens later,
 *   on purpose, through the dedicated Receive Goods flow.
 * - The PO reference is generated server-side (PUR-YYYY-NNN) — shown as a hint, never typed.
 * - Recoverable errors keep every value; closing with unsaved edits asks first.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiPost } from "@/lib/api";
import type { ProductWithVariants, PurchaseDoc, PurchaseUpsertPayload, SupplierDoc } from "@/lib/types";
import { dateInputToMillis, millisToDateInput, paiseToRupeeInput, rupeesToPaise } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { IconClose, IconTrash } from "./icons";

const UNITS = ["unit", "box", "kg", "g", "litre", "piece"];
const TAX_SLABS = [0, 5, 12, 18, 28];

interface LineRow {
  key: string;
  variantSku: string;
  description: string;
  qty: string;
  unit: string;
  cost: string; // rupees
  discount: string; // rupees
  taxPercent: string;
}

function newLineKey(): string {
  return `pl${Math.random().toString(36).slice(2, 9)}`;
}

function emptyLine(): LineRow {
  return { key: newLineKey(), variantSku: "", description: "", qty: "", unit: "unit", cost: "", discount: "", taxPercent: "0" };
}

/** Live line total in paise (display only — the server owns the authoritative number). */
function lineTotalPaise(row: LineRow): number {
  const qty = Number(row.qty);
  const cost = rupeesToPaise(row.cost);
  if (!Number.isFinite(qty) || qty < 1 || Number.isNaN(cost) || cost < 0) return 0;
  const gross = Math.round(qty) * cost;
  const discountPaise = row.discount.trim() === "" ? 0 : rupeesToPaise(row.discount);
  const discount = Number.isNaN(discountPaise) ? 0 : Math.min(Math.max(0, discountPaise), gross);
  const taxPct = Number(row.taxPercent);
  const tax = Number.isFinite(taxPct) && taxPct > 0 ? Math.round(((gross - discount) * Math.min(taxPct, 50)) / 100) : 0;
  return gross - discount + tax;
}

export interface PurchaseFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Null → create; present → edit this draft. */
  purchase: PurchaseDoc | null;
  /** Real supplier records (rate lines prefill procurement costs). */
  suppliers: SupplierDoc[];
  /** Real catalogue products with variants for the line-item pickers. */
  products: ProductWithVariants[];
  onSaved: () => void;
}

export function PurchaseFormDialog({ open, onClose, purchase, suppliers, products, onSaved }: PurchaseFormDialogProps) {
  const [supplierId, setSupplierId] = useState("");
  const [purchaseDate, setPurchaseDate] = useState("");
  const [expectedDate, setExpectedDate] = useState("");
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [invoiceDate, setInvoiceDate] = useState("");
  const [internalNotes, setInternalNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>([emptyLine()]);
  const [saving, setSaving] = useState<null | "draft" | "ordered">(null);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  const today = useMemo(() => millisToDateInput(Date.now()), []);

  // Fresh form whenever the dialog opens for a (different) purchase.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(null);
    setConfirmingDiscard(false);
    if (purchase) {
      setSupplierId(purchase.supplierId);
      setPurchaseDate(millisToDateInput(purchase.purchaseDate ?? purchase.createdAt));
      setExpectedDate(purchase.expectedDeliveryDate ? millisToDateInput(purchase.expectedDeliveryDate) : "");
      setInvoiceNumber(purchase.supplierInvoiceNumber ?? "");
      setInvoiceDate(purchase.supplierInvoiceDate ? millisToDateInput(purchase.supplierInvoiceDate) : "");
      setInternalNotes(purchase.internalNotes ?? purchase.notes ?? "");
      setLines(
        purchase.items.map((it) => ({
          key: newLineKey(),
          variantSku: it.variantSku,
          description: it.description,
          qty: String(it.qtyOrdered),
          unit: it.unit ?? "unit",
          cost: paiseToRupeeInput(it.unitCostPaise),
          discount: it.discountPaise ? paiseToRupeeInput(it.discountPaise) : "",
          taxPercent: it.taxPercent != null ? String(it.taxPercent) : "0",
        })),
      );
    } else {
      setSupplierId("");
      setPurchaseDate(today);
      setExpectedDate("");
      setInvoiceNumber("");
      setInvoiceDate("");
      setInternalNotes("");
      setLines([emptyLine()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, purchase?.id]);

  // Escape asks first when dirty; body scroll locked while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !saving && !confirmingDiscard) requestClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, saving, confirmingDiscard]);

  const isDirty = useMemo(() => {
    if (!open) return false;
    if (purchase) {
      return (
        supplierId !== purchase.supplierId ||
        purchaseDate !== millisToDateInput(purchase.purchaseDate ?? purchase.createdAt) ||
        expectedDate !== (purchase.expectedDeliveryDate ? millisToDateInput(purchase.expectedDeliveryDate) : "") ||
        invoiceNumber !== (purchase.supplierInvoiceNumber ?? "") ||
        invoiceDate !== (purchase.supplierInvoiceDate ? millisToDateInput(purchase.supplierInvoiceDate) : "") ||
        internalNotes !== (purchase.internalNotes ?? purchase.notes ?? "")
      );
    }
    return (
      supplierId !== "" ||
      expectedDate !== "" ||
      invoiceNumber !== "" ||
      invoiceDate !== "" ||
      internalNotes !== "" ||
      lines.some((r) => r.variantSku !== "" || r.qty !== "" || r.cost !== "" || r.description !== "" || r.discount !== "")
    );
  }, [open, supplierId, purchaseDate, expectedDate, invoiceNumber, invoiceDate, internalNotes, lines, purchase]);

  function requestClose() {
    if (isDirty) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  function setLine(key: string, patch: Partial<LineRow>) {
    setLines((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  /** Prefill description/unit/cost when a variant is picked (rate match → negotiated cost). */
  function pickVariant(key: string, sku: string) {
    const line = lines.find((r) => r.key === key);
    if (!line) return;
    let description = line.description;
    let unit = line.unit;
    let cost = line.cost;
    const variant = products.flatMap((p) => p.variants.map((v) => ({ p, v }))).find((x) => x.v.sku === sku);
    if (variant && !line.description) description = `${variant.p.name} — ${variant.v.packLabel}`;
    const supplier = suppliers.find((s) => s.id === supplierId);
    const rate = supplier?.rates?.find((r) => r.variantSku === sku || r.productSku === sku);
    if (rate) {
      if (!line.cost) cost = paiseToRupeeInput(rate.unitCostPaise);
      if (!line.description) description = rate.label;
      if (rate.unit) unit = rate.unit;
    }
    setLine(key, { variantSku: sku, description, unit, cost });
  }

  const totals = useMemo(() => {
    let sub = 0;
    let disc = 0;
    let taxSum = 0;
    for (const row of lines) {
      const qty = Number(row.qty);
      const cost = rupeesToPaise(row.cost);
      if (!Number.isFinite(qty) || qty < 1 || Number.isNaN(cost) || cost < 0) continue;
      const gross = Math.round(qty) * cost;
      const discountPaise = row.discount.trim() === "" ? 0 : rupeesToPaise(row.discount);
      const discount = Number.isNaN(discountPaise) ? 0 : Math.min(Math.max(0, discountPaise), gross);
      const taxPct = Number(row.taxPercent);
      const lineTax = Number.isFinite(taxPct) && taxPct > 0 ? Math.round(((gross - discount) * Math.min(taxPct, 50)) / 100) : 0;
      sub += gross;
      disc += discount;
      taxSum += lineTax;
    }
    return { sub, disc, tax: taxSum, total: sub - disc + taxSum };
  }, [lines]);

  const outstandingBalance = useMemo(() => {
    const supplier = suppliers.find((s) => s.id === supplierId);
    return supplier;
  }, [suppliers, supplierId]);

  async function submit(status: "draft" | "ordered") {
    setError(null);

    if (!supplierId) return void setError("Pick a supplier for this purchase.");
    if (!purchaseDate) return void setError("A purchase date is required.");
    if (expectedDate && invoiceDate && purchaseDate > invoiceDate) {
      // invoice date may legitimately trail — no constraint; kept for symmetry with server checks
    }
    if (expectedDate && purchaseDate && expectedDate < purchaseDate) {
      return void setError("Expected delivery cannot be before the purchase date.");
    }

    const payloadLines: PurchaseUpsertPayload["items"] = [];
    for (const [idx, row] of lines.entries()) {
      const label = `Line ${idx + 1}`;
      const sku = row.variantSku.trim().toUpperCase();
      if (!sku) return void setError(`${label}: pick a catalogue product.`);
      if (!/^[A-Z0-9][A-Z0-9\-_.]{2,40}$/.test(sku)) return void setError(`${label}: the SKU format is not valid.`);
      const qty = Number(row.qty);
      if (!Number.isInteger(qty) || qty < 1 || qty > 1_000_000) {
        return void setError(`${label}: ordered quantity must be a whole number between 1 and 10,00,000.`);
      }
      const unitCostPaise = rupeesToPaise(row.cost);
      if (Number.isNaN(unitCostPaise) || unitCostPaise < 0) {
        return void setError(`${label}: unit cost is not a valid amount.`);
      }
      const discountPaise = row.discount.trim() === "" ? 0 : rupeesToPaise(row.discount);
      if (Number.isNaN(discountPaise) || discountPaise < 0) {
        return void setError(`${label}: discount is not a valid amount.`);
      }
      if (discountPaise > qty * unitCostPaise) {
        return void setError(`${label}: the discount cannot exceed the line value.`);
      }
      const taxPercent = Number(row.taxPercent);
      if (!Number.isFinite(taxPercent) || taxPercent < 0 || taxPercent > 50) {
        return void setError(`${label}: tax percent must be between 0 and 50.`);
      }
      payloadLines.push({
        variantSku: sku,
        description: row.description.trim().slice(0, 200),
        qtyOrdered: qty,
        unitCostPaise,
        unit: row.unit.trim() || "unit",
        discountPaise,
        taxPercent,
      });
    }
    if (payloadLines.length === 0) return void setError("Add at least one product line.");

    const payload: PurchaseUpsertPayload = {
      supplierId,
      status,
      purchaseDate: dateInputToMillis(purchaseDate),
      expectedDeliveryDate: expectedDate ? dateInputToMillis(expectedDate) : null,
      supplierInvoiceNumber: invoiceNumber.trim() || undefined,
      supplierInvoiceDate: invoiceDate ? dateInputToMillis(invoiceDate) : null,
      internalNotes: internalNotes.trim() || undefined,
      items: payloadLines,
    };

    setSaving(status);
    try {
      if (purchase) {
        await apiPost<PurchaseDoc>(`/admin/purchases/${purchase.id}`, payload);
      } else {
        await apiPost<PurchaseDoc>("/admin/purchases", payload);
      }
      onSaved();
      onClose();
    } catch (err) {
      // Recoverable: keep every form value so the user can retry or correct.
      setError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
      setSaving(null);
    }
  }

  if (!open) return null;

  const activeSupplier = outstandingBalance;

  return (
    <>
      <div
        aria-hidden
        onClick={requestClose}
        className="backdrop-in fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-xs"
      />
      <div className="backdrop-in fixed inset-0 z-50 flex items-end justify-center overflow-y-auto p-0 sm:items-center sm:p-6">
        <div
          role="dialog"
          aria-modal="true"
          aria-label={purchase ? `Edit draft ${purchase.reference}` : "New purchase order"}
          className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container-lowest text-left shadow-2xl sm:max-w-4xl sm:rounded-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-outline-variant/40 bg-surface-container-low px-5 py-4 sm:px-6">
            <div>
              <span className="inline-block rounded-full bg-primary px-2.5 py-0.5 label-eyebrow text-on-primary">
                {purchase ? "Editing draft purchase order" : "New purchase order"}
              </span>
              <h2 className="mt-1.5 font-display text-lg font-semibold text-primary">
                {purchase ? `Edit — ${purchase.reference}` : "Raise a purchase order"}
              </h2>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Stock enters the ledger only when goods are received — creating or confirming never touches inventory.
              </p>
            </div>
            <button
              type="button"
              onClick={requestClose}
              aria-label="Close dialog"
              className="rounded-full p-2 text-on-surface-variant/60 transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>

          {/* Body */}
          <form onSubmit={(e) => e.preventDefault()} noValidate className="flex min-h-0 flex-1 flex-col">
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
              {/* Purchase information */}
              <section className="space-y-3">
                <h3 className="label-eyebrow text-secondary">Purchase information</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Supplier" required>
                    <Select value={supplierId} onChange={(e) => setSupplierId(e.target.value)} aria-label="Supplier">
                      <option value="">Select supplier…</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.name}
                          {s.status === "inactive" ? " (inactive)" : ""}
                          {s.city || s.location ? ` — ${s.city ?? s.location}` : ""}
                        </option>
                      ))}
                    </Select>
                  </Field>
                  <Field
                    label="Purchase reference"
                    hint="Generated for you on save (PUR-YYYY-NNN)"
                  >
                    <Input value={purchase?.reference ?? ""} readOnly disabled className="font-mono" placeholder="Auto-generated" />
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Field label="Purchase date" required>
                    <Input type="date" value={purchaseDate} max={today} onChange={(e) => setPurchaseDate(e.target.value)} />
                  </Field>
                  <Field label="Expected delivery">
                    <Input type="date" value={expectedDate} min={purchaseDate || undefined} onChange={(e) => setExpectedDate(e.target.value)} />
                  </Field>
                  <Field label="Supplier invoice #">
                    <Input value={invoiceNumber} onChange={(e) => setInvoiceNumber(e.target.value)} maxLength={80} className="font-mono" placeholder="Optional" />
                  </Field>
                  <Field label="Invoice date">
                    <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                  </Field>
                </div>
                {activeSupplier?.paymentTerms ? (
                  <p className="rounded-lg bg-surface-container px-3 py-2 text-xs text-on-surface-variant">
                    <span className="font-semibold text-on-surface">Agreed terms:</span> {activeSupplier.paymentTerms}
                  </p>
                ) : null}
              </section>

              {/* Product line items */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="label-eyebrow text-secondary">Product line items</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setLines((rows) => [...rows, emptyLine()])}
                    disabled={lines.length >= 200}
                  >
                    + Add product
                  </Button>
                </div>
                <p className="text-xs text-on-surface-variant">
                  One line per catalogue item. Quantities are counted in the line&apos;s unit — receiving later credits inventory by exactly the confirmed quantity.
                </p>
                {lines.map((row, idx) => (
                  <fieldset key={row.key} className="rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-3">
                    <legend className="px-1.5 label-tracked text-on-surface-variant">Line {idx + 1}</legend>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <Field label="Product / variant" required htmlFor={`pl-sku-${row.key}`}>
                          <Select
                            id={`pl-sku-${row.key}`}
                            value={row.variantSku}
                            onChange={(e) => pickVariant(row.key, e.target.value)}
                            aria-label={`Product for line ${idx + 1}`}
                          >
                            <option value="">Select catalogue product…</option>
                            {products.map((p) => (
                              <optgroup key={p.id} label={p.name}>
                                {p.variants.map((v) => (
                                  <option key={v.sku} value={v.sku}>
                                    {v.packLabel} — {v.sku}
                                  </option>
                                ))}
                              </optgroup>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <div className="sm:col-span-4">
                        <Field label="Description" htmlFor={`pl-desc-${row.key}`}>
                          <Input
                            id={`pl-desc-${row.key}`}
                            value={row.description}
                            onChange={(e) => setLine(row.key, { description: e.target.value })}
                            maxLength={200}
                            placeholder="What the supplier calls it"
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-1">
                        <Field label="Qty" required>
                          <Input
                            value={row.qty}
                            onChange={(e) => setLine(row.key, { qty: e.target.value.replace(/[^\d]/g, "") })}
                            inputMode="numeric"
                            className="font-mono"
                            placeholder="0"
                            aria-label={`Quantity for line ${idx + 1}`}
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label="Unit">
                          <Select value={row.unit} onChange={(e) => setLine(row.key, { unit: e.target.value })} aria-label={`Unit for line ${idx + 1}`}>
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                {u}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-12">
                      <div className="sm:col-span-2">
                        <Field label="Cost ₹ / unit" required>
                          <Input
                            value={row.cost}
                            onChange={(e) => setLine(row.key, { cost: e.target.value })}
                            inputMode="decimal"
                            className="font-mono"
                            placeholder="380.00"
                            aria-label={`Unit cost for line ${idx + 1}`}
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label="Discount ₹">
                          <Input
                            value={row.discount}
                            onChange={(e) => setLine(row.key, { discount: e.target.value })}
                            inputMode="decimal"
                            className="font-mono"
                            placeholder="0.00"
                            aria-label={`Discount for line ${idx + 1}`}
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label="Tax %">
                          <Select value={row.taxPercent} onChange={(e) => setLine(row.key, { taxPercent: e.target.value })} aria-label={`Tax for line ${idx + 1}`}>
                            {TAX_SLABS.map((t) => (
                              <option key={t} value={String(t)}>
                                {t}%
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                      <div className="sm:col-span-4">
                        <div className="rounded-lg bg-surface-container px-3 py-2 text-right">
                          <p className="label-eyebrow text-outline">Line total</p>
                          <p className="font-mono text-sm font-bold text-primary">
                            ₹{lineTotalPaise(row).toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                          </p>
                        </div>
                      </div>
                      <div className="flex sm:col-span-2 sm:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-error hover:bg-error-container/40"
                          onClick={() => setLines((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== row.key) : [emptyLine()]))}
                          aria-label={`Remove line ${idx + 1}`}
                        >
                          <IconTrash className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </fieldset>
                ))}
              </section>

              {/* Cost summary + notes */}
              <section className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="space-y-3">
                  <h3 className="label-eyebrow text-secondary">Cost summary</h3>
                  <dl className="space-y-1.5 rounded-xl border border-outline-variant/30 p-4 text-sm">
                    <div className="flex justify-between">
                      <dt className="text-on-surface-variant">Subtotal</dt>
                      <dd className="font-mono font-medium">₹{(totals.sub / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-on-surface-variant">Discounts</dt>
                      <dd className="font-mono font-medium text-secondary">− ₹{(totals.disc / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-on-surface-variant">Taxes</dt>
                      <dd className="font-mono font-medium">+ ₹{(totals.tax / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}</dd>
                    </div>
                    <div className="mt-2 flex justify-between border-t border-outline-variant/40 pt-2">
                      <dt className="font-semibold text-primary">Final total</dt>
                      <dd className="font-mono text-base font-bold text-primary">
                        ₹{(totals.total / 100).toLocaleString("en-IN", { minimumFractionDigits: 2 })}
                      </dd>
                    </div>
                  </dl>
                  <p className="text-[11px] text-outline">The server recalculates every total on save — these figures are a preview.</p>
                </div>
                <div className="space-y-3">
                  <h3 className="label-eyebrow text-secondary">Internal notes</h3>
                  <Field label="Notes" hint="Quality specs, freight arrangement, storage plan — admin-visible only.">
                    <Textarea value={internalNotes} onChange={(e) => setInternalNotes(e.target.value)} rows={5} maxLength={2000} />
                  </Field>
                </div>
              </section>

              {error ? (
                <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
                  {error}
                </p>
              ) : null}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-outline-variant/40 bg-surface-container-low px-5 py-3.5 sm:px-6">
              <p className="text-[11px] text-outline">{purchase ? "Draft edits only — confirmed orders are immutable." : "Draft stays editable · confirmed locks the order."}</p>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button type="button" variant="outline" onClick={requestClose} disabled={saving !== null}>
                  Cancel
                </Button>
                <Button type="button" variant="secondary" loading={saving === "draft"} disabled={saving !== null} onClick={() => submit("draft")}>
                  {purchase ? "Save draft" : "Save as Draft"}
                </Button>
                <Button type="button" loading={saving === "ordered"} disabled={saving !== null} onClick={() => submit("ordered")}>
                  {purchase ? "Save & confirm order" : "Create & Confirm Order"}
                </Button>
              </div>
            </div>
          </form>
        </div>
      </div>

      {/* Unsaved-changes guard */}
      {confirmingDiscard ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-inverse-surface/50 p-4 backdrop-blur-xs">
          <div role="alertdialog" aria-modal="true" aria-label="Discard unsaved changes" className="w-full max-w-md rounded-xl bg-surface-container-lowest p-5 shadow-2xl">
            <h3 className="font-display text-lg font-semibold text-primary">Discard unsaved changes?</h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              This purchase form has edits that have not been saved yet. Closing now will lose them.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmingDiscard(false)}>
                Keep editing
              </Button>
              <Button
                size="sm"
                className="bg-error text-on-error hover:bg-error/90"
                onClick={() => {
                  setConfirmingDiscard(false);
                  onClose();
                }}
              >
                Discard changes
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
