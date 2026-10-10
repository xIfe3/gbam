import { adminUsers, supportTickets, ticketMessages, type DbTransaction } from "@gbam/db";
import type { TicketSource } from "@gbam/shared";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import { and, asc, eq, isNull } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { AuditService } from "../admin/audit.service.js";
import { EmailQueue } from "../email/email.queue.js";
import { ENV, type Env } from "../env.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { SellerNotificationsService } from "../messaging/seller-notifications.service.js";

export type NewTicket = {
  source: TicketSource;
  subject: string;
  /** The first message: what they asked. */
  message: string;
  requesterName: string;
  requesterEmail: string;
  sellerId?: string | null;
  orderId?: string | null;
  orderIssueId?: string | null;
  contactMessageId?: string | null;
};

/** The admin doing something, as far as tickets need to know. */
export type TicketAdmin = { id: string; name: string };

export type ThreadMessage = {
  id: string;
  author: "requester" | "admin" | "system";
  adminName: string | null;
  body: string;
  internal: boolean;
  createdAt: Date;
};

type TicketRow = typeof supportTickets.$inferSelect;

const SOURCE_LABELS: Record<TicketSource, string> = {
  contact: "the contact form",
  seller: "a seller",
  problem_report: "a customer problem",
};

/**
 * The one place tickets are created and talked on. Sellers, the contact form, the public
 * ticket page and the admin area all come through here, so the rules (who's told, what the
 * status becomes) are the same whoever replies.
 */
@Injectable()
export class TicketsService {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly emails: EmailQueue,
    private readonly audit: AuditService,
    private readonly notifications: SellerNotificationsService,
  ) {}

  /** The admin page for a ticket. */
  adminUrl(ticketId: string): string {
    return `${this.env.WEB_URL}/admin/tickets/${ticketId}`;
  }

  /**
   * Where the person who asked reads the thread: their dashboard for sellers, a private link
   * for contact-form tickets.
   */
  requesterUrl(ticket: { id: string; accessKey: string | null }): string {
    if (ticket.accessKey) {
      return `${this.env.WEB_URL}/help/tickets/${ticket.id}?k=${ticket.accessKey}`;
    }
    return `${this.env.WEB_URL}/dashboard/help/${ticket.id}`;
  }

  /**
   * Opens a ticket with its first message. Pass `tx` to save it together with something else
   * (the contact form's message). Call announceNew afterwards to tell the team.
   */
  async create(input: NewTicket, tx?: DbTransaction): Promise<{ id: string; number: number }> {
    let accessKey: string | null = null;
    if (input.source === "contact") {
      // Contact-form senders have no account, so their link carries a secret key instead.
      accessKey = randomBytes(32).toString("base64url");
    }

    // A transaction makes the ticket and its first message one change: both are saved, or
    // neither. Inside an outer transaction, the outer one decides.
    const save = async (target: DbTransaction) => {
      const rows = await target
        .insert(supportTickets)
        .values({
          subject: input.subject,
          source: input.source,
          requesterName: input.requesterName,
          requesterEmail: input.requesterEmail,
          sellerId: input.sellerId ?? null,
          orderId: input.orderId ?? null,
          orderIssueId: input.orderIssueId ?? null,
          contactMessageId: input.contactMessageId ?? null,
          accessKey,
        })
        .returning({ id: supportTickets.id, number: supportTickets.number });
      const ticket = rows[0];
      if (!ticket) {
        throw new Error("Failed to create the ticket");
      }
      await target
        .insert(ticketMessages)
        .values({ ticketId: ticket.id, author: "requester", body: input.message });
      return ticket;
    };

    if (tx) {
      return save(tx);
    }
    return this.db.transaction(save);
  }

  /** Emails the support inbox about a new ticket (contact-form tickets have their own email). */
  async announceNew(ticketId: string): Promise<void> {
    const ticket = await this.find(ticketId);
    if (ticket.source === "contact") {
      return;
    }
    await this.emails.send(`ticket-new-${ticket.id}`, {
      kind: "ticket_new",
      number: ticket.number,
      subject: ticket.subject,
      requesterName: ticket.requesterName,
      sourceLabel: SOURCE_LABELS[ticket.source],
      adminUrl: this.adminUrl(ticket.id),
    });
  }

  /**
   * The person who asked wrote back. It re-opens a ticket that was waiting on them or marked
   * solved, and tells the admin it's assigned to. Closed tickets take no more replies.
   */
  async replyAsRequester(ticketId: string, body: string): Promise<void> {
    const ticket = await this.find(ticketId);
    if (ticket.status === "closed") {
      throw new ConflictException(
        "This request is closed. If you still need help, please open a new one.",
      );
    }
    const messageId = await this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(ticketMessages)
        .values({ ticketId, author: "requester", body })
        .returning({ id: ticketMessages.id });
      const message = rows[0];
      if (!message) {
        throw new Error("Failed to save the reply");
      }
      await tx
        .update(supportTickets)
        .set({ status: "open", solvedAt: null })
        .where(eq(supportTickets.id, ticketId));
      return message.id;
    });

    if (ticket.assigneeId) {
      const assignees = await this.db
        .select({ email: adminUsers.email })
        .from(adminUsers)
        .where(and(eq(adminUsers.id, ticket.assigneeId), isNull(adminUsers.removedAt)));
      const assignee = assignees[0];
      if (assignee) {
        await this.emails.send(`ticket-replied-${messageId}`, {
          kind: "ticket_requester_replied",
          to: assignee.email,
          number: ticket.number,
          subject: ticket.subject,
          adminUrl: this.adminUrl(ticket.id),
        });
      }
    }
  }

  /**
   * An admin replied. The person who asked gets it by email with a link to the thread, and
   * the ticket is now waiting on them.
   */
  async replyAsAdmin(
    ticketId: string,
    admin: TicketAdmin,
    body: string,
    ip: string | null,
  ): Promise<void> {
    const ticket = await this.find(ticketId);
    const messageId = await this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(ticketMessages)
        .values({ ticketId, author: "admin", adminId: admin.id, body })
        .returning({ id: ticketMessages.id });
      const message = rows[0];
      if (!message) {
        throw new Error("Failed to save the reply");
      }
      await tx
        .update(supportTickets)
        .set({ status: "waiting", solvedAt: null, closedAt: null })
        .where(eq(supportTickets.id, ticketId));
      await this.audit.record(
        { adminId: admin.id, action: "ticket.reply", targetType: "ticket", targetId: ticketId, ip },
        tx,
      );
      // Sellers also see it in their dashboard bell (contact-form senders only get the email).
      if (ticket.sellerId) {
        await this.notifications.notify(
          ticket.sellerId,
          {
            type: "info",
            title: "Gbam replied to your request",
            body: `#${ticket.number}: ${ticket.subject}`,
            link: `/dashboard/help/${ticket.id}`,
          },
          tx,
        );
      }
      return message.id;
    });

    await this.emails.send(`ticket-reply-${messageId}`, {
      kind: "ticket_reply",
      to: ticket.requesterEmail,
      name: ticket.requesterName,
      number: ticket.number,
      subject: ticket.subject,
      message: body,
      link: this.requesterUrl(ticket),
    });
  }

  /** An internal note: for admins only, never emailed, doesn't change the status. */
  async addNote(
    ticketId: string,
    admin: TicketAdmin,
    body: string,
    ip: string | null,
  ): Promise<void> {
    await this.find(ticketId);
    await this.db.transaction(async (tx) => {
      await tx
        .insert(ticketMessages)
        .values({ ticketId, author: "admin", adminId: admin.id, body, internal: true });
      await this.audit.record(
        { adminId: admin.id, action: "ticket.note", targetType: "ticket", targetId: ticketId, ip },
        tx,
      );
    });
  }

  /** The conversation, oldest first. Notes only when `includeNotes` (admins). */
  async thread(ticketId: string, includeNotes: boolean): Promise<ThreadMessage[]> {
    const rows = await this.db
      .select({
        id: ticketMessages.id,
        author: ticketMessages.author,
        adminName: adminUsers.name,
        body: ticketMessages.body,
        internal: ticketMessages.internal,
        createdAt: ticketMessages.createdAt,
      })
      .from(ticketMessages)
      .leftJoin(adminUsers, eq(adminUsers.id, ticketMessages.adminId))
      .where(eq(ticketMessages.ticketId, ticketId))
      .orderBy(asc(ticketMessages.createdAt));
    const messages: ThreadMessage[] = [];
    for (const row of rows) {
      if (row.internal && !includeNotes) {
        continue;
      }
      messages.push(row);
    }
    return messages;
  }

  /** A ticket that isn't in the bin, or 404. */
  async find(ticketId: string): Promise<TicketRow> {
    const rows = await this.db
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.id, ticketId), isNull(supportTickets.deletedAt)));
    const ticket = rows[0];
    if (!ticket) {
      throw new NotFoundException("No such ticket");
    }
    return ticket;
  }
}
