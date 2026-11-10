"use client";
/**
 * Add / Edit Delivery Address modal — the customer's real address book
 * (POST / PATCH /customers/me/addresses through the shared auth session).
 *
 * The same field rules the checkout form and the API schema enforce; the first
 * saved address becomes the default automatically (server behaviour, surfaced
 * honestly here). Editing submits a full replacement to PATCH — one schema on
 * every surface. A delivery-address phone is contact logistics only; there is
 * no registration, OTP or verification flow anywhere in this feature.
 */
import { useEffect, useRef, useState } from "react";
import { PUBLIC_API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import type { CustomerDoc } from "@/lib/types";
import { IconX } from "../icons";
import {
  ADDRESS_LABELS,
  EMPTY_ADDRESS_FORM,
  STATES,
  validateAddressForm,
  type AddressFormState,
} from "./account-shared";

type CustomerAddress = CustomerDoc["addresses"][number];

interface Props {
  open: boolean;
  /** Address to edit, or null to add a new one. */
  address: CustomerAddress | null;
  /** The customer's current address book — used for the duplicate guard. */
  addresses: CustomerAddress[];
  onClose: () => void;
  /** Called after a successful save (profile already refreshed). */
  onSaved: (customer: CustomerDoc) => void;
}

function sameAddressContent(a: Pick<CustomerAddress, "fullName" | "phone" | "line1" | "line2" | "city" | "pincode">, b: AddressFormState): boolean {
  return (
    a.fullName.trim() === b.fullName.trim() &&
    a.phone.replace(/\D/g, "").slice(-10) === b.phone.replace(/\D/g, "").slice(-10) &&
    a.line1.trim() === b.line1.trim() &&
    (a.line2 ?? "").trim() === b.line2.trim() &&
    a.city.trim() === b.city.trim() &&
    a.pincode.trim() === b.pincode.trim()
  );
}

export function AddressModal({ open, address, addresses, onClose, onSaved }: Props) {
  const auth = useAuth();
  const nameRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState<AddressFormState>(EMPTY_ADDRESS_FORM);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  const editing = Boolean(address);

  useEffect(() => {
    if (!open) return;
    setForm(
      address
        ? {
            label: address.label || "Home",
            fullName: address.fullName,
            phone: address.phone,
            pincode: address.pincode,
            line1: address.line1,
            line2: address.line2 ?? "",
            landmark: address.landmark ?? "",
            city: address.city,
            state: address.state,
            isDefault: address.isDefault,
          }
        : {
            ...EMPTY_ADDRESS_FORM,
            fullName: auth.customer?.displayName ?? "",
            phone: auth.customer?.phone ?? "",
            isDefault: addresses.length === 0,
          },
    );
    setErrors({});
    setServerError(null);
  }, [open, address, auth.customer?.displayName, auth.customer?.phone, addresses.length]);

  useEffect(() => {
    if (!open) return;
    const t = window.setTimeout(() => nameRef.current?.focus(), 60);
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [open, onClose]);

  if (!open) return null;

  function set<K extends keyof AddressFormState>(key: K, value: AddressFormState[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs = validateAddressForm(form);
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !auth.token) return;

    if (!editing) {
      const duplicate = addresses.find((a) => sameAddressContent(a, form));
      if (duplicate) {
        setServerError("This address is already in your address book — edit it instead of adding a copy.");
        return;
      }
    }

    setSaving(true);
    setServerError(null);
    try {
      const payload = {
        label: form.label,
        fullName: form.fullName.trim(),
        phone: form.phone.trim(),
        line1: form.line1.trim(),
        line2: form.line2.trim() || undefined,
        landmark: form.landmark.trim() || undefined,
        city: form.city.trim(),
        state: form.state.trim(),
        pincode: form.pincode.trim(),
        isDefault: form.isDefault,
      };
      const res = await fetch(editing ? `${PUBLIC_API_URL}/customers/me/addresses/${address!.id}` : `${PUBLIC_API_URL}/customers/me/addresses`, {
        method: editing ? "PATCH" : "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${auth.token}` },
        body: JSON.stringify(payload),
      });
      const body = (await res.json()) as { ok: boolean; data?: CustomerDoc; error?: { message: string } };
      if (!body.ok || !body.data) throw new Error(body.error?.message ?? "Could not save the address");
      await auth.refreshProfile();
      onSaved(body.data);
      onClose();
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not save the address");
    } finally {
      setSaving(false);
    }
  }

  const field = (key: keyof AddressFormState) => errors[key];

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-gutter-mobile backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="address-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-xl bg-surface shadow-2xl">
        <div className="sticky top-0 z-10 flex items-center justify-between bg-surface-container-low px-space-lg py-space-md">
          <div>
            <h3 id="address-modal-title" className="font-display text-headline-sm font-semibold text-primary">
              {editing ? "Edit Delivery Address" : "Add Delivery Address"}
            </h3>
            <p className="text-body-sm text-on-surface-variant">Saved here and preselected automatically at checkout.</p>
          </div>
          <button
            type="button"
            aria-label="Close dialog"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-container-high text-on-surface-variant transition-colors hover:text-primary"
            onClick={onClose}
          >
            <IconX size={18} />
          </button>
        </div>

        <form className="space-y-space-md px-space-lg py-space-lg" onSubmit={save} noValidate>
          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
            <div>
              <label htmlFor="addr-label" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
                Address Label
              </label>
              <select id="addr-label" className="input-base" value={form.label} onChange={(e) => set("label", e.target.value)}>
                {ADDRESS_LABELS.map((l) => (
                  <option key={l} value={l}>
                    {l}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label htmlFor="addr-name" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
                Recipient Full Name
              </label>
              <input
                ref={nameRef}
                id="addr-name"
                type="text"
                className="input-base"
                value={form.fullName}
                onChange={(e) => set("fullName", e.target.value)}
                placeholder="e.g. Aarav Sharma"
                autoComplete="name"
                maxLength={120}
                aria-invalid={Boolean(field("fullName"))}
                aria-describedby={field("fullName") ? "addr-name-error" : undefined}
              />
              {field("fullName") && (
                <p id="addr-name-error" className="mt-1 text-body-sm text-error">
                  {errors.fullName}
                </p>
              )}
            </div>
          </div>

          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
            <div>
              <label htmlFor="addr-phone" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
                Recipient Contact Number
              </label>
              <input
                id="addr-phone"
                type="tel"
                inputMode="numeric"
                className="input-base"
                value={form.phone}
                onChange={(e) => set("phone", e.target.value)}
                placeholder="10-digit mobile number"
                autoComplete="tel-national"
                aria-invalid={Boolean(field("phone"))}
                aria-describedby={field("phone") ? "addr-phone-error" : undefined}
              />
              {field("phone") && (
                <p id="addr-phone-error" className="mt-1 text-body-sm text-error">
                  {errors.phone}
                </p>
              )}
            </div>
            <div>
              <label htmlFor="addr-pincode" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
                PIN Code
              </label>
              <input
                id="addr-pincode"
                type="text"
                inputMode="numeric"
                className="input-base text-tabular"
                value={form.pincode}
                onChange={(e) => set("pincode", e.target.value.replace(/[^\d]/g, "").slice(0, 6))}
                placeholder="6-digit PIN"
                autoComplete="postal-code"
                aria-invalid={Boolean(field("pincode"))}
                aria-describedby={field("pincode") ? "addr-pincode-error" : undefined}
              />
              {field("pincode") && (
                <p id="addr-pincode-error" className="mt-1 text-body-sm text-error">
                  {errors.pincode}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="addr-line1" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
              Flat, House No., Building / Villa
            </label>
            <input
              id="addr-line1"
              type="text"
              className="input-base"
              value={form.line1}
              onChange={(e) => set("line1", e.target.value)}
              placeholder="e.g. Flat 402, Nilgiri Heights"
              autoComplete="address-line1"
              maxLength={160}
              aria-invalid={Boolean(field("line1"))}
              aria-describedby={field("line1") ? "addr-line1-error" : undefined}
            />
            {field("line1") && (
              <p id="addr-line1-error" className="mt-1 text-body-sm text-error">
                {errors.line1}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="addr-line2" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
              Street / Area <span className="normal-case tracking-normal text-on-surface-variant/70">(optional)</span>
            </label>
            <input
              id="addr-line2"
              type="text"
              className="input-base"
              value={form.line2}
              onChange={(e) => set("line2", e.target.value)}
              placeholder="e.g. 14th Cross, Indiranagar"
              autoComplete="address-line2"
              maxLength={160}
            />
          </div>

          <div className="grid grid-cols-1 gap-space-md sm:grid-cols-2">
            <div>
              <label htmlFor="addr-landmark" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
                Landmark <span className="normal-case tracking-normal text-on-surface-variant/70">(optional)</span>
              </label>
              <input
                id="addr-landmark"
                type="text"
                className="input-base"
                value={form.landmark}
                onChange={(e) => set("landmark", e.target.value)}
                placeholder="e.g. Opposite the metro station"
                maxLength={120}
              />
            </div>
            <div>
              <label htmlFor="addr-city" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
                City
              </label>
              <input
                id="addr-city"
                type="text"
                className="input-base"
                value={form.city}
                onChange={(e) => set("city", e.target.value)}
                placeholder="e.g. Bengaluru"
                autoComplete="address-level2"
                maxLength={80}
                aria-invalid={Boolean(field("city"))}
                aria-describedby={field("city") ? "addr-city-error" : undefined}
              />
              {field("city") && (
                <p id="addr-city-error" className="mt-1 text-body-sm text-error">
                  {errors.city}
                </p>
              )}
            </div>
          </div>

          <div>
            <label htmlFor="addr-state" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
              State
            </label>
            <select
              id="addr-state"
              className="input-base"
              value={STATES.includes(form.state) ? form.state : "Other"}
              onChange={(e) => set("state", e.target.value)}
              autoComplete="address-level1"
            >
              {STATES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            {field("state") && (
              <p className="mt-1 text-body-sm text-error">{errors.state}</p>
            )}
          </div>

          <label className="flex cursor-pointer items-start gap-space-sm rounded-sm bg-surface-container-low px-space-md py-space-sm">
            <input
              type="checkbox"
              className="mt-0.5 h-4 w-4 accent-primary-container"
              checked={form.isDefault}
              onChange={(e) => set("isDefault", e.target.checked)}
            />
            <span className="text-body-sm text-on-surface">
              Set as my default delivery address
              <span className="block text-on-surface-variant">Checkout preselects this address for every new order.</span>
            </span>
          </label>

          {serverError && (
            <p role="alert" className="rounded-sm bg-error-container px-space-md py-2 text-body-sm text-on-error-container">
              {serverError}
            </p>
          )}

          <div className="flex items-center justify-end gap-space-sm pt-space-md">
            <button
              type="button"
              className="rounded-sm px-space-lg py-2 font-semibold text-on-surface-variant transition-colors hover:text-primary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="btn-primary px-space-xl py-2 text-label-lg disabled:cursor-not-allowed disabled:opacity-55" disabled={saving}>
              {saving ? "Saving…" : editing ? "Save Changes" : "Save Address"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
