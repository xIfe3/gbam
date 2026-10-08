import { contactMessages, orderIssues, orders, sellers } from "@gbam/db";
import { BadRequestException, Injectable } from "@nestjs/common";
import { and, desc, eq, ilike, isNotNull, isNull, or, type SQL } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { InjectDb, type Db } from "../infra/infra.module.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AuditService } from "./audit.service.js";
import type { BulkResult } from "./shops-admin.service.js";

/** Contact-form messages and customers' problem reports, in one inbox. */
@Injectable()
export class SupportAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audit: AuditService,
  ) {}

  async messages(status: "new" | "handled", q: string | undefined) {
    const conditions: SQL[] = [eq(contactMessages.status, status)];
    if (q && q.trim() !== "") {
      const pattern = `%${q.trim()}%`;
      const match = or(
        ilike(contactMessages.name, pattern),
        ilike(contactMessages.email, pattern),
        ilike(contactMessages.message, pattern),
      );
      if (match) {
        conditions.push(match);
      }
    }
    return this.db
      .select()
      .from(contactMessages)
      .where(and(...conditions))
      .orderBy(desc(contactMessages.createdAt))
      .limit(200);
  }

  async issues(status: "open" | "resolved") {
    let condition = isNull(orderIssues.resolvedAt);
    if (status === "resolved") {
      condition = isNotNull(orderIssues.resolvedAt);
    }
    return this.db
      .select({
        id: orderIssues.id,
        reason: orderIssues.reason,
        note: orderIssues.note,
        createdAt: orderIssues.createdAt,
        resolvedAt: orderIssues.resolvedAt,
        orderId: orders.id,
        orderCode: orders.code,
        shopName: sellers.businessName,
      })
      .from(orderIssues)
      .innerJoin(orders, eq(orders.id, orderIssues.orderId))
      .innerJoin(sellers, eq(sellers.id, orders.sellerId))
      .where(condition)
      .orderBy(desc(orderIssues.createdAt))
      .limit(200);
  }

  async handleMessage(messageId: string, note: string, actor: AdminContext, ip: string) {
    const result = await this.handleMessages([messageId], note, actor, ip, null);
    const skipped = result.skipped[0];
    if (skipped) {
      throw new BadRequestException(skipped.why);
    }
    return { ok: true };
  }

  async bulkHandleMessages(ids: string[], note: string, actor: AdminContext, ip: string) {
    return this.handleMessages(ids, note, actor, ip, randomUUID());
  }

  private async handleMessages(
    ids: string[],
    note: string,
    actor: AdminContext,
    ip: string,
    batchId: string | null,
  ): Promise<BulkResult> {
    const result: BulkResult = { done: [], skipped: [] };
    for (const messageId of ids) {
      const handled = await this.db.transaction(async (tx) => {
        // Only a "new" message changes, so a message is never handled twice.
        const updated = await tx
          .update(contactMessages)
          .set({ status: "handled", handledNote: note, handledAt: new Date() })
          .where(and(eq(contactMessages.id, messageId), eq(contactMessages.status, "new")))
          .returning({ id: contactMessages.id });
        if (updated.length === 0) {
          return false;
        }
        await this.audit.record(
          {
            adminId: actor.id,
            action: "support.message_handled",
            targetType: "contact_message",
            targetId: messageId,
            note,
            ip,
            batchId: batchId ?? undefined,
          },
          tx,
        );
        return true;
      });
      if (handled) {
        result.done.push(messageId);
      } else {
        result.skipped.push({ id: messageId, why: "Already handled, or not found" });
      }
    }
    return result;
  }

  async resolveIssue(issueId: string, note: string, actor: AdminContext, ip: string) {
    await this.db.transaction(async (tx) => {
      const updated = await tx
        .update(orderIssues)
        .set({ resolvedAt: new Date() })
        .where(and(eq(orderIssues.id, issueId), isNull(orderIssues.resolvedAt)))
        .returning({ id: orderIssues.id });
      if (updated.length === 0) {
        throw new BadRequestException("Already resolved, or not found");
      }
      await this.audit.record(
        {
          adminId: actor.id,
          action: "support.issue_resolved",
          targetType: "order_issue",
          targetId: issueId,
          note,
          ip,
        },
        tx,
      );
    });
    return { ok: true };
  }
}
