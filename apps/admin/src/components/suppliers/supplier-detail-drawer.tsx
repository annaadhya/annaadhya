"use client";
/**
 * Supplier detail slide-over for the Suppliers console (heritage design language).
 * Three tabs, all backed by real data:
 *  - Overview: persisted contact / location / business details (no invented fields)
 *  - Rates & Sourcing: the supplier's negotiated procurement-rate lines
 *  - Purchase History: REAL consignments from /admin/purchases?supplierId=…
 *    (only when the viewer holds purchases:read; the tab is hidden otherwise)
 * Footer: status change (activate / seasonal pause) with confirmation — history untouched.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { ApiError, apiGet, apiPost } from "@/lib/api";
import { useToast } from "@/lib/toast";
import { formatDate, formatINR, humanize } from "@/lib/format";
import { relativeDayTime } from "@/lib/relative-time";
import type { PurchaseDoc, SupplierLedgerRow } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { SUPPLIER_TYPE_OPTIONS } from "./supplier-form-dialog";
import { IconClose, IconEdit, IconLeaf, IconMail, IconPause, IconPhone, IconPin, IconPlay, IconShield } from "./icons";

export function supplierTypeLabel(type: string): string {
  return SUPPLIER_TYPE_OPTIONS.find((o) => o.value === type)?.label ?? humanize(type);
}

type Tab = "overview" | "rates" | "purchases";

export interface SupplierDetailDrawerProps {
  open: boolean;
  onClose: () => void;
  row: SupplierLedgerRow | null;
  canWrite: boolean;
  canPurchasesRead: boolean;
  onEdit: (row: SupplierLedgerRow) => void;
  /** Called with the supplier id + new status after a successful status change. */
  onStatusChanged: (id: string, status: "active" | "inactive") => void;
}

export function SupplierDetailDrawer({ open, onClose, row, canWrite, canPurchasesRead, onEdit, onStatusChanged }: SupplierDetailDrawerProps) {
  const toast = useToast();
  const [tab, setTab] = useState<Tab>("overview");
  const [confirmingPause, setConfirmingPause] = useState(false);
  const [changingStatus, setChangingStatus] = useState(false);
  const [purchases, setPurchases] = useState<PurchaseDoc[] | null>(null);
  const [purchasesError, setPurchasesError] = useState<string | null>(null);
  const [purchasesLoading, setPurchasesLoading] = useState(false);
  const [copiedPhone, setCopiedPhone] = useState(false);

  // Reset per open + load purchase history when the tab needs it.
  useEffect(() => {
    if (!open) {
      setTab("overview");
      setConfirmingPause(false);
      setPurchases(null);
      setPurchasesError(null);
      setCopiedPhone(false);
      return;
    }
  }, [open, row?.id]);

  useEffect(() => {
    if (!open || !row || tab !== "purchases" || !canPurchasesRead) return;
    let cancelled = false;
    setPurchasesLoading(true);
    setPurchasesError(null);
    apiGet<PurchaseDoc[]>("/admin/purchases", { supplierId: row.id })
      .then((rows) => {
        if (!cancelled) setPurchases(rows);
      })
      .catch((err: unknown) => {
        if (!cancelled) setPurchasesError(err instanceof ApiError ? err.message : "Unexpected error");
      })
      .finally(() => {
        if (!cancelled) setPurchasesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, row, tab, canPurchasesRead]);

  // Escape closes; body scroll locked while open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !changingStatus && !confirmingPause) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [open, changingStatus, confirmingPause, onClose]);

  if (!open || !row) return null;

  const active = row.status === "active";

  async function changeStatus(next: "active" | "inactive") {
    if (!row) return;
    setChangingStatus(true);
    try {
      await apiPost(`/admin/suppliers/${row.id}/status`, { status: next });
      toast.success(
        next === "active" ? "Supplier reactivated" : "Supplier paused",
        `${row.name} marked ${next === "active" ? "active" : "inactive"} — purchase history preserved.`,
      );
      onStatusChanged(row.id, next);
      setConfirmingPause(false);
      onClose();
    } catch (err) {
      toast.error("Could not update status", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setChangingStatus(false);
    }
  }

  function copyPhone() {
    if (!row?.phone) return;
    navigator.clipboard
      .writeText(row.phone)
      .then(() => {
        setCopiedPhone(true);
        window.setTimeout(() => setCopiedPhone(false), 1500);
      })
      .catch(() => toast.error("Copy failed", "The browser blocked clipboard access."));
  }

  const tabs: { key: Tab; label: string; show: boolean }[] = [
    { key: "overview", label: "Overview", show: true },
    { key: "rates", label: "Rates & Sourcing", show: true },
    { key: "purchases", label: "Purchase History", show: canPurchasesRead },
  ];

  return (
    <>
      <div
        aria-hidden
        onClick={() => !changingStatus && !confirmingPause && onClose()}
        className="backdrop-in fixed inset-0 z-40 bg-inverse-surface/40 backdrop-blur-xs"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Supplier details — ${row.name}`}
        className="drawer-in fixed inset-y-0 right-0 z-50 flex w-full max-w-2xl flex-col bg-surface-container-lowest shadow-2xl"
      >
        {/* Header */}
        <div className="border-b border-outline-variant/40 bg-surface-container-low px-5 py-4 sm:px-6">
          <div className="flex items-start justify-between gap-4">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold ${
                  active ? "bg-secondary-container text-on-secondary-container" : "bg-surface-container-high text-on-surface-variant"
                }`}
              >
                <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${active ? "bg-secondary" : "bg-outline"}`} />
                {active ? "Active" : "Inactive"}
              </span>
              <span className="font-mono text-[11px] text-outline">ID #{row.id.slice(0, 12).toUpperCase()}</span>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close panel"
              className="rounded-full p-2 text-on-surface-variant/60 transition-colors hover:bg-surface-container-high hover:text-on-surface"
            >
              <IconClose className="h-4 w-4" />
            </button>
          </div>
          <h2 className="mt-1 font-display text-xl font-semibold leading-snug text-primary">{row.name}</h2>
          <p className="mt-0.5 text-[13px] text-on-surface-variant">
            {supplierTypeLabel(row.type)}
            {row.location ? ` • ${row.location}` : ""}
          </p>

          {/* Action bar */}
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {canWrite ? (
              <Button size="sm" onClick={() => onEdit(row)}>
                <IconEdit className="h-4 w-4" />
                Edit supplier
              </Button>
            ) : null}
            <Link href="/purchases">
              <Button size="sm" variant="outline">
                Create purchase order
              </Button>
            </Link>
            {row.phone ? (
              <Button size="sm" variant="outline" onClick={copyPhone}>
                <IconPhone className="h-4 w-4" />
                {copiedPhone ? "Copied!" : "Copy phone"}
              </Button>
            ) : null}
          </div>

          {/* Tabs */}
          <div className="mt-4 flex items-center gap-4 border-b border-outline-variant/30" role="tablist" aria-label="Supplier detail sections">
            {tabs
              .filter((t) => t.show)
              .map((t) => (
                <button
                  key={t.key}
                  type="button"
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`-mb-px border-b-2 pb-2 label-tracked uppercase transition-colors ${
                    tab === t.key ? "border-primary font-bold text-primary" : "border-transparent text-outline hover:text-on-surface"
                  }`}
                >
                  {t.label}
                </button>
              ))}
          </div>
        </div>

        {/* Body */}
        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
          {tab === "overview" ? (
            <>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div className="rounded-xl bg-surface-container-low p-4">
                  <p className="label-eyebrow text-outline">Primary contact</p>
                  <p className="mt-1 text-sm font-semibold text-on-surface">{row.contactPerson ?? "Not recorded"}</p>
                  <p className="mt-1 flex items-center gap-1.5 font-mono text-xs text-on-surface-variant">
                    <IconPhone className="h-3.5 w-3.5" />
                    {row.phone ?? "—"}
                  </p>
                  <p className="mt-0.5 flex items-center gap-1.5 truncate text-xs text-on-surface-variant">
                    <IconMail className="h-3.5 w-3.5 shrink-0" />
                    {row.email ?? "No email on file"}
                  </p>
                </div>
                <div className="rounded-xl bg-surface-container-low p-4">
                  <p className="label-eyebrow text-outline">Sourcing location</p>
                  <p className="mt-1 flex items-start gap-1.5 text-sm font-semibold text-on-surface">
                    <IconPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-secondary" />
                    <span>
                      {row.location ?? "Not recorded"}
                      {row.pincode ? <span className="block font-mono text-xs font-normal text-on-surface-variant">PIN {row.pincode}</span> : null}
                    </span>
                  </p>
                  {row.categoryNames.length > 0 ? (
                    <div className="mt-2 flex flex-wrap gap-1">
                      {row.categoryNames.map((c) => (
                        <span key={c} className="rounded bg-surface-container px-1.5 py-0.5 text-[11px] font-medium text-on-surface">
                          {c}
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-1 text-xs text-outline">No catalogue categories linked yet</p>
                  )}
                </div>
              </div>

              <div className="rounded-xl border border-outline-variant/30 p-4">
                <p className="label-eyebrow text-outline">Business details</p>
                <dl className="mt-2 grid grid-cols-1 gap-x-6 gap-y-2 text-[13px] sm:grid-cols-2">
                  <div>
                    <dt className="text-on-surface-variant">Payment terms</dt>
                    <dd className="font-medium text-on-surface">{row.paymentTerms ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="flex items-center gap-1 text-on-surface-variant">
                      <IconShield className="h-3.5 w-3.5" /> Licence reference
                    </dt>
                    <dd className="font-mono font-medium text-on-surface">{row.licenseNumber ?? "—"}</dd>
                  </div>
                  <div>
                    <dt className="text-on-surface-variant">Onboarded</dt>
                    <dd className="font-medium text-on-surface">{formatDate(row.createdAt)}</dd>
                  </div>
                  <div>
                    <dt className="text-on-surface-variant">Last updated</dt>
                    <dd className="font-medium text-on-surface">{relativeDayTime(row.updatedAt)}</dd>
                  </div>
                </dl>
              </div>

              <div className="rounded-xl bg-surface-container-high/60 p-4">
                <p className="label-eyebrow text-primary">Internal notes</p>
                <p className="mt-1.5 whitespace-pre-wrap text-[13px] leading-relaxed text-on-surface-variant">
                  {row.notes?.trim() ? row.notes : "No internal notes recorded for this supplier."}
                </p>
              </div>

              {!canPurchasesRead ? (
                <p className="text-xs text-outline">
                  Purchase history is visible to teammates with the purchases permission.
                </p>
              ) : null}
            </>
          ) : null}

          {tab === "rates" ? (
            <>
              {row.rates.length === 0 ? (
                <EmptyState
                  title="No negotiated rates recorded"
                  description="Add rate lines from Edit supplier to lock this estate's procurement costs per item."
                  icon={<IconLeaf className="h-5 w-5" />}
                />
              ) : (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <p className="text-[13px] text-on-surface-variant">
                      {row.rates.length} negotiated rate line{row.rates.length === 1 ? "" : "s"} — procurement costs, not selling prices.
                    </p>
                  </div>
                  {row.rates.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 rounded-xl bg-surface-container-low p-3.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-on-surface" title={r.label}>
                          {r.label}
                        </p>
                        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-on-surface-variant">
                          {r.productSku ? <span className="font-mono text-outline">{r.productSku}</span> : <span className="text-outline">Not linked to catalogue</span>}
                          {r.moqQty != null && r.moqQty > 0 ? <span>• MOQ {r.moqQty} {r.unit}</span> : null}
                        </p>
                        {r.notes ? <p className="mt-0.5 truncate text-xs text-outline" title={r.notes}>{r.notes}</p> : null}
                      </div>
                      <div className="shrink-0 text-right">
                        <p className="font-mono text-sm font-bold text-primary">
                          {formatINR(r.unitCostPaise)} <span className="text-xs font-semibold text-on-surface-variant">/ {r.unit}</span>
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          ) : null}

          {tab === "purchases" ? (
            <>
              {purchasesLoading ? (
                <p className="py-8 text-center text-sm text-on-surface-variant">Loading consignments…</p>
              ) : purchasesError ? (
                <ErrorState message={purchasesError} onRetry={() => setTab("overview")} />
              ) : !purchases || purchases.length === 0 ? (
                <EmptyState
                  title="No consignments yet"
                  description="This supplier has no purchase orders recorded. Raise one from the Purchases console — stock enters the ledger only when goods are received."
                />
              ) : (
                <div className="overflow-hidden rounded-xl border border-outline-variant/30">
                  <Table>
                    <THead>
                      <TR>
                        <TH scope="col">PO #</TH>
                        <TH scope="col">Date</TH>
                        <TH scope="col">Units</TH>
                        <TH scope="col" className="text-right">Value</TH>
                        <TH scope="col" className="text-right">Status</TH>
                      </TR>
                    </THead>
                    <TBody>
                      {purchases.map((p) => {
                        const units = p.items.reduce((sum, i) => sum + i.qtyOrdered, 0);
                        const value = p.items.reduce((sum, i) => sum + i.unitCostPaise * i.qtyOrdered, 0);
                        return (
                          <TR key={p.id}>
                            <TD className="font-mono font-semibold text-primary">{p.reference}</TD>
                            <TD className="text-on-surface-variant">{formatDate(p.createdAt)}</TD>
                            <TD>{units}</TD>
                            <TD className="text-right font-mono font-medium">{formatINR(value)}</TD>
                            <TD className="text-right">
                              <span
                                className={`text-[11px] font-bold ${
                                  p.status === "received" ? "text-secondary" : p.status === "cancelled" ? "text-error" : "text-tertiary"
                                }`}
                              >
                                {humanize(p.status)}
                              </span>
                            </TD>
                          </TR>
                        );
                      })}
                    </TBody>
                  </Table>
                </div>
              )}
            </>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t border-outline-variant/40 bg-surface-container-low px-5 py-3.5 sm:px-6">
          {canWrite ? (
            active ? (
              <Button variant="ghost" size="sm" className="text-error hover:bg-error-container/40" onClick={() => setConfirmingPause(true)} disabled={changingStatus}>
                <IconPause className="h-4 w-4" />
                Pause sourcing
              </Button>
            ) : (
              <Button variant="ghost" size="sm" className="text-secondary hover:bg-secondary-container/50" onClick={() => changeStatus("active")} disabled={changingStatus}>
                <IconPlay className="h-4 w-4" />
                Reactivate sourcing
              </Button>
            )
          ) : (
            <span />
          )}
          <Button variant="outline" size="sm" onClick={onClose}>
            Close panel
          </Button>
        </div>
      </aside>

      {/* Pause confirmation */}
      {confirmingPause ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-inverse-surface/50 p-4 backdrop-blur-xs">
          <div role="alertdialog" aria-modal="true" aria-label="Pause sourcing" className="w-full max-w-md rounded-xl bg-surface-container-lowest p-5 shadow-2xl">
            <h3 className="font-display text-lg font-semibold text-primary">Pause sourcing from {row.name}?</h3>
            <p className="mt-1 text-sm text-on-surface-variant">
              The supplier becomes inactive and disappears from the active directory, but every purchase record and negotiated rate stays
              exactly as it is. You can reactivate at any time.
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => setConfirmingPause(false)} disabled={changingStatus}>
                Cancel
              </Button>
              <Button size="sm" className="bg-error text-on-error hover:bg-error/90" loading={changingStatus} onClick={() => changeStatus("inactive")}>
                Pause sourcing
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
