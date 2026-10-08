import { adminRoles, adminSessions, adminUsers, sellers, sessions, users } from "@gbam/db";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, gt, ilike, or, type SQL } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AuditService } from "./audit.service.js";

/** Who is signed in right now, admins and sellers, and ending their sessions. Superadmin only. */
@Injectable()
export class SessionsAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async adminSessions(actor: AdminContext) {
    const rows = await this.db
      .select({
        id: adminSessions.id,
        adminId: adminUsers.id,
        adminName: adminUsers.name,
        roleName: adminRoles.name,
        isSuperadmin: adminUsers.isSuperadmin,
        userAgent: adminSessions.userAgent,
        ip: adminSessions.ip,
        createdAt: adminSessions.createdAt,
        lastUsedAt: adminSessions.lastUsedAt,
      })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminId))
      .leftJoin(adminRoles, eq(adminRoles.id, adminUsers.roleId))
      .where(gt(adminSessions.expiresAt, new Date()))
      .orderBy(desc(adminSessions.lastUsedAt));
    const result = [];
    for (const row of rows) {
      // The session making this request: shown as "This device" and can't be ended here.
      result.push({ ...row, isCurrent: row.id === actor.sessionId });
    }
    return result;
  }

  /** Sellers signed in now. `q` searches shop name, shop link or email. At most 200 rows. */
  async sellerSessions(q: string | undefined) {
    const conditions: SQL[] = [gt(sessions.expiresAt, new Date())];
    if (q && q.trim() !== "") {
      const pattern = `%${q.trim()}%`;
      const match = or(
        ilike(sellers.businessName, pattern),
        ilike(sellers.slug, pattern),
        ilike(users.email, pattern),
      );
      if (match) {
        conditions.push(match);
      }
    }
    return this.db
      .select({
        id: sessions.id,
        shopName: sellers.businessName,
        slug: sellers.slug,
        email: users.email,
        userAgent: sessions.userAgent,
        ip: sessions.ip,
        createdAt: sessions.createdAt,
        lastUsedAt: sessions.lastUsedAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .innerJoin(sellers, eq(sellers.ownerUserId, users.id))
      .where(and(...conditions))
      .orderBy(desc(sessions.lastUsedAt))
      .limit(200);
  }

  async endAdminSession(sessionId: string, actor: AdminContext, ip: string) {
    if (sessionId === actor.sessionId) {
      throw new BadRequestException("That's this device. Use Sign out instead.");
    }
    const ended = await this.db
      .delete(adminSessions)
      .where(eq(adminSessions.id, sessionId))
      .returning({ adminId: adminSessions.adminId });
    const row = ended[0];
    if (!row) {
      throw new NotFoundException("Session not found");
    }
    await this.audit.record({
      adminId: actor.id,
      action: "admin.session_ended",
      targetType: "admin",
      targetId: row.adminId,
      ip,
    });
    return { ok: true };
  }

  /** "Sign out everywhere" for one admin (e.g. a lost laptop). Not for yourself. */
  async endAllForAdmin(adminId: string, actor: AdminContext, ip: string) {
    if (adminId === actor.id) {
      throw new BadRequestException("To sign yourself out everywhere, ask another superadmin.");
    }
    await this.db.delete(adminSessions).where(eq(adminSessions.adminId, adminId));
    await this.audit.record({
      adminId: actor.id,
      action: "admin.sessions_ended",
      targetType: "admin",
      targetId: adminId,
      ip,
    });
    return { ok: true };
  }

  /** Signs a seller out of one device; the reason goes in the audit log. */
  async endSellerSession(sessionId: string, reason: string, actor: AdminContext, ip: string) {
    const ended = await this.db
      .delete(sessions)
      .where(eq(sessions.id, sessionId))
      .returning({ userId: sessions.userId });
    const row = ended[0];
    if (!row) {
      throw new NotFoundException("Session not found");
    }
    await this.audit.record({
      adminId: actor.id,
      action: "seller.session_ended",
      targetType: "user",
      targetId: row.userId,
      note: reason,
      ip,
    });
    return { ok: true };
  }
}
