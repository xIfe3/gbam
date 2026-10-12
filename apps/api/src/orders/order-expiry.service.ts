import { orderEvents, orders } from "@gbam/db";
import { InvalidOrderTransitionError } from "@gbam/shared";
import { Injectable, Logger } from "@nestjs/common";
import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { PlatformSettingsService } from "../infra/platform-settings.service.js";
import { NotificationsQueue } from "../notifications/notifications.queue.js";
import { OrdersService } from "./orders.service.js";

const HOUR_MS = 60 * 60 * 1000;
/** At most this many orders per run, so one run never takes too long. The next run does the rest. */
const BATCH_SIZE = 100;
/** An order the seller hasn't approved ("pending") is cancelled after this long. */
const UNAPPROVED_EXPIRY_HOURS = 24;

/**
 * Tidies up orders a customer never paid for. A scheduled job in the worker calls both
 * methods every 15 minutes (see OrderExpiryProcessor).
 *
 * "How long has it been waiting?" is measured from when the order moved to awaiting_payment,
 * which is the newest awaiting_payment row in order_events.
 */
@Injectable()
export class OrderExpiryService {
  private readonly logger = new Logger(OrderExpiryService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly orders: OrdersService,
    private readonly notifications: NotificationsQueue,
    private readonly platform: PlatformSettingsService,
  ) {}

  /** Ids of orders awaiting payment since before `cutoff`. */
  private async awaitingPaymentSince(cutoff: Date, onlyNotReminded: boolean): Promise<string[]> {
    // "Asked for payment before the cutoff": when the order last moved to awaiting_payment,
    // found with a subquery (a small query inside the main one). The cutoff is sent as text
    // and `::timestamptz` turns it back into a time, because inside raw SQL the database
    // driver can't tell that a JavaScript Date is a timestamp.
    const askedBeforeCutoff = sql`(
      select max(${orderEvents.createdAt}) from ${orderEvents}
      where ${orderEvents.orderId} = ${orders.id} and ${orderEvents.toStatus} = 'awaiting_payment'
    ) < ${cutoff.toISOString()}::timestamptz`;
    const conditions = [eq(orders.status, "awaiting_payment"), askedBeforeCutoff];
    if (onlyNotReminded) {
      conditions.push(isNull(orders.paymentReminderSentAt));
    }
    const rows = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(...conditions))
      .limit(BATCH_SIZE);

    const ids: string[] = [];
    for (const row of rows) {
      ids.push(row.id);
    }
    return ids;
  }

  /** Sends one WhatsApp payment reminder to each order unpaid long enough. Returns their ids. */
  async sendDueReminders(now: Date): Promise<string[]> {
    // How long to wait comes from Admin → Settings (24 hours unless changed).
    const settings = await this.platform.get();
    const cutoff = new Date(now.getTime() - settings.reminderAfterHours * HOUR_MS);
    const dueIds = await this.awaitingPaymentSince(cutoff, true);

    const reminded: string[] = [];
    for (const orderId of dueIds) {
      // Mark it reminded first, and only if nobody else has. If two runs overlap, only one
      // of them gets the row back, so the customer is never reminded twice.
      const claimed = await this.db
        .update(orders)
        .set({ paymentReminderSentAt: now })
        .where(
          and(
            eq(orders.id, orderId),
            eq(orders.status, "awaiting_payment"),
            isNull(orders.paymentReminderSentAt),
          ),
        )
        .returning({ id: orders.id });
      if (claimed.length === 0) {
        continue;
      }

      try {
        await this.notifications.paymentReminder(orderId);
        reminded.push(orderId);
      } catch (error) {
        // The order still expires on time; only the reminder is lost.
        this.logger.error(`Could not queue the payment reminder for order ${orderId}`, error);
      }
    }
    if (reminded.length > 0) {
      this.logger.log(`Sent ${reminded.length} payment reminder(s)`);
    }
    return reminded;
  }

  /**
   * Cancels orders the seller never approved (still "pending" after UNAPPROVED_EXPIRY_HOURS).
   * Only shops that approve each order first have pending orders; without this, the
   * customer would wait forever. Returns their ids.
   */
  async expireUnapproved(now: Date): Promise<string[]> {
    const cutoff = new Date(now.getTime() - UNAPPROVED_EXPIRY_HOURS * HOUR_MS);
    const rows = await this.db
      .select({ id: orders.id })
      .from(orders)
      .where(and(eq(orders.status, "pending"), lt(orders.createdAt, cutoff)))
      .limit(BATCH_SIZE);

    const cancelled: string[] = [];
    for (const row of rows) {
      try {
        // The normal status change: it re-checks the status under a lock and sends the
        // customer the usual "cancelled" WhatsApp message and email.
        await this.orders.transition({ orderId: row.id, to: "cancelled", actor: "system" });
        cancelled.push(row.id);
      } catch (error) {
        if (error instanceof InvalidOrderTransitionError) {
          // The seller acted on it a moment ago, after we looked. Nothing to do.
          continue;
        }
        this.logger.error(`Could not expire unapproved order ${row.id}`, error);
      }
    }
    if (cancelled.length > 0) {
      this.logger.log(`Cancelled ${cancelled.length} order(s) the seller never approved`);
    }
    return cancelled;
  }

  /** Cancels every order unpaid for too long. Returns their ids. */
  async expireOverdue(now: Date): Promise<string[]> {
    const settings = await this.platform.get();
    const cutoff = new Date(now.getTime() - settings.cancelAfterHours * HOUR_MS);
    const overdueIds = await this.awaitingPaymentSince(cutoff, false);

    const cancelled: string[] = [];
    for (const orderId of overdueIds) {
      try {
        // The normal status change: it locks the order, checks it's still unpaid, and sends
        // the customer the usual "cancelled" WhatsApp message and email.
        await this.orders.transition({ orderId, to: "cancelled", actor: "system" });
        cancelled.push(orderId);
      } catch (error) {
        if (error instanceof InvalidOrderTransitionError) {
          // Paid (or cancelled) a moment ago, after we looked. Nothing to do.
          continue;
        }
        // Something else went wrong with this order: log it and carry on with the rest.
        this.logger.error(`Could not expire order ${orderId}`, error);
      }
    }
    if (cancelled.length > 0) {
      this.logger.log(`Cancelled ${cancelled.length} unpaid order(s)`);
    }
    return cancelled;
  }
}
