import { announcementRecipients, announcements } from "@gbam/db";
import type { AnnouncementInput, Audience, SendAnnouncementInput } from "@gbam/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
} from "@nestjs/common";
import { and, count, desc, eq, isNotNull, isNull } from "drizzle-orm";
import { EmailQueue } from "../email/email.queue.js";
import { renderEmail } from "../email/templates.js";
import { ENV, type Env } from "../env.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { AnnouncementsQueue } from "../messaging/announcements.queue.js";
import { AudienceService } from "../messaging/audience.service.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AuditService } from "./audit.service.js";

/** How far ahead an announcement can be scheduled. */
const MAX_SCHEDULE_DAYS = 60;
const DAY_MS = 24 * 60 * 60 * 1000;

type AnnouncementRow = typeof announcements.$inferSelect;

/** An announcement as saved: the optional button is stored as null when there isn't one. */
function rowValues(input: AnnouncementInput) {
  let buttonLabel: string | null = null;
  let buttonUrl: string | null = null;
  if (input.buttonLabel && input.buttonUrl) {
    buttonLabel = input.buttonLabel;
    buttonUrl = input.buttonUrl;
  }
  return {
    subject: input.subject,
    body: input.body,
    buttonLabel,
    buttonUrl,
    audience: input.audience,
  };
}

/** Writing, previewing, testing, sending and scheduling email announcements to sellers. */
@Injectable()
export class AnnouncementsAdminService {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    private readonly audience: AudienceService,
    private readonly queue: AnnouncementsQueue,
    private readonly emails: EmailQueue,
    private readonly audit: AuditService,
  ) {}

  async list(bin: boolean) {
    let inBin = isNull(announcements.deletedAt);
    if (bin) {
      inBin = isNotNull(announcements.deletedAt);
    }
    return this.db
      .select({
        id: announcements.id,
        subject: announcements.subject,
        status: announcements.status,
        scheduledAt: announcements.scheduledAt,
        sentAt: announcements.sentAt,
        createdAt: announcements.createdAt,
      })
      .from(announcements)
      .where(inBin)
      .orderBy(desc(announcements.createdAt))
      .limit(100);
  }

  async detail(id: string) {
    const announcement = await this.find(id);
    const rows = await this.db
      .select({ status: announcementRecipients.status, total: count() })
      .from(announcementRecipients)
      .where(eq(announcementRecipients.announcementId, id))
      .groupBy(announcementRecipients.status);
    const counts = { queued: 0, sent: 0, failed: 0 };
    for (const row of rows) {
      counts[row.status] = row.total;
    }
    // Who it would go to right now (it's worked out again at the moment it's sent).
    const audienceCount = await this.audience.count(announcement.audience as Audience, true);
    return { announcement, counts, audienceCount };
  }

  async create(input: AnnouncementInput, admin: AdminContext, ip: string | null) {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .insert(announcements)
        .values({ ...rowValues(input), createdBy: admin.id })
        .returning({ id: announcements.id });
      const row = rows[0];
      if (!row) {
        throw new Error("Failed to save the announcement");
      }
      await this.audit.record(
        {
          adminId: admin.id,
          action: "announcement.create",
          targetType: "announcement",
          targetId: row.id,
          ip,
        },
        tx,
      );
      return row;
    });
  }

  /** Only drafts can change: once sent or scheduled, what people get is fixed. */
  async update(id: string, input: AnnouncementInput, admin: AdminContext, ip: string | null) {
    const announcement = await this.find(id);
    if (announcement.status !== "draft") {
      throw new ConflictException("Only drafts can be edited");
    }
    await this.db.transaction(async (tx) => {
      await tx.update(announcements).set(rowValues(input)).where(eq(announcements.id, id));
      await this.audit.record(
        {
          adminId: admin.id,
          action: "announcement.update",
          targetType: "announcement",
          targetId: id,
          ip,
        },
        tx,
      );
    });
    return { ok: true };
  }

  /** The email as a seller would see it, and how many sellers it would go to now. */
  async preview(input: AnnouncementInput) {
    const values = rowValues(input);
    const email = renderEmail({
      kind: "announcement",
      to: "preview@gbam.app",
      subject: values.subject,
      body: values.body,
      buttonLabel: values.buttonLabel,
      buttonUrl: values.buttonUrl,
      unsubscribeUrl: `${this.env.WEB_URL}/unsubscribe`,
      oneClickUrl: `${this.env.WEB_URL}/api/unsubscribe`,
    });
    const recipients = await this.audience.count(input.audience, true);
    return { subject: email.subject, html: email.html, recipients };
  }

  /** "Send a test to myself": only to the admin's own address, marked [Test]. */
  async sendTest(id: string, admin: AdminContext) {
    const announcement = await this.find(id);
    await this.emails.send(`announcement-test-${id}-${Date.now()}`, {
      kind: "announcement",
      to: admin.email,
      subject: announcement.subject,
      body: announcement.body,
      buttonLabel: announcement.buttonLabel,
      buttonUrl: announcement.buttonUrl,
      unsubscribeUrl: `${this.env.WEB_URL}/unsubscribe`,
      oneClickUrl: `${this.env.WEB_URL}/api/unsubscribe`,
      test: true,
    });
    return { ok: true };
  }

  /**
   * Send now, or schedule. The admin types how many sellers it goes to; if that's not the
   * number right now (someone signed up, unsubscribed...), it's refused so they look again.
   */
  async send(id: string, input: SendAnnouncementInput, admin: AdminContext, ip: string | null) {
    if (!this.env.UNSUBSCRIBE_SIGNING_KEY) {
      throw new ServiceUnavailableException(
        "Set UNSUBSCRIBE_SIGNING_KEY on the API before sending announcements",
      );
    }
    const announcement = await this.find(id);
    if (announcement.status !== "draft") {
      throw new ConflictException("This announcement has already been sent or scheduled");
    }
    const recipients = await this.audience.count(announcement.audience as Audience, true);
    if (input.confirmCount !== recipients) {
      throw new BadRequestException(
        `It goes to ${recipients} sellers now. Type ${recipients} to confirm.`,
      );
    }

    let at: Date | null = null;
    if (input.scheduledAt) {
      at = new Date(input.scheduledAt);
      if (at.getTime() <= Date.now()) {
        throw new BadRequestException("Pick a time in the future");
      }
      if (at.getTime() > Date.now() + MAX_SCHEDULE_DAYS * DAY_MS) {
        throw new BadRequestException(`Schedule it at most ${MAX_SCHEDULE_DAYS} days ahead`);
      }
    }

    let status: "scheduled" | "sending" = "sending";
    let action = "announcement.send";
    if (at !== null) {
      status = "scheduled";
      action = "announcement.schedule";
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(announcements)
        .set({ status, scheduledAt: at })
        .where(eq(announcements.id, id));
      await this.audit.record(
        {
          adminId: admin.id,
          action,
          targetType: "announcement",
          targetId: id,
          after: { recipients, scheduledAt: input.scheduledAt ?? null },
          ip,
        },
        tx,
      );
    });
    await this.queue.enqueue(id, at);
    return { ok: true, recipients };
  }

  /** Stops a scheduled announcement before it goes out. */
  async cancel(id: string, admin: AdminContext, ip: string | null) {
    const announcement = await this.find(id);
    if (announcement.status !== "scheduled") {
      throw new ConflictException("Only scheduled announcements can be cancelled");
    }
    await this.db.transaction(async (tx) => {
      await tx
        .update(announcements)
        .set({ status: "cancelled" })
        .where(and(eq(announcements.id, id), eq(announcements.status, "scheduled")));
      await this.audit.record(
        {
          adminId: admin.id,
          action: "announcement.cancel",
          targetType: "announcement",
          targetId: id,
          ip,
        },
        tx,
      );
    });
    await this.queue.cancel(id);
    return { ok: true };
  }

  /** Into the bin (kept 30 days). Not while it's sending. */
  async remove(id: string, admin: AdminContext, ip: string | null) {
    const announcement = await this.find(id);
    if (announcement.status === "sending" || announcement.status === "scheduled") {
      throw new ConflictException("Cancel it first, or wait until it has been sent");
    }
    await this.setBin(id, new Date(), "announcement.delete", admin, ip);
    return { ok: true };
  }

  async restore(id: string, admin: AdminContext, ip: string | null) {
    await this.findAny(id);
    await this.setBin(id, null, "announcement.restore", admin, ip);
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
      await tx.update(announcements).set({ deletedAt }).where(eq(announcements.id, id));
      await this.audit.record(
        { adminId: admin.id, action, targetType: "announcement", targetId: id, ip },
        tx,
      );
    });
  }

  /** An announcement that isn't in the bin, or 404. */
  private async find(id: string): Promise<AnnouncementRow> {
    const announcement = await this.findAny(id);
    if (announcement.deletedAt !== null) {
      throw new NotFoundException("No such announcement");
    }
    return announcement;
  }

  private async findAny(id: string): Promise<AnnouncementRow> {
    const rows = await this.db.select().from(announcements).where(eq(announcements.id, id));
    const announcement = rows[0];
    if (!announcement) {
      throw new NotFoundException("No such announcement");
    }
    return announcement;
  }
}
