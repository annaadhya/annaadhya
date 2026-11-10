"use client";
/** Confirmation dialog before an address is removed — destructive actions always
 *  confirm, per the design system's accessibility rules. */
import { useEffect } from "react";
import type { CustomerDoc } from "@/lib/types";
import { IconAlertTriangle, IconTrash } from "../icons";

type CustomerAddress = CustomerDoc["addresses"][number];

interface Props {
  address: CustomerAddress | null;
  busy: boolean;
  onCancel: () => void;
  onConfirm: () => void;
}

export function DeleteAddressDialog({ address, busy, onCancel, onConfirm }: Props) {
  useEffect(() => {
    if (!address) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prevOverflow;
    };
  }, [address, busy, onCancel]);

  if (!address) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-on-surface/40 p-gutter-mobile backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="delete-address-title"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <div className="w-full max-w-md rounded-xl bg-surface p-space-lg shadow-2xl">
        <div className="flex items-start gap-space-md">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-error-container text-on-error-container">
            <IconTrash size={19} />
          </div>
          <div>
            <h3 id="delete-address-title" className="font-display text-headline-sm font-semibold text-on-surface">
              Remove this address?
            </h3>
            <p className="mt-space-xs text-body-sm text-on-surface-variant">
              <span className="font-medium text-on-surface">{address.fullName}</span> — {address.line1}, {address.city} {address.pincode}
            </p>
            <p className="mt-space-xs text-body-sm text-on-surface-variant">
              Orders already placed keep the delivery details they were shipped with; this only removes it from your saved address book.
            </p>
          </div>
        </div>
        <div className="mt-space-lg flex justify-end gap-space-sm">
          <button type="button" className="rounded-sm px-space-lg py-2 font-semibold text-on-surface-variant transition-colors hover:text-primary" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="rounded-sm bg-error px-space-lg py-2 font-semibold text-on-error transition-opacity hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-55"
            onClick={onConfirm}
            disabled={busy}
          >
            <span className="flex items-center gap-1.5">
              <IconAlertTriangle size={15} />
              {busy ? "Removing…" : "Remove Address"}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
}
