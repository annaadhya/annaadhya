"use client";
/**
 * Per-variant stock ledger dialog — real movement records from
 * GET /admin/inventory/movements?variantId=… (no fabricated history).
 */
import { ApiError, apiGet } from "@/lib/api";
import { useApiQuery } from "@/lib/hooks";
import { formatDateTime, formatNumber, humanize } from "@/lib/format";
import type { InventoryLedgerRow, InventoryMovementDoc } from "@/lib/types";
import { Dialog } from "@/components/ui/dialog";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";

export function StockHistoryDialog({
  open,
  onClose,
  row,
}: {
  open: boolean;
  onClose: () => void;
  row: InventoryLedgerRow | null;
}) {
  return (
    <Dialog
      open={open && row !== null}
      onClose={onClose}
      title={row ? `Stock ledger — ${row.sku}` : "Stock ledger"}
      description={row ? `${row.productName} · ${row.packLabel}` : undefined}
      wide
    >
      {row ? <HistoryTable variantId={row.variantId} sku={row.sku} /> : null}
    </Dialog>
  );
}

function HistoryTable({ variantId, sku }: { variantId: string; sku: string }) {
  // Inner component mounts only while the dialog is open, so the query runs on demand.
  const { data, loading, error, reload } = useApiQuery<InventoryMovementDoc[]>(
    () => apiGet("/admin/inventory/movements", { variantId }),
    [variantId],
  );

  if (loading) return <TableSkeleton rows={5} cols={6} />;
  if (error) return <ErrorState message={error instanceof ApiError ? error.message : "Unexpected error"} onRetry={reload} />;
  if (!data || data.length === 0) {
    return (
      <EmptyState
        title="No movements yet"
        description={`No ledger events are recorded for ${sku}. Stock adjustments and order activity will appear here.`}
      />
    );
  }

  return (
    <Table>
      <THead>
        <TR>
          <TH scope="col">When (IST)</TH>
          <TH scope="col">Type</TH>
          <TH scope="col">Stock Δ</TH>
          <TH scope="col">Reserved Δ</TH>
          <TH scope="col">Resulting</TH>
          <TH scope="col">Reason</TH>
          <TH scope="col">By</TH>
        </TR>
      </THead>
      <TBody>
        {data.map((m) => (
          <TR key={m.id}>
            <TD className="whitespace-nowrap text-on-surface-variant">{formatDateTime(m.createdAt)}</TD>
            <TD>{humanize(m.type)}</TD>
            <TD
              className={
                m.qtyDelta > 0 ? "font-semibold text-secondary" : m.qtyDelta < 0 ? "font-semibold text-error" : undefined
              }
            >
              {m.qtyDelta > 0 ? "+" : ""}
              {formatNumber(m.qtyDelta)}
            </TD>
            <TD>{m.reservedDelta !== 0 ? `${m.reservedDelta > 0 ? "+" : ""}${m.reservedDelta}` : "—"}</TD>
            <TD className="whitespace-nowrap">
              <span className="font-semibold text-on-surface">{formatNumber(m.resultingStockOnHand)}</span>
              <span className="text-outline"> / {formatNumber(m.resultingReservedQty)}</span>
            </TD>
            <TD className="max-w-[18rem] truncate" title={m.reason}>
              {m.reason}
              {m.referenceId ? <span className="ml-1.5 font-mono text-[11px] text-outline">{m.referenceId}</span> : null}
            </TD>
            <TD className="text-on-surface-variant">{m.performedByName ?? m.performedByUid ?? "system"}</TD>
          </TR>
        ))}
      </TBody>
    </Table>
  );
}
