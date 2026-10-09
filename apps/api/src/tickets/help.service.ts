import { orderIssues, orders, sellers, supportTickets, users } from "@gbam/db";
import { ISSUE_REASON_LABEL, type NewTicketInput } from "@gbam/shared";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { and, desc, eq, isNull } from "drizzle-orm";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { TicketsService, type ThreadMessage } from "./tickets.service.js";

/** Replies on a public ticket link: plenty for a person, too few for a script. */
const PUBLIC_REPLIES_PER_HOUR = 10;

type TicketForRequester = {
  id: string;
  number: number;
  subject: string;
  status: string;
  createdAt: Date;
  messages: ThreadMessage[];
};

/**
 * What the person who asked sees: their messages and Gbam's replies, never internal notes,
 * and replies signed "Gbam support" rather than with the admin's name.
 */
function requesterMessages(messages: ThreadMessage[]): ThreadMessage[] {
  const visible: ThreadMessage[] = [];
  for (const message of messages) {
    if (message.internal) {
      continue;
    }
    visible.push({ ...message, adminName: null });
  }
  return visible;
}

/** The seller's Help pages and the public ticket link. Admins use TicketsAdminService. */
@Injectable()
export class HelpService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly tickets: TicketsService,
    private readonly limiter: RateLimiter,
  ) {}

  /** The shop's tickets, newest first (not the ones in the bin). */
  async listForSeller(sellerId: string) {
    return this.db
      .select({
        id: supportTickets.id,
        number: supportTickets.number,
        subject: supportTickets.subject,
        status: supportTickets.status,
        createdAt: supportTickets.createdAt,
        updatedAt: supportTickets.updatedAt,
      })
      .from(supportTickets)
      .where(and(eq(supportTickets.sellerId, sellerId), isNull(supportTickets.deletedAt)))
      .orderBy(desc(supportTickets.updatedAt));
  }

  /** A seller's "Get help" form. The order code, if given, must be one of their orders. */
  async openForSeller(sellerId: string, input: NewTicketInput) {
    let orderId: string | null = null;
    if (input.orderCode) {
      // Order codes repeat across shops, so look only in this shop.
      const found = await this.db
        .select({ id: orders.id })
        .from(orders)
        .where(and(eq(orders.code, input.orderCode), eq(orders.sellerId, sellerId)));
      const order = found[0];
      if (!order) {
        throw new BadRequestException({
          statusCode: 400,
          message: "There's no order with that code in your shop",
          field: "orderCode",
        });
      }
      orderId = order.id;
    }
    const requester = await this.requesterFor(sellerId);
    const ticket = await this.tickets.create({
      source: "seller",
      subject: input.subject,
      message: input.message,
      requesterName: requester.name,
      requesterEmail: requester.email,
      sellerId,
      orderId,
    });
    await this.tickets.announceNew(ticket.id);
    return ticket;
  }

  async viewForSeller(sellerId: string, ticketId: string): Promise<TicketForRequester> {
    const ticket = await this.sellerTicket(sellerId, ticketId);
    const messages = await this.tickets.thread(ticket.id, false);
    return {
      id: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.createdAt,
      messages: requesterMessages(messages),
    };
  }

  async replyForSeller(sellerId: string, ticketId: string, message: string) {
    const ticket = await this.sellerTicket(sellerId, ticketId);
    await this.tickets.replyAsRequester(ticket.id, message);
    return { ok: true };
  }

  /**
   * "Ask Gbam to help" on a customer's problem report. One ticket per problem: asking again
   * returns the same ticket instead of opening another.
   */
  async escalate(sellerId: string, orderId: string, issueId: string, message: string) {
    const rows = await this.db
      .select({
        issueId: orderIssues.id,
        reason: orderIssues.reason,
        note: orderIssues.note,
        orderId: orders.id,
        code: orders.code,
      })
      .from(orderIssues)
      .innerJoin(orders, eq(orders.id, orderIssues.orderId))
      .where(
        and(eq(orderIssues.id, issueId), eq(orders.id, orderId), eq(orders.sellerId, sellerId)),
      );
    const issue = rows[0];
    if (!issue) {
      throw new NotFoundException("No such problem report");
    }

    const existing = await this.db
      .select({ id: supportTickets.id, number: supportTickets.number })
      .from(supportTickets)
      .where(eq(supportTickets.orderIssueId, issue.issueId));
    const already = existing[0];
    if (already) {
      return already;
    }

    let customerNote = "(no note)";
    if (issue.note) {
      customerNote = issue.note;
    }
    const reason = ISSUE_REASON_LABEL[issue.reason];
    const firstMessage = [
      `The customer reported: ${reason}.`,
      `Their note: ${customerNote}`,
      ``,
      `The seller says: ${message}`,
    ].join("\n");

    const requester = await this.requesterFor(sellerId);
    const ticket = await this.tickets.create({
      source: "problem_report",
      subject: `Customer problem on ${issue.code}: ${reason}`,
      message: firstMessage,
      requesterName: requester.name,
      requesterEmail: requester.email,
      sellerId,
      orderId: issue.orderId,
      orderIssueId: issue.issueId,
    });
    await this.tickets.announceNew(ticket.id);
    return ticket;
  }

  /** The public ticket page (contact-form tickets): needs the key from the emailed link. */
  async viewPublic(ticketId: string, key: string | undefined): Promise<TicketForRequester> {
    const ticket = await this.publicTicket(ticketId, key);
    const messages = await this.tickets.thread(ticket.id, false);
    return {
      id: ticket.id,
      number: ticket.number,
      subject: ticket.subject,
      status: ticket.status,
      createdAt: ticket.createdAt,
      messages: requesterMessages(messages),
    };
  }

  async replyPublic(ip: string, ticketId: string, key: string | undefined, message: string) {
    const limit = await this.limiter.hit(`ticket-reply:${ip}`, PUBLIC_REPLIES_PER_HOUR, 60 * 60);
    if (!limit.allowed) {
      throw new TooManyRequestsError(limit.retryAfterSeconds);
    }
    const ticket = await this.publicTicket(ticketId, key);
    await this.tickets.replyAsRequester(ticket.id, message);
    return { ok: true };
  }

  /** The shop's name and the owner's email, saved on the ticket. */
  private async requesterFor(sellerId: string): Promise<{ name: string; email: string }> {
    const rows = await this.db
      .select({ name: sellers.businessName, email: users.email })
      .from(sellers)
      .innerJoin(users, eq(users.id, sellers.ownerUserId))
      .where(eq(sellers.id, sellerId));
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("No such shop");
    }
    return row;
  }

  /** The shop's own ticket, or 404 (also for another shop's: no hint that it exists). */
  private async sellerTicket(sellerId: string, ticketId: string) {
    const ticket = await this.tickets.find(ticketId);
    if (ticket.sellerId !== sellerId) {
      throw new NotFoundException("No such ticket");
    }
    return ticket;
  }

  private async publicTicket(ticketId: string, key: string | undefined) {
    if (!key) {
      throw new NotFoundException("No such ticket");
    }
    const rows = await this.db
      .select()
      .from(supportTickets)
      .where(
        and(
          eq(supportTickets.id, ticketId),
          eq(supportTickets.accessKey, key),
          isNull(supportTickets.deletedAt),
        ),
      );
    const ticket = rows[0];
    if (!ticket) {
      throw new NotFoundException("No such ticket");
    }
    return ticket;
  }
}
