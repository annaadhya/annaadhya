/**
 * TeamService — staff administration. Public registration does NOT exist: staff records
 * are provisioned by the owner, with the initial owner created through a documented
 * bootstrap procedure guarded by ADMIN_SETUP_KEY. All role changes are audited.
 */
import { Inject, Injectable } from "@nestjs/common";
import { COLLECTIONS, type AdminUserDoc, type AdminRole, type AuthPrincipal, type TeamInviteDto } from "@annaadhya/contracts";
import { AppError, badRequest, conflict, notFound, type DataClient } from "@annaadhya/data-core";
import { DATA_CLIENT } from "../../data/data.module";
import { AuditService } from "../audit/audit.service";

@Injectable()
export class TeamService {
  constructor(
    @Inject(DATA_CLIENT) private readonly data: DataClient,
    private readonly audit: AuditService,
  ) {}

  /** One-time owner provisioning. Requires the ADMIN_SETUP_KEY env value; refuses if a real owner already exists. */
  async bootstrapOwner(input: { uid: string; displayName: string; email: string; setupKey: string }): Promise<AdminUserDoc> {
    if (!input.setupKey || input.setupKey !== process.env.ADMIN_SETUP_KEY) {
      throw new AppError("forbidden", "Invalid setup key", 403);
    }
    const owners = (
      await this.data.list<AdminUserDoc>(COLLECTIONS.adminUsers, {
        where: [{ field: "role", op: "==", value: "owner" }],
        limit: 5,
      })
    ).filter((o) => !o.isDemo); // demo seed data never blocks the real owner bootstrap
    if (owners.length > 0) {
      throw conflict("An owner already exists. Ask the owner to invite additional staff.");
    }
    const doc = await this.data.create<AdminUserDoc>(
      COLLECTIONS.adminUsers,
      {
        uid: input.uid,
        displayName: input.displayName,
        email: input.email,
        role: "owner",
        status: "active",
      } as object as AdminUserDoc,
      { id: `admin_${input.uid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28)}` },
    );
    await this.audit.record({
      actor: { uid: input.uid, role: "owner", displayName: input.displayName },
      action: "team.bootstrap_owner",
      targetType: "adminUser",
      targetId: doc.id,
      summary: `Initial owner provisioned (${input.email})`,
    });
    return doc;
  }

  async list(): Promise<AdminUserDoc[]> {
    return this.data.list<AdminUserDoc>(COLLECTIONS.adminUsers, {
      orderBy: [{ field: "createdAt", direction: "asc" }],
      limit: 200,
    });
  }

  async invite(dto: TeamInviteDto, actor: AuthPrincipal): Promise<AdminUserDoc> {
    const byUid = await this.data.list<AdminUserDoc>(COLLECTIONS.adminUsers, {
      where: [{ field: "uid", op: "==", value: dto.uid }],
      limit: 1,
    });
    if (byUid[0]) throw conflict("This user already has a staff record");
    const doc = await this.data.create<AdminUserDoc>(
      COLLECTIONS.adminUsers,
      {
        uid: dto.uid,
        displayName: dto.displayName,
        email: dto.email,
        role: dto.role,
        status: "active",
        invitedByUid: actor.uid,
      } as object as AdminUserDoc,
      { id: `admin_${dto.uid.replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 28)}` },
    );
    await this.audit.record({
      actor,
      action: "team.invite",
      targetType: "adminUser",
      targetId: doc.id,
      summary: `Invited ${dto.email} as ${dto.role}`,
    });
    return doc;
  }

  async updateRole(userId: string, role: AdminRole, actor: AuthPrincipal): Promise<AdminUserDoc> {
    const doc = await this.getStaff(userId);
    if (doc.role === "owner" && role !== "owner") {
      const owners = await this.data.list<AdminUserDoc>(COLLECTIONS.adminUsers, {
        where: [{ field: "role", op: "==", value: "owner" }],
      });
      if (owners.length <= 1) throw badRequest("Cannot demote the only owner");
    }
    if (actor.role === "owner" && actor.uid === doc.uid && role !== "owner") {
      throw badRequest("Owners cannot demote themselves");
    }
    await this.data.update(COLLECTIONS.adminUsers, userId, { role, updatedAt: Date.now() });
    await this.audit.record({
      actor,
      action: "team.role_change",
      targetType: "adminUser",
      targetId: userId,
      summary: `${doc.email}: ${doc.role} → ${role}`,
    });
    return this.getStaff(userId);
  }

  async updateStatus(userId: string, status: "active" | "suspended", actor: AuthPrincipal): Promise<AdminUserDoc> {
    const doc = await this.getStaff(userId);
    if (doc.uid === actor.uid && status === "suspended") {
      throw badRequest("You cannot suspend your own account");
    }
    if (doc.role === "owner" && status === "suspended") {
      const owners = await this.data.list<AdminUserDoc>(COLLECTIONS.adminUsers, {
        where: [{ field: "role", op: "==", value: "owner" }],
      });
      const activeOwners = owners.filter((o) => o.status === "active");
      if (activeOwners.length <= 1) throw badRequest("Cannot suspend the only active owner");
    }
    await this.data.update(COLLECTIONS.adminUsers, userId, { status, updatedAt: Date.now() });
    await this.audit.record({
      actor,
      action: "team.status_change",
      targetType: "adminUser",
      targetId: userId,
      summary: `${doc.email}: ${doc.status} → ${status}`,
    });
    return this.getStaff(userId);
  }

  private async getStaff(id: string): Promise<AdminUserDoc> {
    const doc = await this.data.get<AdminUserDoc>(COLLECTIONS.adminUsers, id);
    if (!doc) throw notFound("Staff member not found");
    return doc;
  }
}
