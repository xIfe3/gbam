import { announcementRecipients, announcements } from "@gbam/db";
import { EmailError } from "@gbam/integrations";
import type { Audience } from "@gbam/shared";
import { Inject, Injectable } from "@nestjs/common";
import { and, eq } from "drizzle-orm";
import { setTimeout as wait } from "node:timers/promises";
import { renderEmail } from "../email/templates.js";
import { ENV, type Env } from "../env.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { InjectEmail, type EmailClient } from "../integrations/integrations.module.js";
import { AudienceService } from "./audience.service.js";
import { unsubscribeLinks } from "./unsubscribe.js";

/** Emails are sent one at a time with this pause between them, to stay under Resend's limit. */
const SEND_GAP_MS = 600;
/** Recipients loaded from the database at a time. */
const BATCH_SIZE = 50;

/**
 * Sends one announcement. Runs in the worker (see announcements.processor.ts) when its time
 * comes. Safe to run again after a crash: each recipient has a row, and only rows still
 * "queued" are sent, so nobody gets it twice.
 */
@Injectable()
export class AnnouncementSenderService {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(ENV) private readonly env: Env,
    @InjectEmail() private readonly email: EmailClient,
    private readonly audience: AudienceService,
  ) {}

  async run(announcementId: string): Promise<{ sent: number; failed: number }> {
    const rows = await this.db
      .select()
      .from(announcements)
      .where(eq(announcements.id, announcementId));
    const announcement = rows[0];
    // Cancelled, deleted, or already finished: nothing to do.
    if (
      !announcement ||
      announcement.deletedAt !== null ||
      (announcement.status !== "scheduled" && announcement.status !== "sending")
    ) {
      return { sent: 0, failed: 0 };
    }
    const signingKey = this.env.UNSUBSCRIBE_SIGNING_KEY;
    if (!signingKey) {
      // Thrown so the job fails and shows on the System page; nothing is sent without links.
      throw new Error("UNSUBSCRIBE_SIGNING_KEY is not set: announcements can't be sent");
    }

    await this.db
      .update(announcements)
      .set({ status: "sending" })
      .where(eq(announcements.id, announcementId));

    // Who it goes to is worked out now, at send time: someone who unsubscribed or was
    // suspended since it was scheduled is left out. "On conflict do nothing" skips sellers
    // who already have a row from an earlier, interrupted run.
    const members = await this.audience.sellers(announcement.audience as Audience, true);
    for (const member of members) {
      await this.db
        .insert(announcementRecipients)
        .values({ announcementId, sellerId: member.sellerId, email: member.email })
        .onConflictDoNothing();
    }

    let sent = 0;
    let failed = 0;
    let first = true;
    // Take the still-queued recipients 50 at a time until none are left.
    let batch = await this.queuedBatch(announcementId);
    while (batch.length > 0) {
      for (const recipient of batch) {
        if (!first) {
          await wait(SEND_GAP_MS);
        }
        first = false;
        const links = unsubscribeLinks(this.env.WEB_URL, recipient.sellerId, signingKey);
        const message = renderEmail({
          kind: "announcement",
          to: recipient.email,
          subject: announcement.subject,
          body: announcement.body,
          buttonLabel: announcement.buttonLabel,
          buttonUrl: announcement.buttonUrl,
          unsubscribeUrl: links.unsubscribeUrl,
          oneClickUrl: links.oneClickUrl,
        });
        const error = await this.trySend(message);
        if (error === null) {
          sent = sent + 1;
          await this.db
            .update(announcementRecipients)
            .set({ status: "sent", sentAt: new Date(), error: null })
            .where(eq(announcementRecipients.id, recipient.id));
        } else {
          failed = failed + 1;
          await this.db
            .update(announcementRecipients)
            .set({ status: "failed", error })
            .where(eq(announcementRecipients.id, recipient.id));
        }
      }
      batch = await this.queuedBatch(announcementId);
    }

    await this.db
      .update(announcements)
      .set({ status: "sent", sentAt: new Date() })
      .where(eq(announcements.id, announcementId));
    return { sent, failed };
  }

  /** Up to 50 recipients of this announcement that haven't been sent to yet. */
  private queuedBatch(announcementId: string) {
    return this.db
      .select()
      .from(announcementRecipients)
      .where(
        and(
          eq(announcementRecipients.announcementId, announcementId),
          eq(announcementRecipients.status, "queued"),
        ),
      )
      .limit(BATCH_SIZE);
  }

  /**
   * Sends one email. Returns null when it went, or the reason it didn't. When Resend says
   * "too many requests" (429) it waits a little and tries once more.
   */
  private async trySend(message: Parameters<EmailClient["send"]>[0]): Promise<string | null> {
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        await this.email.send(message);
        return null;
      } catch (error) {
        const tooFast = error instanceof EmailError && error.status === 429;
        if (tooFast && attempt === 1) {
          await wait(2_000);
          continue;
        }
        if (error instanceof Error) {
          return error.message.slice(0, 300);
        }
        return "Sending failed";
      }
    }
    return "Sending failed";
  }
}
