import { adminInvites, adminRoles, adminSessions, adminUsers, type DbTransaction } from "@gbam/db";
import type { InviteAdminInput, RoleInput, UpdateAdminInput } from "@gbam/shared";
import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { and, asc, count, eq, gt, isNotNull, isNull, ne } from "drizzle-orm";
import { isUniqueViolation } from "../common/db-errors.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { AdminAuthService, type AdminContext } from "./admin-auth.service.js";
import { AuditService } from "./audit.service.js";

const BIN_DAYS = 30;

/** The admin team and their roles. Superadmin only (enforced by the controller). */
@Injectable()
export class TeamService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly auth: AdminAuthService,
    private readonly audit: AuditService,
  ) {}

  // ---- Admins ----

  /** Everyone on the team (removed admins too, marked), plus invites not yet accepted. */
  async list() {
    const admins = await this.db
      .select({
        id: adminUsers.id,
        name: adminUsers.name,
        email: adminUsers.email,
        isSuperadmin: adminUsers.isSuperadmin,
        roleId: adminUsers.roleId,
        roleName: adminRoles.name,
        lockedUntil: adminUsers.lockedUntil,
        removedAt: adminUsers.removedAt,
        createdAt: adminUsers.createdAt,
      })
      .from(adminUsers)
      .leftJoin(adminRoles, eq(adminRoles.id, adminUsers.roleId))
      .orderBy(asc(adminUsers.name));
    const invites = await this.db
      .select({
        id: adminInvites.id,
        name: adminInvites.name,
        email: adminInvites.email,
        isSuperadmin: adminInvites.isSuperadmin,
        roleId: adminInvites.roleId,
        expiresAt: adminInvites.expiresAt,
        createdAt: adminInvites.createdAt,
      })
      .from(adminInvites)
      .where(and(isNull(adminInvites.usedAt), gt(adminInvites.expiresAt, new Date())))
      .orderBy(asc(adminInvites.createdAt));
    return { admins, invites };
  }

  async invite(input: InviteAdminInput, actor: AdminContext, ip: string) {
    const { inviteId } = await this.auth.createInvite(input, actor.id);
    await this.audit.record({
      adminId: actor.id,
      action: "admin.invited",
      targetType: "admin_invite",
      targetId: inviteId,
      after: { email: input.email, roleId: input.roleId, isSuperadmin: input.isSuperadmin },
      ip,
    });
    return { inviteId };
  }

  /** A different role, or superadmin on/off, for someone else on the team. */
  async update(adminId: string, input: UpdateAdminInput, actor: AdminContext, ip: string) {
    if (adminId === actor.id) {
      throw new BadRequestException("You can't change your own role. Ask another superadmin.");
    }
    await this.db.transaction(async (tx) => {
      const target = await this.activeAdmin(tx, adminId);
      if (target.isSuperadmin && !input.isSuperadmin) {
        await this.assertAnotherSuperadmin(tx, adminId);
      }
      await tx
        .update(adminUsers)
        .set({ roleId: input.roleId, isSuperadmin: input.isSuperadmin })
        .where(eq(adminUsers.id, adminId));
      await this.audit.record(
        {
          adminId: actor.id,
          action: "admin.role_changed",
          targetType: "admin",
          targetId: adminId,
          before: { roleId: target.roleId, isSuperadmin: target.isSuperadmin },
          after: { roleId: input.roleId, isSuperadmin: input.isSuperadmin },
          ip,
        },
        tx,
      );
    });
    return { ok: true };
  }

  /** Signs them out and emails a new setup link (new password + authenticator). */
  async resetAuthenticator(adminId: string, actor: AdminContext, ip: string) {
    const target = await this.activeAdmin(this.db, adminId);
    await this.db.delete(adminSessions).where(eq(adminSessions.adminId, adminId));
    const { inviteId } = await this.auth.createInvite(
      {
        name: target.name,
        email: target.email,
        roleId: target.roleId,
        isSuperadmin: target.isSuperadmin,
      },
      actor.id,
      true,
    );
    await this.audit.record({
      adminId: actor.id,
      action: "admin.authenticator_reset",
      targetType: "admin",
      targetId: adminId,
      note: `Setup link sent (invite ${inviteId})`,
      ip,
    });
    return { ok: true };
  }

  /** They're signed out at once and can't sign in again. The row stays for the audit log. */
  async remove(adminId: string, actor: AdminContext, ip: string) {
    if (adminId === actor.id) {
      throw new BadRequestException("You can't remove yourself. Ask another superadmin.");
    }
    await this.db.transaction(async (tx) => {
      const target = await this.activeAdmin(tx, adminId);
      if (target.isSuperadmin) {
        await this.assertAnotherSuperadmin(tx, adminId);
      }
      await tx.update(adminUsers).set({ removedAt: new Date() }).where(eq(adminUsers.id, adminId));
      await tx.delete(adminSessions).where(eq(adminSessions.adminId, adminId));
      await this.audit.record(
        { adminId: actor.id, action: "admin.removed", targetType: "admin", targetId: adminId, ip },
        tx,
      );
    });
    return { ok: true };
  }

  private async activeAdmin(db: Db | DbTransaction, adminId: string) {
    const rows = await db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.id, adminId), isNull(adminUsers.removedAt)));
    const admin = rows[0];
    if (!admin) {
      throw new NotFoundException("Admin not found");
    }
    return admin;
  }

  /** There must always be a superadmin left, or nobody could manage the team any more. */
  private async assertAnotherSuperadmin(tx: DbTransaction, exceptAdminId: string) {
    const rows = await tx
      .select({ total: count() })
      .from(adminUsers)
      .where(
        and(
          eq(adminUsers.isSuperadmin, true),
          isNull(adminUsers.removedAt),
          ne(adminUsers.id, exceptAdminId),
        ),
      );
    const others = rows[0]?.total ?? 0;
    if (others === 0) {
      throw new BadRequestException(
        "This is the last superadmin. Make someone else superadmin first.",
      );
    }
  }

  // ---- Roles ----

  /** Roles with how many active admins have each. `deleted` lists the bin instead. */
  async roles(deleted: boolean) {
    let deletedCondition = isNull(adminRoles.deletedAt);
    if (deleted) {
      deletedCondition = isNotNull(adminRoles.deletedAt);
    }
    const rows = await this.db
      .select({
        id: adminRoles.id,
        name: adminRoles.name,
        permissions: adminRoles.permissions,
        deletedAt: adminRoles.deletedAt,
        adminCount: count(adminUsers.id),
      })
      .from(adminRoles)
      .leftJoin(adminUsers, and(eq(adminUsers.roleId, adminRoles.id), isNull(adminUsers.removedAt)))
      .where(deletedCondition)
      .groupBy(adminRoles.id)
      .orderBy(asc(adminRoles.name));
    return rows;
  }

  async createRole(input: RoleInput, actor: AdminContext, ip: string) {
    try {
      return await this.db.transaction(async (tx) => {
        const rows = await tx
          .insert(adminRoles)
          .values({ name: input.name, permissions: input.permissions })
          .returning({ id: adminRoles.id });
        const role = rows[0];
        if (!role) {
          throw new Error("Expected the database to return the role");
        }
        await this.audit.record(
          {
            adminId: actor.id,
            action: "role.created",
            targetType: "role",
            targetId: role.id,
            after: input,
            ip,
          },
          tx,
        );
        return { id: role.id };
      });
    } catch (error) {
      throw roleNameTaken(error);
    }
  }

  async updateRole(roleId: string, input: RoleInput, actor: AdminContext, ip: string) {
    try {
      await this.db.transaction(async (tx) => {
        const role = await this.liveRole(tx, roleId);
        await tx
          .update(adminRoles)
          .set({ name: input.name, permissions: input.permissions })
          .where(eq(adminRoles.id, roleId));
        await this.audit.record(
          {
            adminId: actor.id,
            action: "role.updated",
            targetType: "role",
            targetId: roleId,
            before: { name: role.name, permissions: role.permissions },
            after: input,
            ip,
          },
          tx,
        );
      });
    } catch (error) {
      throw roleNameTaken(error);
    }
    return { ok: true };
  }

  /** Moves a role to the bin. Refused while any active admin has it. */
  async deleteRole(roleId: string, actor: AdminContext, ip: string) {
    await this.db.transaction(async (tx) => {
      await this.liveRole(tx, roleId);
      const users = await tx
        .select({ total: count() })
        .from(adminUsers)
        .where(and(eq(adminUsers.roleId, roleId), isNull(adminUsers.removedAt)));
      if ((users[0]?.total ?? 0) > 0) {
        throw new ConflictException("Give these admins another role before deleting this one");
      }
      await tx.update(adminRoles).set({ deletedAt: new Date() }).where(eq(adminRoles.id, roleId));
      await this.audit.record(
        { adminId: actor.id, action: "role.deleted", targetType: "role", targetId: roleId, ip },
        tx,
      );
    });
    return { ok: true };
  }

  /** Takes a role out of the bin (within 30 days of deleting it). */
  async restoreRole(roleId: string, actor: AdminContext, ip: string) {
    const binStart = new Date(Date.now() - BIN_DAYS * 24 * 60 * 60 * 1000);
    await this.db.transaction(async (tx) => {
      const restored = await tx
        .update(adminRoles)
        .set({ deletedAt: null })
        .where(and(eq(adminRoles.id, roleId), gt(adminRoles.deletedAt, binStart)))
        .returning({ id: adminRoles.id });
      if (restored.length === 0) {
        throw new NotFoundException("That role isn't in the bin");
      }
      await this.audit.record(
        { adminId: actor.id, action: "role.restored", targetType: "role", targetId: roleId, ip },
        tx,
      );
    });
    return { ok: true };
  }

  private async liveRole(tx: DbTransaction, roleId: string) {
    const rows = await tx
      .select()
      .from(adminRoles)
      .where(and(eq(adminRoles.id, roleId), isNull(adminRoles.deletedAt)));
    const role = rows[0];
    if (!role) {
      throw new NotFoundException("Role not found");
    }
    return role;
  }
}

/** Two roles can't share a name. */
function roleNameTaken(error: unknown): unknown {
  if (isUniqueViolation(error, "admin_roles_name_unique")) {
    return new ConflictException({
      field: "name",
      message: "A role with that name already exists",
    });
  }
  return error;
}
