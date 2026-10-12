import type { OrderStatus } from "@gbam/shared";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import { lagosDay } from "../platform/visits.service.js";

export const NOTIFICATIONS_QUEUE = "notifications";

/** How long a shop that checks orders first has before we remind them about a new order. */
const SELLER_REMINDER_DELAY_MS = 30 * 60 * 1000;

/**
 * One WhatsApp message to send. `kind` says which sort, and each sort carries what it needs:
 *
 * - order messages to the customer: `to` picks the message. A payment reminder uses
 *   to: "awaiting_payment", so it sends the same payment request again (with the same link).
 * - seller alerts: a new order, or an order still waiting for the seller to check it.
 * - an automatic reply to a customer who wrote to gbam's number.
 */
export type NotificationJob =
  | { kind: "order.status_changed"; orderId: string; from: OrderStatus | null; to: OrderStatus }
  | { kind: "order.payment_reminder"; orderId: string; from: OrderStatus | null; to: OrderStatus }
  | { kind: "seller.new_order"; orderId: string }
  | { kind: "seller.order_waiting"; orderId: string }
  | { kind: "customer.auto_reply"; phone: string };

/** Retry settings shared by every job: 5 tries, waiting longer each time. */
const JOB_OPTIONS = {
  attempts: 5,
  backoff: { type: "exponential", delay: 2_000 },
  removeOnComplete: 1_000,
  removeOnFail: 5_000,
};

/** Producer side. Safe to use from both HTTP and worker processes. */
@Injectable()
export class NotificationsQueue {
  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue<NotificationJob>) {}

  /** `eventId` (the order_events row) is the job id, so retries never double-send. */
  async orderStatusChanged(
    eventId: string,
    job: { orderId: string; from: OrderStatus | null; to: OrderStatus },
  ) {
    await this.queue.add(
      "order.status_changed",
      { kind: "order.status_changed", ...job },
      {
        jobId: eventId,
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  }

  /**
   * The seller pressed "Resend payment request": the same WhatsApp payment message again.
   * Each press is its own job (the time is in the id); OrdersService limits how often.
   */
  async paymentResend(orderId: string) {
    await this.queue.add(
      "order.payment_reminder",
      { kind: "order.payment_reminder", orderId, from: "awaiting_payment", to: "awaiting_payment" },
      {
        jobId: `resend-${orderId}-${Date.now()}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  }

  /**
   * Sends the payment request again to a customer who hasn't paid. The job id is fixed per
   * order, so an order can only ever be reminded once. If the customer paid in the meantime,
   * the processor sees the order is no longer awaiting payment and sends nothing.
   */
  async paymentReminder(orderId: string) {
    await this.queue.add(
      "order.payment_reminder",
      { kind: "order.payment_reminder", orderId, from: "awaiting_payment", to: "awaiting_payment" },
      {
        jobId: `reminder-${orderId}`,
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  }

  /** Tells the seller on WhatsApp that a new order came in. One per order (the id is fixed). */
  async sellerNewOrder(orderId: string) {
    await this.queue.add(
      "seller.new_order",
      { kind: "seller.new_order", orderId },
      { ...JOB_OPTIONS, jobId: `seller-new-${orderId}` },
    );
  }

  /**
   * For shops that check each order first: in 30 minutes, remind the seller if the order is
   * still waiting for them. "delay" makes BullMQ hold the job until then. If the seller has
   * acted by then, the processor sees the order isn't pending any more and sends nothing.
   */
  async sellerOrderWaiting(orderId: string) {
    await this.queue.add(
      "seller.order_waiting",
      { kind: "seller.order_waiting", orderId },
      { ...JOB_OPTIONS, jobId: `seller-waiting-${orderId}`, delay: SELLER_REMINDER_DELAY_MS },
    );
  }

  /**
   * Answers a customer who wrote to gbam's number. The job id is the phone and today's date,
   * so even if the webhook's daily limit failed, they'd get at most one reply a day.
   */
  async customerAutoReply(phone: string) {
    await this.queue.add(
      "customer.auto_reply",
      { kind: "customer.auto_reply", phone },
      { ...JOB_OPTIONS, jobId: autoReplyJobId(phone, new Date()) },
    );
  }
}

/** The auto-reply job's id: one per phone per day (Lagos time). */
export function autoReplyJobId(phone: string, now: Date): string {
  return `auto-reply-${phone}-${lagosDay(now)}`;
}
