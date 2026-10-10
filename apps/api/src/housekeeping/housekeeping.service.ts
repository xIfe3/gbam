import {
  adminRoles,
  adminUsers,
  announcements,
  notificationCampaigns,
  supportTickets,
  ticketMessages,
} from "@gbam/db";
import { Injectable } from "@nestjs/common";
import { and, eq, isNotNull, isNull, lte, notExists } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";

const DAY_MS = 24 * 60 * 60 * 1000;
/** A solved ticket with no reply for this long is closed. */
const SOLVED_CLOSE_DAYS = 7;
/** Things in the bin are deleted for good after this long. */
const BIN_DAYS = 30;

const AUTO_CLOSE_MESSAGE =
  "This request was closed automatically: it was marked solved 7 days ago with no reply since. If you still need help, please open a new one.";

/** The daily tidy-up: close quiet solved tickets, empty the bin. */
@Injectable()
export class HousekeepingService {
  constructor(@InjectDb() private readonly db: Db) {}

  async run(now: Date) {
    const closed = await this.closeSolvedTickets(now);
    const ticketsPurged = await this.purgeTickets(now);
    const rolesPurged = await this.purgeRoles(now);
    const messagesPurged = await this.purgeMessaging(now);
    return { closed, ticketsPurged, rolesPurged, messagesPurged };
  }

  /**
   * Announcements and notification campaigns in the bin over 30 days. Their recipient rows
   * and the notifications in sellers' bells go with them (the database cascades the delete).
   */
  private async purgeMessaging(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - BIN_DAYS * DAY_MS);
    const goneAnnouncements = await this.db
      .delete(announcements)
      .where(and(isNotNull(announcements.deletedAt), lte(announcements.deletedAt, cutoff)))
      .returning({ id: announcements.id });
    const goneCampaigns = await this.db
      .delete(notificationCampaigns)
      .where(
        and(
          isNotNull(notificationCampaigns.deletedAt),
          lte(notificationCampaigns.deletedAt, cutoff),
        ),
      )
      .returning({ id: notificationCampaigns.id });
    return goneAnnouncements.length + goneCampaigns.length;
  }

  /**
   * Solved tickets nobody replied to for 7 days become closed. A reply re-opens a ticket and
   * clears solvedAt, so only truly quiet ones match. Running twice closes nothing twice: the
   * second time they're no longer "solved".
   */
  private async closeSolvedTickets(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - SOLVED_CLOSE_DAYS * DAY_MS);
    return this.db.transaction(async (tx) => {
      const closed = await tx
        .update(supportTickets)
        .set({ status: "closed", closedAt: now })
        .where(
          and(
            eq(supportTickets.status, "solved"),
            lte(supportTickets.solvedAt, cutoff),
            isNull(supportTickets.deletedAt),
          ),
        )
        .returning({ id: supportTickets.id });
      for (const ticket of closed) {
        await tx
          .insert(ticketMessages)
          .values({ ticketId: ticket.id, author: "system", body: AUTO_CLOSE_MESSAGE });
      }
      return closed.length;
    });
  }

  /** Tickets in the bin over 30 days are deleted for good (their messages go with them). */
  private async purgeTickets(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - BIN_DAYS * DAY_MS);
    const gone = await this.db
      .delete(supportTickets)
      .where(and(isNotNull(supportTickets.deletedAt), lte(supportTickets.deletedAt, cutoff)))
      .returning({ id: supportTickets.id });
    return gone.length;
  }

  /**
   * Roles in the bin over 30 days, unless an admin (even a removed one, whom the audit log
   * still names) still points at them. Those stay in the bin.
   */
  private async purgeRoles(now: Date): Promise<number> {
    const cutoff = new Date(now.getTime() - BIN_DAYS * DAY_MS);
    // "not exists (select ...)": no admin row refers to this role.
    const unused = notExists(
      this.db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.roleId, adminRoles.id)),
    );
    const gone = await this.db
      .delete(adminRoles)
      .where(and(isNotNull(adminRoles.deletedAt), lte(adminRoles.deletedAt, cutoff), unused))
      .returning({ id: adminRoles.id });
    return gone.length;
  }
}
