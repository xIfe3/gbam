import { notificationCampaigns, sellerNotifications, type DbTransaction } from "@gbam/db";
import type { NotificationType } from "@gbam/shared";
import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  and,
  count,
  desc,
  eq,
  gt,
  ilike,
  inArray,
  isNotNull,
  isNull,
  or,
  type SQL,
} from "drizzle-orm";
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
/** How many the notifications page shows at a time. */
const PAGE_SIZE = 30;

export type NotificationPageQuery = {
  tab: "all" | "unread" | "trash";
  type?: NotificationType;
  q?: string;
  page: number;
};

export type NotificationBulkAction = "read" | "unread" | "trash" | "restore";

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
  private visibleTo(sellerId: string, inTrash = false): SQL[] {
    const conditions = this.stillShown(sellerId);
    // The trash is its own list; everywhere else it's left out.
    if (inTrash) {
      conditions.push(isNotNull(sellerNotifications.deletedAt));
    } else {
      conditions.push(isNull(sellerNotifications.deletedAt));
    }
    return conditions;
  }

  /**
   * The shop's own, not ended, and not from a campaign Gbam moved to its bin: true in or
   * out of the trash. (Queries using it join notificationCampaigns.)
   */
  private stillShown(sellerId: string): SQL[] {
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

  /** The notifications page: All, Unread or Trash, by type, by words, 30 at a time. */
  async page(sellerId: string, query: NotificationPageQuery) {
    const conditions = this.visibleTo(sellerId, query.tab === "trash");
    if (query.tab === "unread") {
      conditions.push(isNull(sellerNotifications.readAt));
    }
    if (query.type) {
      conditions.push(eq(sellerNotifications.type, query.type));
    }
    if (query.q && query.q.trim() !== "") {
      const pattern = `%${query.q.trim()}%`;
      const match = or(
        ilike(sellerNotifications.title, pattern),
        ilike(sellerNotifications.body, pattern),
      );
      if (match) {
        conditions.push(match);
      }
    }
    const rows = await this.db
      .select({
        id: sellerNotifications.id,
        type: sellerNotifications.type,
        title: sellerNotifications.title,
        body: sellerNotifications.body,
        link: sellerNotifications.link,
        readAt: sellerNotifications.readAt,
        deletedAt: sellerNotifications.deletedAt,
        createdAt: sellerNotifications.createdAt,
      })
      .from(sellerNotifications)
      .leftJoin(notificationCampaigns, eq(notificationCampaigns.id, sellerNotifications.campaignId))
      .where(and(...conditions))
      .orderBy(desc(sellerNotifications.createdAt))
      .limit(PAGE_SIZE)
      .offset((query.page - 1) * PAGE_SIZE);
    const totals = await this.db
      .select({ total: count() })
      .from(sellerNotifications)
      .leftJoin(notificationCampaigns, eq(notificationCampaigns.id, sellerNotifications.campaignId))
      .where(and(...conditions));
    const bell = await this.listFor(sellerId);
    let total = 0;
    const first = totals[0];
    if (first) {
      total = first.total;
    }
    return { rows, total, page: query.page, pageSize: PAGE_SIZE, unread: bell.unread };
  }

  /**
   * One notification (also from the trash). Another shop's, an ended one, or one from a
   * binned campaign is "not found", the same as on the list.
   */
  async one(sellerId: string, notificationId: string) {
    const conditions = this.stillShown(sellerId);
    conditions.push(eq(sellerNotifications.id, notificationId));
    const rows = await this.db
      .select({
        id: sellerNotifications.id,
        type: sellerNotifications.type,
        title: sellerNotifications.title,
        body: sellerNotifications.body,
        link: sellerNotifications.link,
        readAt: sellerNotifications.readAt,
        deletedAt: sellerNotifications.deletedAt,
        createdAt: sellerNotifications.createdAt,
      })
      .from(sellerNotifications)
      .leftJoin(notificationCampaigns, eq(notificationCampaigns.id, sellerNotifications.campaignId))
      .where(and(...conditions));
    const row = rows[0];
    if (!row) {
      throw new NotFoundException("No such notification");
    }
    return row;
  }

  async markUnread(sellerId: string, notificationId: string) {
    await this.setFields(sellerId, [notificationId], { readAt: null }, true);
    return { ok: true };
  }

  async trash(sellerId: string, notificationId: string) {
    await this.setFields(sellerId, [notificationId], { deletedAt: new Date() }, true);
    return { ok: true };
  }

  async restore(sellerId: string, notificationId: string) {
    await this.setFields(sellerId, [notificationId], { deletedAt: null }, true);
    return { ok: true };
  }

  /** Deletes one for good. Only from the trash, so nothing disappears in one tap. */
  async deleteForever(sellerId: string, notificationId: string) {
    const row = await this.one(sellerId, notificationId);
    if (row.deletedAt === null) {
      throw new ConflictException("Move it to the trash first");
    }
    await this.db.delete(sellerNotifications).where(eq(sellerNotifications.id, row.id));
    return { ok: true };
  }

  async emptyTrash(sellerId: string) {
    await this.db
      .delete(sellerNotifications)
      .where(
        and(eq(sellerNotifications.sellerId, sellerId), isNotNull(sellerNotifications.deletedAt)),
      );
    return { ok: true };
  }

  /** Several at once. Ids that aren't this shop's are simply not changed. */
  async bulk(sellerId: string, ids: string[], action: NotificationBulkAction) {
    let fields: { readAt?: Date | null; deletedAt?: Date | null } = {};
    if (action === "read") {
      fields = { readAt: new Date() };
    } else if (action === "unread") {
      fields = { readAt: null };
    } else if (action === "trash") {
      fields = { deletedAt: new Date() };
    } else {
      fields = { deletedAt: null };
    }
    const changed = await this.setFields(sellerId, ids, fields, false);
    return { changed };
  }

  /** Updates the shop's own notifications among `ids`; how many changed. */
  private async setFields(
    sellerId: string,
    ids: string[],
    fields: { readAt?: Date | null; deletedAt?: Date | null },
    mustExist: boolean,
  ): Promise<number> {
    const changed = await this.db
      .update(sellerNotifications)
      .set(fields)
      .where(and(inArray(sellerNotifications.id, ids), eq(sellerNotifications.sellerId, sellerId)))
      .returning({ id: sellerNotifications.id });
    if (mustExist && changed.length === 0) {
      throw new NotFoundException("No such notification");
    }
    return changed.length;
  }
}
