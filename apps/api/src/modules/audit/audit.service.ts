/** AuditLog writer — every sensitive action must produce an immutable audit record. */
import { Inject, Injectable } from "@nestjs/common";
import { COLLECTIONS, type AuditLogDoc, type AuthPrincipal } from "@annaadhya/contracts";
import { DATA_CLIENT } from "../../data/data.module";
import type { DataClient } from "@annaadhya/data-core";
import { newId } from "@annaadhya/utils";

@Injectable()
export class AuditService {
  constructor(@Inject(DATA_CLIENT) private readonly data: DataClient) {}

  async record(input: {
    actor: Pick<AuthPrincipal, "uid" | "role" | "displayName"> | { uid: string; role: "system"; displayName?: string };
    action: string;
    targetType?: string;
    targetId?: string;
    summary: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const doc: Omit<AuditLogDoc, "id" | "createdAt" | "updatedAt" | "isDemo"> = {
      actorUid: input.actor.uid,
      actorName: input.actor.displayName ?? "unknown",
      actorRole: input.actor.role,
      action: input.action,
      targetType: input.targetType,
      targetId: input.targetId,
      summary: input.summary,
      metadata: input.metadata,
    };
    await this.data.create(
      COLLECTIONS.auditLogs,
      doc as object,
      { id: newId("aud") },
    );
  }

  async list(opts: { limit?: number; action?: string; actorUid?: string } = {}) {
    const where = [];
    if (inputWhere(opts.action)) where.push({ field: "action", op: "==" as const, value: opts.action });
    if (inputWhere(opts.actorUid)) where.push({ field: "actorUid", op: "==" as const, value: opts.actorUid });
    return this.data.list<AuditLogDoc>(COLLECTIONS.auditLogs, {
      where,
      orderBy: [{ field: "createdAt", direction: "desc" }],
      limit: opts.limit ?? 100,
    });
  }
}

function inputWhere(v: string | undefined): v is string {
  return Boolean(v);
}
