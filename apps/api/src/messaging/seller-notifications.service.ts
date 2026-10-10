import { notificationCampaigns, sellerNotifications, type DbTransaction } from "@gbam/db";
import type { NotificationType } from "@gbam/shared";
import { Injectable, NotFoundException } from "@nestjs/common";
import { and, count, desc, eq, gt, isNull, or, type SQL } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";

export type NewNotification = {
  type: NotificationType;
  title: string;
  body: string;
  /** A dashboard page it opens, like /dashboard/help/…; optional. */
  link?: string | null;
  /** Stop showing it after this time; optional. */
  endsAt?: Date | null;
};

/** How many the bell lists at most (newest first). */
const LIST_SIZE = 30;

/** The bell in the seller dashboard: Gbam's notifications to one shop. */
@Injectable()
export class SellerNotificationsService {
  constructor(@InjectDb() private readonly db: Db) {}

  /**
   * Puts a notification in a shop's bell. Used by Gbam itself (a ticket reply, the shop being
   * paused...). Pass `tx` to save it together with the change it's about.
   */
  async notify(sellerId: string, input: NewNotification, tx?: DbTransaction): Promise<void> {
    let target: Db | DbTransaction = this.db;
    if (tx) {
      target = tx;
    }
    await target.insert(sellerNotifications).values({
      sellerId,
      type: input.type,
      title: input.title,
      body: input.body,
      link: input.link ?? null,
      endsAt: input.endsAt ?? null,
    });
  }

  /**
   * What the bell shows: not ended, and not from a campaign an admin has put in the bin.
   * The campaign is joined in ("left join": notifications without one are kept too).
   */
  private visibleTo(sellerId: string): SQL[] {
    const notEnded = or(
      isNull(sellerNotifications.endsAt),
      gt(sellerNotifications.endsAt, new Date()),
    );
    const conditions: SQL[] = [
      eq(sellerNotifications.sellerId, sellerId),
      isNull(notificationCampaigns.deletedAt),
    ];
    if (notEnded) {
      conditions.push(notEnded);
    }
    return conditions;
  }

  async listFor(sellerId: string) {
    const items = await this.db
      .select({
        id: sellerNotifications.id,
        type: sellerNotifications.type,
        title: sellerNotifications.title,
        body: sellerNotifications.body,
        link: sellerNotifications.link,
        readAt: sellerNotifications.readAt,
        createdAt: sellerNotifications.createdAt,
      })
      .from(sellerNotifications)
      .leftJoin(notificationCampaigns, eq(notificationCampaigns.id, sellerNotifications.campaignId))
      .where(and(...this.visibleTo(sellerId)))
      .orderBy(desc(sellerNotifications.createdAt))
      .limit(LIST_SIZE);
    const unreadRows = await this.db
      .select({ total: count() })
      .from(sellerNotifications)
      .leftJoin(notificationCampaigns, eq(notificationCampaigns.id, sellerNotifications.campaignId))
      .where(and(...this.visibleTo(sellerId), isNull(sellerNotifications.readAt)));
    let unread = 0;
    const first = unreadRows[0];
    if (first) {
      unread = first.total;
    }
    return { unread, items };
  }

  /** Marks one read. Another shop's notification is "not found" (no hint that it exists). */
  async markRead(sellerId: string, notificationId: string) {
    const changed = await this.db
      .update(sellerNotifications)
      .set({ readAt: new Date() })
      .where(
        and(eq(sellerNotifications.id, notificationId), eq(sellerNotifications.sellerId, sellerId)),
      )
      .returning({ id: sellerNotifications.id });
    if (changed.length === 0) {
      throw new NotFoundException("No such notification");
    }
    return { ok: true };
  }

  async markAllRead(sellerId: string) {
    await this.db
      .update(sellerNotifications)
      .set({ readAt: new Date() })
      .where(and(eq(sellerNotifications.sellerId, sellerId), isNull(sellerNotifications.readAt)));
    return { ok: true };
  }
}
