"use client";
/**
 * /audit — audit trail. GET /admin/audit?action=&actorUid=&limit= (audit:read).
 * Who did what, when — every admin mutation the API records lands here.
 */
import { useState } from "react";
import { apiGet } from "@/lib/api";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { formatDateTime, humanize } from "@/lib/format";
import type { AuditLogDoc } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";

export default function AuditPage() {
  usePageTitle("Audit log");
  const [actionInput, setActionInput] = useState("");
  const [action, setAction] = useState("");
  const [actorUid, setActorUid] = useState("");
  const [limit, setLimit] = useState(100);

  const { data, loading, error, reload } = useApiQuery<AuditLogDoc[]>(
    () => apiGet("/admin/audit", { action: action || undefined, actorUid: actorUid || undefined, limit }),
    [action, actorUid, limit],
  );

  return (
    <div>
      <PageHeader
        title="Audit log"
        description="Every admin mutation is recorded server-side — product changes, status changes, refunds, exports, settings."
      />

      <Card className="mb-6 p-4 sm:p-6">
        <form
          className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4"
          onSubmit={(e) => {
            e.preventDefault();
            setAction(actionInput.trim());
          }}
        >
          <Field label="Action contains" htmlFor="audit-action" hint='e.g. "order.status_change"'>
            <Input id="audit-action" value={actionInput} onChange={(e) => setActionInput(e.target.value)} placeholder="order." />
          </Field>
          <Field label="Actor UID" htmlFor="audit-actor">
            <Input id="audit-actor" value={actorUid} onChange={(e) => setActorUid(e.target.value)} placeholder="exact UID" />
          </Field>
          <Field label="Rows">
            <Select value={String(limit)} onChange={(e) => setLimit(Number(e.target.value))}>
              <option value="50">50</option>
              <option value="100">100</option>
              <option value="250">250</option>
              <option value="500">500</option>
            </Select>
          </Field>
          <div className="flex items-end gap-2">
            <Button type="submit">Filter</Button>
            <Button
              variant="outline"
              onClick={() => {
                setActionInput("");
                setAction("");
                setActorUid("");
                setLimit(100);
              }}
            >
              Clear
            </Button>
          </div>
        </form>
      </Card>

      <Card>
        {loading ? (
          <TableSkeleton rows={8} cols={4} />
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No audit entries" description="Try clearing the filters — entries appear as admins work." />
        ) : (
          <div className="scroll-slim max-h-[36rem] overflow-y-auto">
            <Table>
              <THead>
                <TR>
                  <TH scope="col">Time</TH>
                  <TH scope="col">Actor</TH>
                  <TH scope="col">Action</TH>
                  <TH scope="col">Summary</TH>
                </TR>
              </THead>
              <TBody>
                {data.map((entry) => (
                  <TR key={entry.id}>
                    <TD className="text-ink/60 whitespace-nowrap">{formatDateTime(entry.createdAt)}</TD>
                    <TD>
                      <p className="font-medium">{entry.actorName || entry.actorUid}</p>
                      <p className="text-xs text-ink/50">{humanize(entry.actorRole)}</p>
                    </TD>
                    <TD>
                      <span className="rounded bg-cream px-1.5 py-0.5 font-mono text-xs text-ink/80">{entry.action}</span>
                    </TD>
                    <TD className="max-w-[28rem] whitespace-normal" title={entry.summary}>
                      {entry.summary}
                      {entry.targetType && entry.targetId ? (
                        <span className="block text-xs text-ink/40">
                          {entry.targetType} · <span className="font-mono">{entry.targetId}</span>
                        </span>
                      ) : null}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          </div>
        )}
      </Card>
    </div>
  );
}
