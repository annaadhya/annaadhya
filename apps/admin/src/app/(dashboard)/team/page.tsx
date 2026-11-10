"use client";
/**
 * /team — staff administration. Owner-only actions (role/status changes) surface API
 * errors verbatim — e.g. "Cannot demote the only owner", "You cannot suspend your own
 * account" — so mistakes are understandable instead of silent.
 */
import { useState } from "react";
import { ApiError, apiGet, apiPost, can } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useApiQuery, usePageTitle } from "@/lib/hooks";
import { formatDate, humanize } from "@/lib/format";
import { useToast } from "@/lib/toast";
import type { AdminRole, AdminUserDoc } from "@/lib/types";
import { ADMIN_ROLES } from "@/lib/types";
import { PageHeader } from "@/components/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/form";
import { StatusBadge } from "@/components/ui/badge";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { EmptyState, ErrorState } from "@/components/ui/states";
import { Dialog } from "@/components/ui/dialog";

export default function TeamPage() {
  usePageTitle("Team");
  const { principal } = useAuth();
  const toast = useToast();
  const canWrite = can(principal, "team:write");

  const { data, loading, error, reload } = useApiQuery<AdminUserDoc[]>(() => apiGet("/admin/team"));

  const [inviteOpen, setInviteOpen] = useState(false);
  const [uid, setUid] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<AdminRole>("manager");
  const [inviting, setInviting] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function invite(e: React.FormEvent) {
    e.preventDefault();
    setInviteError(null);
    if (uid.trim().length < 6) return void setInviteError("UID must be at least 6 characters.");
    if (displayName.trim().length < 2) return void setInviteError("Display name must be at least 2 characters.");
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return void setInviteError("Enter a valid email.");
    setInviting(true);
    try {
      const doc = await apiPost<AdminUserDoc>("/admin/team", {
        uid: uid.trim(),
        displayName: displayName.trim(),
        email: email.trim(),
        role,
      });
      toast.success("Staff invited", `${doc.email} as ${humanize(doc.role)}`);
      setUid("");
      setDisplayName("");
      setEmail("");
      setRole("manager");
      setInviteOpen(false);
      reload();
    } catch (err) {
      setInviteError(err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(member: AdminUserDoc, nextRole: AdminRole) {
    setBusyId(member.id);
    try {
      await apiPost(`/admin/team/${member.id}/role`, { role: nextRole });
      toast.success("Role updated", `${member.email} → ${humanize(nextRole)}`);
      reload();
    } catch (err) {
      toast.error("Role change refused", err instanceof ApiError ? err.message : "Unexpected error");
      reload(); // snap the select back to the server state
    } finally {
      setBusyId(null);
    }
  }

  async function changeStatus(member: AdminUserDoc, status: "active" | "suspended") {
    setBusyId(member.id);
    try {
      await apiPost(`/admin/team/${member.id}/status`, { status });
      toast.success(status === "active" ? "Account activated" : "Account suspended", member.email);
      reload();
    } catch (err) {
      toast.error("Status change refused", err instanceof ApiError ? err.message : "Unexpected error");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div>
      <PageHeader
        title="Team"
        description="Staff records are provisioned here — there is no public registration. Roles decide API permissions."
        actions={canWrite ? <Button onClick={() => setInviteOpen(true)}>Invite staff</Button> : null}
      />

      <Card>
        <CardHeader title="Staff" subtitle={`${data?.length ?? 0} members`} />
        {loading ? (
          <TableSkeleton rows={4} cols={6} />
        ) : error ? (
          <ErrorState message={error.message} status={error.status} onRetry={reload} />
        ) : !data || data.length === 0 ? (
          <EmptyState title="No staff yet" description="The first owner is provisioned via the documented bootstrap procedure." />
        ) : (
          <div className="scroll-slim max-h-[32rem] overflow-y-auto">
            <Table>
              <THead>
                <TR>
                  <TH scope="col">Member</TH>
                  <TH scope="col">Role</TH>
                  <TH scope="col">Status</TH>
                  <TH scope="col">Invited</TH>
                  <TH scope="col">Last login</TH>
                  {canWrite ? <TH scope="col">Actions</TH> : null}
                </TR>
              </THead>
              <TBody>
                {data.map((m) => {
                  const isSelf = principal?.uid === m.uid;
                  return (
                    <TR key={m.id}>
                      <TD>
                        <p className="font-medium">
                          {m.displayName}
                          {isSelf ? <span className="ml-2 text-xs text-honey-dark">(you)</span> : null}
                          {m.isDemo ? <span className="ml-2 rounded bg-honey/15 px-1 py-0.5 text-[10px] font-semibold text-honey-dark">DEMO</span> : null}
                        </p>
                        <p className="text-xs text-ink/50">
                          {m.email} · <span className="font-mono">{m.uid}</span>
                        </p>
                      </TD>
                      <TD>
                        {canWrite ? (
                          <Select
                            value={m.role}
                            disabled={busyId === m.id}
                            onChange={(e) => void changeRole(m, e.target.value as AdminRole)}
                            className="h-9 w-40 text-xs"
                            aria-label={`Role for ${m.displayName}`}
                          >
                            {ADMIN_ROLES.map((r) => (
                              <option key={r} value={r}>
                                {humanize(r)}
                              </option>
                            ))}
                          </Select>
                        ) : (
                          humanize(m.role)
                        )}
                      </TD>
                      <TD>
                        <StatusBadge status={m.status} />
                      </TD>
                      <TD className="text-ink/60">{formatDate(m.createdAt)}</TD>
                      <TD className="text-ink/60">{m.lastLoginAt ? formatDate(m.lastLoginAt) : "—"}</TD>
                      {canWrite ? (
                        <TD>
                          {m.status === "active" ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-red-700 hover:bg-red-50"
                              disabled={busyId === m.id}
                              onClick={() => void changeStatus(m, "suspended")}
                            >
                              Suspend
                            </Button>
                          ) : (
                            <Button variant="ghost" size="sm" disabled={busyId === m.id} onClick={() => void changeStatus(m, "active")}>
                              Activate
                            </Button>
                          )}
                        </TD>
                      ) : null}
                    </TR>
                  );
                })}
              </TBody>
            </Table>
          </div>
        )}
      </Card>

      <Dialog
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite staff member"
        description="The UID must match the identity the person signs in with (Firebase UID; any stable UID in dev mode)."
      >
        <form className="space-y-3" onSubmit={invite} noValidate>
          <Field label="UID" required hint="At least 6 characters">
            <Input value={uid} onChange={(e) => setUid(e.target.value)} placeholder="firebase-uid-or-dev-uid" required />
          </Field>
          <Field label="Display name" required>
            <Input value={displayName} onChange={(e) => setDisplayName(e.target.value)} required />
          </Field>
          <Field label="Email" required>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </Field>
          <Field label="Role" required hint="owner = everything · manager = all except team/settings/audit · inventory, orders_support, reports are scoped">
            <Select value={role} onChange={(e) => setRole(e.target.value as AdminRole)}>
              {ADMIN_ROLES.map((r) => (
                <option key={r} value={r}>
                  {humanize(r)}
                </option>
              ))}
            </Select>
          </Field>
          {inviteError ? (
            <p role="alert" className="rounded-md border border-red-200 bg-red-50 p-2.5 text-sm text-red-800">
              {inviteError}
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button variant="ghost" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={inviting}>
              Send invite
            </Button>
          </div>
        </form>
      </Dialog>
    </div>
  );
}
