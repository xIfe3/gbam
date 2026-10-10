import { notificationCampaigns, sellerNotifications } from "@gbam/db";
import type { Audience, NotificationInput } from "@gbam/shared";
import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { AudienceService } from "../messaging/audience.service.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AuditService } from "./audit.service.js";

/** Rows are written in groups of this many (one insert with many rows is much faster). */
const INSERT_CHUNK = 500;

/** Admin-sent notifications ("campaigns") to the bell in many sellers' dashboards at once. */
@Injectable()
export class NotificationsAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    private readonly audience: AudienceService,
    private readonly audit: AuditService,
  ) {}

  async list(bin: boolean) {
    let inBin = isNull(notificationCampaigns.deletedAt);
    if (bin) {
      inBin = isNotNull(notificationCampaigns.deletedAt);
    }
    // A "subquery" counting how many sellers have opened (read) each one.
    const readCount = sql<number>`(select count(*)::int from ${sellerNotifications} where ${sellerNotifications.campaignId} = ${notificationCampaigns.id} and ${sellerNotifications.readAt} is not null)`;
    return this.db
      .select({
        id: notificationCampaigns.id,
        type: notificationCampaigns.type,
        title: notificationCampaigns.title,
        body: notificationCampaigns.body,
        link: notificationCampaigns.link,
        endsAt: notificationCampaigns.endsAt,
        recipientCount: notificationCampaigns.recipientCount,
        readCount,
        createdAt: notificationCampaigns.createdAt,
      })
      .from(notificationCampaigns)
      .where(inBin)
      .orderBy(desc(notificationCampaigns.createdAt))
      .limit(100);
  }

  /** How many sellers an audience means right now (for the "type the count" check). */
  async count(audience: Audience) {
    return { recipients: await this.audience.count(audience, false) };
  }

  /**
   * Sends one notification to every seller in the audience. The admin types the count; if
   * it's not the number right now, it's refused so they look again.
   */
  async create(input: NotificationInput, admin: AdminContext, ip: string | null) {
    const members = await this.audience.sellers(input.audience, false);
    if (input.confirmCount !== members.length) {
      throw new BadRequestException(
        `It goes to ${members.length} sellers now. Type ${members.length} to confirm.`,
      );
    }
    let endsAt: Date | null = null;
    if (input.endsAt) {
      endsAt = new Date(input.endsAt);
      if (endsAt.getTime() <= Date.now()) {
        throw new BadRequestException("The end date must be in the future");
      }
    }
    let link: string | null = null;
    if (input.link) {
      link = input.link;
    }

    // One transaction: the campaign and every seller's copy are saved together.
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(notificationCampaigns)
        .values({
          type: input.type,
          title: input.title,
          body: input.body,
          link,
          endsAt,
          audience: input.audience,
          recipientCount: members.length,
          createdBy: admin.id,
        })
        .returning({ id: notificationCampaigns.id });
      const campaign = rows[0];
      if (!campaign) {
        throw new Error("Failed to save the notification");
      }
      for (let start = 0; start < members.length; start = start + INSERT_CHUNK) {
        const chunk = members.slice(start, start + INSERT_CHUNK);
        const values = [];
        for (const member of chunk) {
          values.push({
            sellerId: member.sellerId,
            campaignId: campaign.id,
            type: input.type,
            title: input.title,
            body: input.body,
            link,
            endsAt,
          });
        }
        await tx.insert(sellerNotifications).values(values);
      }
      await this.audit.record(
        {
          adminId: admin.id,
          action: "notification.send",
          targetType: "notification",
          targetId: campaign.id,
          after: { title: input.title, recipients: members.length },
          ip,
        },
        tx,
      );
      return campaign;
    });
  }

  /** Into the bin: it disappears from every bell at once (restorable for 30 days). */
  async remove(id: string, admin: AdminContext, ip: string | null) {
    await this.setBin(id, new Date(), "notification.delete", admin, ip);
    return { ok: true };
  }

  async restore(id: string, admin: AdminContext, ip: string | null) {
    await this.setBin(id, null, "notification.restore", admin, ip);
    return { ok: true };
  }

  private async setBin(
    id: string,
    deletedAt: Date | null,
    action: string,
    admin: AdminContext,
    ip: string | null,
  ) {
    await this.db.transaction(async (tx) => {
      const changed = await tx
        .update(notificationCampaigns)
        .set({ deletedAt })
        .where(eq(notificationCampaigns.id, id))
        .returning({ id: notificationCampaigns.id });
      if (changed.length === 0) {
        throw new NotFoundException("No such notification");
      }
      await this.audit.record(
        { adminId: admin.id, action, targetType: "notification", targetId: id, ip },
        tx,
      );
    });
  }
}
