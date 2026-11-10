"use client";
/**
 * Edit Profile modal — real POST /auth/profile through the shared auth context.
 *
 * Fields follow the existing customer model exactly: displayName (one field) and an
 * optional contact phone. The email is displayed read-only because it is part of the
 * Firebase sign-in identity — the storefront has no supported flow for changing it,
 * so none is offered here (honest UI, no fake success).
 *
 * There is deliberately NO phone registration / OTP / verification of any kind:
 * the phone is an ordinary optional profile field, nothing more.
 */
import { useEffect, useRef, useState } from "react";
import { PUBLIC_API_URL } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { IconLock, IconX } from "../icons";

interface Props {
  open: boolean;
  onClose: () => void;
}

export function ProfileModal({ open, onClose }: Props) {
  const auth = useAuth();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [savedOk, setSavedOk] = useState(false);
  const [serverError, setServerError] = useState<string | null>(null);

  // Seed the form from the live profile each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setName(auth.customer?.displayName ?? "");
    setPhone(auth.customer?.phone ?? "");
    setErrors({});
    setServerError(null);
    setSavedOk(false);
  }, [open, auth.customer?.displayName, auth.customer?.phone]);

  // Focus the first field, lock body scroll, close on Escape.
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

  function validate(): Record<string, string> {
    const errs: Record<string, string> = {};
    if (name.trim().length < 1) errs.name = "Your name is required";
    const p = phone.trim();
    if (p && !/^(\+91[\s-]?)?[6-9]\d{9}$/.test(p)) errs.phone = "Enter a valid 10-digit Indian mobile number, or leave it empty";
    return errs;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0 || !auth.token) return;
    setSaving(true);
    setServerError(null);
    try {
      const res = await fetch(`${PUBLIC_API_URL}/auth/profile`, {
        method: "POST",
        headers: { "content-type": "application/json", authorization: `Bearer ${auth.token}` },
        body: JSON.stringify({ displayName: name.trim(), phone: phone.trim() }),
      });
      const body = (await res.json()) as { ok: boolean; error?: { message: string } };
      if (!body.ok) throw new Error(body.error?.message ?? "Could not save your profile");
      await auth.refreshProfile();
      setSavedOk(true);
      window.setTimeout(() => onClose(), 900);
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not save your profile");
    } finally {
      setSaving(false);
    }
  }

  const email = auth.customer?.email ?? auth.principal?.email ?? "";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-gutter-mobile backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="profile-modal-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl bg-surface shadow-2xl">
        <div className="flex items-center justify-between bg-surface-container-low px-space-lg py-space-md">
          <div>
            <h3 id="profile-modal-title" className="font-display text-headline-sm font-semibold text-primary">
              Edit Personal Profile
            </h3>
            <p className="text-body-sm text-on-surface-variant">Update how we greet you and where order updates go.</p>
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
          <div>
            <label htmlFor="profile-name" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
              Full Name
            </label>
            <input
              ref={nameRef}
              id="profile-name"
              type="text"
              className="input-base"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
              maxLength={120}
              aria-invalid={Boolean(errors.name)}
              aria-describedby={errors.name ? "profile-name-error" : undefined}
            />
            {errors.name && (
              <p id="profile-name-error" className="mt-1 text-body-sm text-error">
                {errors.name}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="profile-phone" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
              Contact Number <span className="normal-case tracking-normal text-on-surface-variant/70">(optional)</span>
            </label>
            <div className="flex items-stretch overflow-hidden rounded-sm border-[1.5px] border-line-warm bg-soft-cream shadow-sm transition-colors focus-within:border-primary-container focus-within:shadow-[0_0_0_3px_rgb(112_44_53/0.1)]">
              <span className="select-none border-r border-line-warm bg-surface-container-low px-space-md py-[0.6rem] font-medium text-on-surface-variant">+91</span>
              <input
                id="profile-phone"
                type="tel"
                inputMode="numeric"
                className="w-full bg-transparent px-space-sm py-[0.6rem] text-on-surface outline-none"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="98765 43210"
                autoComplete="tel-national"
                aria-invalid={Boolean(errors.phone)}
                aria-describedby={errors.phone ? "profile-phone-error" : undefined}
              />
            </div>
            {errors.phone && (
              <p id="profile-phone-error" className="mt-1 text-body-sm text-error">
                {errors.phone}
              </p>
            )}
            <p className="mt-1 text-body-sm text-on-surface-variant">Only used for delivery coordination — never for sign-in.</p>
          </div>

          <div>
            <label htmlFor="profile-email" className="mb-1 block text-label-sm uppercase tracking-wider text-on-surface-variant">
              Email Address
            </label>
            <input
              id="profile-email"
              type="email"
              className="input-base cursor-not-allowed bg-surface-container-low text-on-surface-variant"
              value={email}
              readOnly
              disabled
            />
            <p className="mt-1 flex items-center gap-1 text-body-sm text-tertiary-container">
              <IconLock size={14} />
              Part of your sign-in identity — write to our concierge if it needs changing.
            </p>
          </div>

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
              {saving ? "Saving…" : savedOk ? "Saved ✓" : "Save Changes"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
