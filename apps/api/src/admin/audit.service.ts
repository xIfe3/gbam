import { adminAuditLog, type DbTransaction } from "@gbam/db";
import { Injectable } from "@nestjs/common";
import { InjectDb, type Db } from "../infra/infra.module.js";

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
}
