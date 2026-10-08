import { adminAuditLog, adminUsers, type DbTransaction } from "@gbam/db";
import { Injectable } from "@nestjs/common";
import { and, count, desc, eq, gte, lte, type SQL } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";

const PAGE_SIZE = 50;

export type AuditQuery = {
  adminId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
  batchId?: string;
  from?: Date;
  to?: Date;
  page: number;
};

export type AuditEntry = {
  /** Null only for things no admin did (e.g. a failed sign-in for an unknown email). */
  adminId: string | null;
  /** What happened, e.g. "shop.suspend" or "admin.sign_in". */
  action: string;
  targetType?: string;
  targetId?: string;
  note?: string | null;
  /** The changed fields before and after. Never passwords, codes or secrets. */
  before?: unknown;
  after?: unknown;
  ip?: string | null;
  /** Shared by every entry from one bulk action. */
  batchId?: string;
};

/**
 * The admin audit log: who did what, and when. There is deliberately no update or delete
 * here, so entries can be trusted.
 */
@Injectable()
export class AuditService {
  constructor(@InjectDb() private readonly db: Db) {}

  /**
   * Writes one entry. Pass the transaction (`tx`) when recording a change, so the change and
   * its entry are saved together: a change can never happen without being logged.
   */
  async record(entry: AuditEntry, tx?: DbTransaction): Promise<void> {
    let target: Db | DbTransaction = this.db;
    if (tx) {
      target = tx;
    }
    await target.insert(adminAuditLog).values({
      adminId: entry.adminId,
      action: entry.action,
      targetType: entry.targetType ?? null,
      targetId: entry.targetId ?? null,
      note: entry.note ?? null,
      before: entry.before ?? null,
      after: entry.after ?? null,
      ip: entry.ip ?? null,
      batchId: entry.batchId ?? null,
    });
  }

  /** Entries newest first, filtered. 50 a page. */
  async list(query: AuditQuery) {
    const conditions: SQL[] = [];
    if (query.adminId) {
      conditions.push(eq(adminAuditLog.adminId, query.adminId));
    }
    if (query.action) {
      conditions.push(eq(adminAuditLog.action, query.action));
    }
    if (query.targetType) {
      conditions.push(eq(adminAuditLog.targetType, query.targetType));
    }
    if (query.targetId) {
      conditions.push(eq(adminAuditLog.targetId, query.targetId));
    }
    if (query.batchId) {
      conditions.push(eq(adminAuditLog.batchId, query.batchId));
    }
    if (query.from) {
      conditions.push(gte(adminAuditLog.createdAt, query.from));
    }
    if (query.to) {
      conditions.push(lte(adminAuditLog.createdAt, query.to));
    }
    const where = and(...conditions);
    const rows = await this.db
      .select({
        id: adminAuditLog.id,
        adminId: adminAuditLog.adminId,
        adminName: adminUsers.name,
        action: adminAuditLog.action,
        targetType: adminAuditLog.targetType,
        targetId: adminAuditLog.targetId,
        note: adminAuditLog.note,
        before: adminAuditLog.before,
        after: adminAuditLog.after,
        ip: adminAuditLog.ip,
        batchId: adminAuditLog.batchId,
        createdAt: adminAuditLog.createdAt,
      })
      .from(adminAuditLog)
      .leftJoin(adminUsers, eq(adminUsers.id, adminAuditLog.adminId))
      .where(where)
      .orderBy(desc(adminAuditLog.createdAt))
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE);
    const totals = await this.db.select({ total: count() }).from(adminAuditLog).where(where);
    return { rows, total: totals[0]?.total ?? 0, page: query.page, pageSize: PAGE_SIZE };
  }
}
