"use client";
/**
 * Add / Edit supplier modal for the Suppliers console (heritage design language).
 * - One form for create and edit; edit pre-fills every persisted value.
 * - Negotiated-rate lines: add / edit / remove; costs are typed in rupees and sent as
 *   integer paise. Purchase cost is clearly separated from the customer-facing price.
 * - Recoverable errors keep every form value; closing with unsaved edits asks first
 *   so nothing is silently discarded.
 */
import { useEffect, useMemo, useState } from "react";
import { ApiError, apiPost } from "@/lib/api";
import type { ProductDoc, SupplierLedgerRow, SupplierStatus, SupplierType, SupplierUpsertPayload } from "@/lib/types";
import { paiseToRupeeInput, rupeesToPaise } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/form";
import { IconClose, IconTrash } from "./icons";

export const SUPPLIER_TYPE_OPTIONS: { value: SupplierType; label: string }[] = [
  { value: "farmer_apiarist", label: "Farmer / Apiarist" },
  { value: "estate_producer", label: "Estate Producer" },
  { value: "wholesaler_coop", label: "Wholesaler / Co-op" },
  { value: "packaging_artisan", label: "Packaging Artisan" },
  { value: "other", label: "Other" },
];

const UNITS = ["kg", "g", "unit", "box", "litre", "piece"];

interface RateRow {
  key: string;
  id?: string;
  label: string;
  productSku: string;
  cost: string; // rupees
  unit: string;
  moq: string;
  notes: string;
}

function newRateKey(): string {
  return `rate${Math.random().toString(36).slice(2, 9)}`;
}

function emptyRate(): RateRow {
  return { key: newRateKey(), label: "", productSku: "", cost: "", unit: "kg", moq: "", notes: "" };
}

export interface SupplierFormDialogProps {
  open: boolean;
  onClose: () => void;
  /** Null → create; present → edit this supplier. */
  supplier: SupplierLedgerRow | null;
  /** Real catalogue products backing the SKU pickers in rate lines. */
  products: ProductDoc[];
  onSaved: () => void;
}

export function SupplierFormDialog({ open, onClose, supplier, products, onSaved }: SupplierFormDialogProps) {
  const [name, setName] = useState("");
  const [type, setType] = useState<SupplierType>("farmer_apiarist");
  const [contactPerson, setContactPerson] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<SupplierStatus>("active");
  const [village, setVillage] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [pincode, setPincode] = useState("");
  const [addressLines, setAddressLines] = useState("");
  const [paymentTerms, setPaymentTerms] = useState("");
  const [licenseNumber, setLicenseNumber] = useState("");
  const [notes, setNotes] = useState("");
  const [rates, setRates] = useState<RateRow[]>([emptyRate()]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Fresh form whenever the dialog opens for a (different) supplier.
  useEffect(() => {
    if (!open) return;
    setError(null);
    setSaving(false);
    setConfirmingDiscard(false);
    if (supplier) {
      setName(supplier.name);
      setType(supplier.type);
      setContactPerson(supplier.contactPerson ?? "");
      setPhone(supplier.phone ?? "");
      setEmail(supplier.email ?? "");
      setStatus(supplier.status);
      setVillage(supplier.village ?? "");
      setCity(supplier.city ?? "");
      setStateName(supplier.state ?? "");
      setPincode(supplier.pincode ?? "");
      setAddressLines("");
      setPaymentTerms(supplier.paymentTerms ?? "");
      setLicenseNumber(supplier.licenseNumber ?? "");
      setNotes(supplier.notes ?? "");
      setRates(
        supplier.rates.length > 0
          ? supplier.rates.map((r) => ({
              key: newRateKey(),
              id: r.id,
              label: r.label,
              productSku: r.productSku ?? "",
              cost: paiseToRupeeInput(r.unitCostPaise),
              unit: r.unit,
              moq: r.moqQty != null ? String(r.moqQty) : "",
              notes: r.notes ?? "",
            }))
          : [emptyRate()],
      );
    } else {
      setName("");
      setType("farmer_apiarist");
      setContactPerson("");
      setPhone("");
      setEmail("");
      setStatus("active");
      setVillage("");
      setCity("");
      setStateName("");
      setPincode("");
      setAddressLines("");
      setPaymentTerms("");
      setLicenseNumber("");
      setNotes("");
      setRates([emptyRate()]);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, supplier?.id]);

  // Escape closes (asks first when dirty); body scroll locked while open.
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
    if (supplier) {
      const originalRates = supplier.rates.length > 0
        ? supplier.rates.map((r) => ({ label: r.label, productSku: r.productSku ?? "", cost: paiseToRupeeInput(r.unitCostPaise), unit: r.unit, moq: r.moqQty != null ? String(r.moqQty) : "", notes: r.notes ?? "" }))
        : [{ label: "", productSku: "", cost: "", unit: "kg", moq: "", notes: "" }];
      const currentRates = rates.map((r) => ({ label: r.label, productSku: r.productSku, cost: r.cost, unit: r.unit, moq: r.moq, notes: r.notes }));
      return (
        name !== supplier.name ||
        type !== supplier.type ||
        contactPerson !== (supplier.contactPerson ?? "") ||
        phone !== (supplier.phone ?? "") ||
        email !== (supplier.email ?? "") ||
        status !== supplier.status ||
        village !== (supplier.village ?? "") ||
        city !== (supplier.city ?? "") ||
        stateName !== (supplier.state ?? "") ||
        pincode !== (supplier.pincode ?? "") ||
        paymentTerms !== (supplier.paymentTerms ?? "") ||
        licenseNumber !== (supplier.licenseNumber ?? "") ||
        notes !== (supplier.notes ?? "") ||
        JSON.stringify(currentRates) !== JSON.stringify(originalRates) ||
        addressLines !== ""
      );
    }
    return (
      name !== "" ||
      contactPerson !== "" ||
      phone !== "" ||
      email !== "" ||
      village !== "" ||
      city !== "" ||
      stateName !== "" ||
      pincode !== "" ||
      addressLines !== "" ||
      paymentTerms !== "" ||
      licenseNumber !== "" ||
      notes !== "" ||
      rates.some((r) => r.label !== "" || r.cost !== "" || r.productSku !== "")
    );
  }, [open, name, type, contactPerson, phone, email, status, village, city, stateName, pincode, addressLines, paymentTerms, licenseNumber, notes, rates, supplier]);

  function requestClose() {
    if (isDirty) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  function setRate(key: string, patch: Partial<RateRow>) {
    setRates((rows) => rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (name.trim().length < 2) return void setError("Supplier name must be at least 2 characters.");
    if (contactPerson.trim().length > 120) return void setError("Contact person name is too long.");
    if (email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return void setError("Email address does not look valid.");
    }
    if (pincode.trim() && !/^\d{6}$/.test(pincode.trim())) {
      return void setError("PIN code must be exactly 6 digits.");
    }

    const payloadRates: SupplierUpsertPayload["rates"] = [];
    for (const [idx, row] of rates.entries()) {
      const label = row.label.trim();
      const cost = row.cost.trim();
      if (label === "" && cost === "" && row.productSku.trim() === "" && row.moq.trim() === "" && row.notes.trim() === "") {
        continue; // fully empty line — not an error, just skip
      }
      if (label.length < 2) return void setError(`Rate line ${idx + 1}: item name must be at least 2 characters.`);
      const unitCostPaise = rupeesToPaise(cost);
      if (Number.isNaN(unitCostPaise) || unitCostPaise <= 0) {
        return void setError(`Rate line ${idx + 1}: negotiated cost must be a positive amount.`);
      }
      if (row.moq.trim() && (!Number.isInteger(Number(row.moq)) || Number(row.moq) < 0)) {
        return void setError(`Rate line ${idx + 1}: minimum order quantity must be a whole number.`);
      }
      payloadRates.push({
        id: row.id,
        label,
        productSku: row.productSku.trim().toUpperCase() || undefined,
        unitCostPaise,
        unit: row.unit,
        moqQty: row.moq.trim() ? Number(row.moq) : undefined,
        notes: row.notes.trim() || undefined,
      });
    }

    const payload: SupplierUpsertPayload = {
      name: name.trim(),
      type,
      contactPerson: contactPerson.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      village: village.trim() || undefined,
      city: city.trim() || undefined,
      state: stateName.trim() || undefined,
      pincode: pincode.trim() || undefined,
      addressLines: addressLines.trim() || undefined,
      status,
      paymentTerms: paymentTerms.trim() || undefined,
      licenseNumber: licenseNumber.trim() || undefined,
      notes: notes.trim() || undefined,
      productSkus: [...new Set(payloadRates.map((r) => r.productSku).filter((s): s is string => Boolean(s)))],
      rates: payloadRates,
    };

    setSaving(true);
    try {
      const doc = supplier
        ? await apiPost<unknown>(`/admin/suppliers/${supplier.id}`, payload)
        : await apiPost<unknown>("/admin/suppliers", payload);
      void doc;
      onSaved();
      onClose();
    } catch (err) {
      // Recoverable: keep every form value so the user can retry or correct.
      setError(err instanceof ApiError ? err.message : "Unexpected error — please try again.");
      setSaving(false);
    }
  }

  if (!open) return null;

  const skuOptions = products.map((p) => p.sku);

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
          aria-label={supplier ? `Edit ${supplier.name}` : "Add supplier"}
          className="flex max-h-[94vh] w-full flex-col overflow-hidden rounded-t-2xl bg-surface-container-lowest text-left shadow-2xl sm:max-w-3xl sm:rounded-2xl"
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-4 border-b border-outline-variant/40 bg-surface-container-low px-5 py-4 sm:px-6">
            <div>
              <span className="inline-block rounded-full bg-primary px-2.5 py-0.5 label-eyebrow text-on-primary">
                {supplier ? "Edit supplier record" : "Estate direct onboarding"}
              </span>
              <h2 className="mt-1.5 font-display text-lg font-semibold text-primary">
                {supplier ? `Edit — ${supplier.name}` : "Onboard new harvester / supplier"}
              </h2>
              <p className="mt-0.5 text-xs text-on-surface-variant">
                Rates saved here are negotiated procurement costs — they never touch customer-facing prices.
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
          <form onSubmit={submit} noValidate className="flex min-h-0 flex-1 flex-col">
            <datalist id="supplier-sku-options">
              {skuOptions.map((sku) => (
                <option key={sku} value={sku} />
              ))}
            </datalist>
            <div className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
              {/* Basic information */}
              <section className="space-y-3">
                <h3 className="label-eyebrow text-secondary">Basic information</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Supplier / business name" required>
                    <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="e.g. Kishtwar Saffron Cooperative" />
                  </Field>
                  <Field label="Supplier type" required>
                    <Select value={type} onChange={(e) => setType(e.target.value as SupplierType)}>
                      {SUPPLIER_TYPE_OPTIONS.map((o) => (
                        <option key={o.value} value={o.value}>
                          {o.label}
                        </option>
                      ))}
                    </Select>
                  </Field>
                </div>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field label="Primary contact person">
                    <Input value={contactPerson} onChange={(e) => setContactPerson(e.target.value)} maxLength={120} placeholder="e.g. Farooq Ahmad" />
                  </Field>
                  <Field label="Phone number">
                    <Input value={phone} onChange={(e) => setPhone(e.target.value)} maxLength={20} inputMode="tel" placeholder="+91 9XXXX XXXXX" className="font-mono" />
                  </Field>
                  <Field label="Email (optional)">
                    <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={160} placeholder="producer@estate.in" />
                  </Field>
                </div>
                <div className="max-w-56">
                  <Field label="Sourcing status" hint="Inactive means a seasonal pause — purchase history is kept.">
                    <Select value={status} onChange={(e) => setStatus(e.target.value as SupplierStatus)}>
                      <option value="active">Active sourcing</option>
                      <option value="inactive">Inactive / seasonal pause</option>
                    </Select>
                  </Field>
                </div>
              </section>

              {/* Location */}
              <section className="space-y-3">
                <h3 className="label-eyebrow text-secondary">Location</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-4">
                  <Field label="Village / locality">
                    <Input value={village} onChange={(e) => setVillage(e.target.value)} maxLength={120} />
                  </Field>
                  <Field label="City" required>
                    <Input value={city} onChange={(e) => setCity(e.target.value)} maxLength={80} placeholder="e.g. Canning" />
                  </Field>
                  <Field label="State" required>
                    <Input value={stateName} onChange={(e) => setStateName(e.target.value)} maxLength={80} placeholder="e.g. West Bengal" />
                  </Field>
                  <Field label="PIN code" error={undefined}>
                    <Input value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))} maxLength={6} inputMode="numeric" placeholder="743329" className="font-mono" />
                  </Field>
                </div>
                <Field label="Full address (optional)">
                  <Textarea value={addressLines} onChange={(e) => setAddressLines(e.target.value)} rows={2} maxLength={400} />
                </Field>
              </section>

              {/* Products & negotiated rates */}
              <section className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="label-eyebrow text-secondary">Products supplied &amp; negotiated rates</h3>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => setRates((rows) => [...rows, emptyRate()])}
                    disabled={rates.length >= 50}
                  >
                    + Add rate line
                  </Button>
                </div>
                <p className="text-xs text-on-surface-variant">
                  One line per agreed item. Link a catalogue SKU where one exists — purchase orders and inventory stay matched through it.
                </p>
                {rates.map((row, idx) => (
                  <fieldset key={row.key} className="rounded-xl border border-outline-variant/40 bg-surface-container-low/60 p-3">
                    <legend className="px-1.5 label-tracked text-on-surface-variant">Rate line {idx + 1}</legend>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-12">
                      <div className="sm:col-span-5">
                        <Field label="Item / product name" required htmlFor={`rate-label-${row.key}`}>
                          <Input
                            id={`rate-label-${row.key}`}
                            value={row.label}
                            onChange={(e) => setRate(row.key, { label: e.target.value })}
                            maxLength={160}
                            placeholder="e.g. Raw Wild Forest Honey (Grade-A bulk)"
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-3">
                        <Field
                          label="Catalogue SKU"
                          hint={skuOptions.length > 0 ? "Pick a real SKU or type one" : "Optional — e.g. AN-HNY-001"}
                          htmlFor={`rate-sku-${row.key}`}
                        >
                          <Input
                            id={`rate-sku-${row.key}`}
                            list="supplier-sku-options"
                            value={row.productSku}
                            onChange={(e) => setRate(row.key, { productSku: e.target.value.toUpperCase() })}
                            maxLength={41}
                            placeholder="AN-HNY-001"
                            className="font-mono"
                            aria-label={`Catalogue SKU for rate line ${idx + 1}`}
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label="Cost ₹" required>
                          <Input
                            value={row.cost}
                            onChange={(e) => setRate(row.key, { cost: e.target.value })}
                            inputMode="decimal"
                            placeholder="380.00"
                            className="font-mono"
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-2">
                        <Field label="Unit">
                          <Select value={row.unit} onChange={(e) => setRate(row.key, { unit: e.target.value })} aria-label={`Unit for rate line ${idx + 1}`}>
                            {UNITS.map((u) => (
                              <option key={u} value={u}>
                                / {u}
                              </option>
                            ))}
                          </Select>
                        </Field>
                      </div>
                    </div>
                    <div className="mt-3 grid grid-cols-1 items-end gap-3 sm:grid-cols-12">
                      <div className="sm:col-span-4">
                        <Field label="Min order qty" hint={`Same unit (${row.unit}), optional`}>
                          <Input
                            value={row.moq}
                            onChange={(e) => setRate(row.key, { moq: e.target.value })}
                            inputMode="numeric"
                            placeholder="e.g. 500"
                            className="font-mono"
                          />
                        </Field>
                      </div>
                      <div className="sm:col-span-6">
                        <Field label="Line notes">
                          <Input value={row.notes} onChange={(e) => setRate(row.key, { notes: e.target.value })} maxLength={300} placeholder="Grade, moisture spec, packaging…" />
                        </Field>
                      </div>
                      <div className="flex sm:col-span-2 sm:justify-end">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="text-error hover:bg-error-container/40"
                          onClick={() => setRates((rows) => (rows.length > 1 ? rows.filter((r) => r.key !== row.key) : [emptyRate()]))}
                          aria-label={`Remove rate line ${idx + 1}`}
                        >
                          <IconTrash className="h-4 w-4" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  </fieldset>
                ))}
              </section>

              {/* Business details */}
              <section className="space-y-3">
                <h3 className="label-eyebrow text-secondary">Business details</h3>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Payment terms">
                    <Input value={paymentTerms} onChange={(e) => setPaymentTerms(e.target.value)} maxLength={300} placeholder="e.g. 50% advance, balance on dispatch" />
                  </Field>
                  <Field label="FSSAI / NABL / GI licence #">
                    <Input value={licenseNumber} onChange={(e) => setLicenseNumber(e.target.value)} maxLength={80} className="font-mono" placeholder="LIC-XXXXXXXX" />
                  </Field>
                </div>
                <Field label="Internal notes" hint="Harvest protocol, quality checks, contact quirks — admin-visible only.">
                  <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} maxLength={2000} />
                </Field>
              </section>

              {error ? (
                <p role="alert" className="rounded-lg border border-error/30 bg-error-container px-3 py-2.5 text-sm font-medium text-on-error-container">
                  {error}
                </p>
              ) : null}
            </div>

            {/* Footer */}
            <div className="flex flex-wrap items-center justify-end gap-2 border-t border-outline-variant/40 bg-surface-container-low px-5 py-3.5 sm:px-6">
              <Button type="button" variant="outline" onClick={requestClose} disabled={saving}>
                Cancel
              </Button>
              <Button type="submit" loading={saving}>
                {supplier ? "Save changes" : "Save supplier"}
              </Button>
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
              This form has edits that have not been saved yet. Closing now will lose them.
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
