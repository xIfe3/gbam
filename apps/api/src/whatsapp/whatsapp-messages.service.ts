import { whatsappMessages } from "@gbam/db";
import type { WhatsAppStatusUpdate } from "@gbam/integrations";
import { Injectable, Logger } from "@nestjs/common";
import { and, eq, inArray } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";

type MessageStatus = "accepted" | "sent" | "delivered" | "read" | "failed";

/**
 * Keeps the whatsapp_messages table up to date: one row per message we send, updated
 * by the WhatsApp webhook as Meta reports sent → delivered → read (or failed).
 */
@Injectable()
export class WhatsAppMessagesService {
  private readonly logger = new Logger(WhatsAppMessagesService.name);

  constructor(@InjectDb() private readonly db: Db) {}

  /** Meta accepted our send request. Webhook updates will follow. */
  async recordAccepted(params: {
    orderId: string;
    wamid: string;
    template: string;
    toPhone: string;
  }) {
    await this.db.insert(whatsappMessages).values({
      orderId: params.orderId,
      wamid: params.wamid,
      template: params.template,
      toPhone: params.toPhone,
      status: "accepted",
    });
  }

  /** Meta rejected the send outright (so there's no wamid). */
  async recordRejected(params: {
    orderId: string;
    template: string;
    toPhone: string;
    errorCode: number | null;
    errorMessage: string;
  }) {
    await this.db.insert(whatsappMessages).values({
      orderId: params.orderId,
      template: params.template,
      toPhone: params.toPhone,
      status: "failed",
      errorCode: params.errorCode,
      errorMessage: params.errorMessage,
    });
  }

  /**
   * Applies one status update from the webhook.
   *
   * Meta can deliver webhooks out of order (e.g. "read" before "delivered"), so a status
   * may only move FORWARD: accepted → sent → delivered → read. "failed" can replace any
   * of those. We enforce this in the UPDATE's WHERE clause: the row only changes if its
   * current status is one that the new status is allowed to replace.
   */
  async applyStatusUpdate(update: WhatsAppStatusUpdate) {
    let replaceable: MessageStatus[];
    if (update.status === "failed") {
      replaceable = ["accepted", "sent", "delivered", "read"];
    } else if (update.status === "sent") {
      replaceable = ["accepted"];
    } else if (update.status === "delivered") {
      replaceable = ["accepted", "sent"];
    } else {
      replaceable = ["accepted", "sent", "delivered"]; // "read"
    }

    const updatedRows = await this.db
      .update(whatsappMessages)
      .set({
        status: update.status,
        errorCode: update.errorCode,
        errorMessage: update.errorMessage,
      })
      .where(
        and(
          eq(whatsappMessages.wamid, update.messageId),
          inArray(whatsappMessages.status, replaceable),
        ),
      )
      .returning({ id: whatsappMessages.id });

    if (updatedRows.length === 0) {
      // Either a message we didn't record (e.g. the hello_world test) or an out-of-order
      // update that would move the status backwards. Both are safe to ignore.
      this.logger.debug(`Ignored "${update.status}" for ${update.messageId}`);
    }
    if (update.status === "failed") {
      this.logger.warn(
        `WhatsApp message ${update.messageId} failed: ${update.errorCode} ${update.errorMessage}`,
      );
    }
  }
}
