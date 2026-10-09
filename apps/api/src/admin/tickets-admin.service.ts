import { adminUsers, orders, sellers, supportTickets, type DbTransaction } from "@gbam/db";
import type {
  TicketBulkInput,
  TicketPriority,
  TicketSource,
  TicketStatus,
  TicketUpdateInput,
} from "@gbam/shared";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { alias } from "drizzle-orm/pg-core";
import {
  and,
  asc,
  count,
  desc,
  eq,
  gte,
  ilike,
  isNotNull,
  isNull,
  lte,
  or,
  type SQL,
} from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { TicketsService } from "../tickets/tickets.service.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AuditService } from "./audit.service.js";
import { lagosEnd, lagosStart } from "./money-admin.service.js";
import type { BulkResult } from "./shops-admin.service.js";

const PAGE_SIZE = 50;

export type TicketListQuery = {
  q?: string;
  status?: TicketStatus;
  priority?: TicketPriority;
  source?: TicketSource;
  /** "me", "none" (nobody), or an admin's id. */
  assignee?: string;
  from?: string;
  to?: string;
  page: number;
  bin: boolean;
};

type TicketRow = typeof supportTickets.$inferSelect;
type Changes = { status?: TicketStatus; priority?: TicketPriority; assigneeId?: string | null };

/** The new values for a status change: solved and closed tickets remember when. */
function statusFields(status: TicketStatus) {
  if (status === "solved") {
    return { status, solvedAt: new Date(), closedAt: null };
  }
  if (status === "closed") {
    return { status, closedAt: new Date() };
  }
  return { status, solvedAt: null, closedAt: null };
}

/** The admin ticket screens: list, detail, changes, bulk actions and the bin. */
@Injectable()
export class TicketsAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly tickets: TicketsService,
    private readonly audit: AuditService,
  ) {}

  async list(query: TicketListQuery, me: AdminContext) {
    const conditions: SQL[] = [];
    if (query.bin) {
      conditions.push(isNotNull(supportTickets.deletedAt));
    } else {
      conditions.push(isNull(supportTickets.deletedAt));
    }
    if (query.q && query.q.trim() !== "") {
      const text = query.q.trim();
      // "#1042" or "1042" finds ticket 1042; anything else searches subject and requester.
      const numberText = text.replace(/^#/, "");
      if (/^\d{1,9}$/.test(numberText)) {
        conditions.push(eq(supportTickets.number, Number(numberText)));
      } else {
        const pattern = `%${text}%`;
        const match = or(
          ilike(supportTickets.subject, pattern),
          ilike(supportTickets.requesterName, pattern),
          ilike(supportTickets.requesterEmail, pattern),
        );
        if (match) {
          conditions.push(match);
        }
      }
    }
    if (query.status) {
      conditions.push(eq(supportTickets.status, query.status));
    }
    if (query.priority) {
      conditions.push(eq(supportTickets.priority, query.priority));
    }
    if (query.source) {
      conditions.push(eq(supportTickets.source, query.source));
    }
    if (query.assignee === "me") {
      conditions.push(eq(supportTickets.assigneeId, me.id));
    } else if (query.assignee === "none") {
      conditions.push(isNull(supportTickets.assigneeId));
    } else if (query.assignee) {
      conditions.push(eq(supportTickets.assigneeId, query.assignee));
    }
    if (query.from) {
      conditions.push(gte(supportTickets.createdAt, new Date(lagosStart(query.from))));
    }
    if (query.to) {
      conditions.push(lte(supportTickets.createdAt, new Date(lagosEnd(query.to))));
    }

    const where = and(...conditions);
    const rows = await this.db
      .select({
        id: supportTickets.id,
        number: supportTickets.number,
        subject: supportTickets.subject,
        status: supportTickets.status,
        priority: supportTickets.priority,
        source: supportTickets.source,
        requesterName: supportTickets.requesterName,
        shopName: sellers.businessName,
        assigneeName: adminUsers.name,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
      })
      .from(supportTickets)
      .leftJoin(sellers, eq(sellers.id, supportTickets.sellerId))
      .leftJoin(adminUsers, eq(adminUsers.id, supportTickets.assigneeId))
      .where(where)
      .orderBy(desc(supportTickets.updatedAt))
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE);
    const totals = await this.db.select({ total: count() }).from(supportTickets).where(where);
    return { rows, total: totals[0]?.total ?? 0, page: query.page, pageSize: PAGE_SIZE };
  }

  /** Everyone still on the team, by name: who a ticket can be assigned to. */
  async assignees() {
    return this.db
      .select({ id: adminUsers.id, name: adminUsers.name })
      .from(adminUsers)
      .where(isNull(adminUsers.removedAt))
      .orderBy(asc(adminUsers.name));
  }

  /** One ticket (also from the bin, so it can be restored), with notes. */
  async detail(ticketId: string) {
    // The assignee is an admin, so admin_users is joined under another name ("an alias").
    const assignee = alias(adminUsers, "assignee");
    const rows = await this.db
      .select({
        ticket: supportTickets,
        shop: { id: sellers.id, slug: sellers.slug, businessName: sellers.businessName },
        order: { id: orders.id, code: orders.code },
        assigneeName: assignee.name,
      })
      .from(supportTickets)
      .leftJoin(sellers, eq(sellers.id, supportTickets.sellerId))
      .leftJoin(orders, eq(orders.id, supportTickets.orderId))
      .leftJoin(assignee, eq(assignee.id, supportTickets.assigneeId))
      .where(eq(supportTickets.id, ticketId));
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("No such ticket");
    }
    // The access key is a secret for the requester's link; admins never need to see it.
    const { accessKey: _accessKey, ...ticket } = row.ticket;
    let shop = null;
    if (row.shop && row.shop.id) {
      shop = row.shop;
    }
    let order = null;
    if (row.order && row.order.id) {
      order = row.order;
    }
    const messages = await this.tickets.thread(ticketId, true);
    return { ticket, shop, order, assigneeName: row.assigneeName, messages };
  }

  reply(ticketId: string, admin: AdminContext, message: string, ip: string | null) {
    return this.tickets.replyAsAdmin(ticketId, admin, message, ip);
  }

  note(ticketId: string, admin: AdminContext, message: string, ip: string | null) {
    return this.tickets.addNote(ticketId, admin, message, ip);
  }

  /** Status, priority or assignee from the ticket page. */
  async update(
    ticketId: string,
    changes: TicketUpdateInput,
    admin: AdminContext,
    ip: string | null,
  ) {
    await this.checkAssignee(changes.assigneeId);
    const outcome = await this.db.transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, ticketId);
      if (ticket === null) {
        return "Ticket not found";
      }
      if (ticket.deletedAt !== null) {
        return "In the bin";
      }
      await this.apply(tx, ticket, changes, admin, ip, "ticket.update", null, null);
      return null;
    });
    if (outcome !== null) {
      throw new NotFoundException(outcome);
    }
    return { ok: true };
  }

  /** Up to 100 tickets at once. Each gets its own audit entry, sharing one batch id. */
  async bulk(input: TicketBulkInput, admin: AdminContext, ip: string | null): Promise<BulkResult> {
    if (input.action === "assign") {
      await this.checkAssignee(input.assigneeId);
    }
    const batchId = randomUUID();
    const result: BulkResult = { done: [], skipped: [] };
    for (const ticketId of input.ids) {
      const outcome = await this.db.transaction(async (tx) => {
        const ticket = await this.lockTicket(tx, ticketId);
        if (ticket === null) {
          return "Ticket not found";
        }
        if (ticket.deletedAt !== null) {
          return "In the bin";
        }
        if (input.action === "delete") {
          await this.setBin(tx, ticket, true, admin, ip, input.note, batchId);
          return null;
        }
        let changes: Changes = {};
        if (input.action === "assign") {
          changes = { assigneeId: input.assigneeId ?? null };
        } else if (input.action === "status" && input.status) {
          changes = { status: input.status };
        } else if (input.action === "priority" && input.priority) {
          changes = { priority: input.priority };
        } else if (input.action === "close") {
          if (ticket.status === "closed") {
            return "Already closed";
          }
          changes = { status: "closed" };
        }
        await this.apply(
          tx,
          ticket,
          changes,
          admin,
          ip,
          `ticket.${input.action}`,
          input.note,
          batchId,
        );
        return null;
      });
      if (outcome === null) {
        result.done.push(ticketId);
      } else {
        result.skipped.push({ id: ticketId, why: outcome });
      }
    }
    return result;
  }

  /** Into the bin (kept 30 days, then deleted for good by the daily job). */
  async remove(ticketId: string, reason: string, admin: AdminContext, ip: string | null) {
    await this.binChange(ticketId, true, reason, admin, ip);
  }

  async restore(ticketId: string, admin: AdminContext, ip: string | null) {
    await this.binChange(ticketId, false, null, admin, ip);
  }

  private async binChange(
    ticketId: string,
    toBin: boolean,
    note: string | null,
    admin: AdminContext,
    ip: string | null,
  ) {
    const outcome = await this.db.transaction(async (tx) => {
      const ticket = await this.lockTicket(tx, ticketId);
      if (ticket === null) {
        return "Ticket not found";
      }
      const inBin = ticket.deletedAt !== null;
      if (toBin && inBin) {
        return "Already in the bin";
      }
      if (!toBin && !inBin) {
        return "Not in the bin";
      }
      await this.setBin(tx, ticket, toBin, admin, ip, note, null);
      return null;
    });
    if (outcome === "Ticket not found") {
      throw new NotFoundException(outcome);
    }
    if (outcome !== null) {
      throw new BadRequestException(outcome);
    }
    return { ok: true };
  }

  /** Locks the ticket's row for this transaction, so two admins can't change it at once. */
  private async lockTicket(tx: DbTransaction, ticketId: string): Promise<TicketRow | null> {
    const rows = await tx
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .for("update");
    const ticket = rows[0];
    if (!ticket) {
      return null;
    }
    return ticket;
  }

  /** Tickets can only be assigned to admins who are still on the team. */
  private async checkAssignee(assigneeId: string | null | undefined) {
    if (assigneeId === undefined || assigneeId === null) {
      return;
    }
    const rows = await this.db
      .select({ id: adminUsers.id })
      .from(adminUsers)
      .where(and(eq(adminUsers.id, assigneeId), isNull(adminUsers.removedAt)));
    if (rows.length === 0) {
      throw new BadRequestException("That admin isn't on the team");
    }
  }

  private async apply(
    tx: DbTransaction,
    ticket: TicketRow,
    changes: Changes,
    admin: AdminContext,
    ip: string | null,
    action: string,
    note: string | null,
    batchId: string | null,
  ) {
    let fields: Record<string, unknown> = {};
    const before: Record<string, unknown> = {};
    const after: Record<string, unknown> = {};
    if (changes.status !== undefined) {
      fields = { ...fields, ...statusFields(changes.status) };
      before.status = ticket.status;
      after.status = changes.status;
    }
    if (changes.priority !== undefined) {
      fields.priority = changes.priority;
      before.priority = ticket.priority;
      after.priority = changes.priority;
    }
    if (changes.assigneeId !== undefined) {
      fields.assigneeId = changes.assigneeId;
      before.assigneeId = ticket.assigneeId;
      after.assigneeId = changes.assigneeId;
    }
    await tx.update(supportTickets).set(fields).where(eq(supportTickets.id, ticket.id));
    await this.audit.record(
      {
        adminId: admin.id,
        action,
        targetType: "ticket",
        targetId: ticket.id,
        note,
        before,
        after,
        ip,
        batchId: batchId ?? undefined,
      },
      tx,
    );
  }

  private async setBin(
    tx: DbTransaction,
    ticket: TicketRow,
    toBin: boolean,
    admin: AdminContext,
    ip: string | null,
    note: string | null,
    batchId: string | null,
  ) {
    let deletedAt: Date | null = null;
    let action = "ticket.restore";
    if (toBin) {
      deletedAt = new Date();
      action = "ticket.delete";
    }
    await tx.update(supportTickets).set({ deletedAt }).where(eq(supportTickets.id, ticket.id));
    await this.audit.record(
      {
        adminId: admin.id,
        action,
        targetType: "ticket",
        targetId: ticket.id,
        note,
        ip,
        batchId: batchId ?? undefined,
      },
      tx,
    );
  }
}
