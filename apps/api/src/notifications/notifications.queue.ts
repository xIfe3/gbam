import type { OrderStatus } from "@gbam/shared";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

export const NOTIFICATIONS_QUEUE = "notifications";

/**
 * `to` picks which WhatsApp message the processor sends. A payment reminder uses
 * to: "awaiting_payment", so it sends the same payment request again (with the same link).
 */
export type NotificationJob = {
  kind: "order.status_changed" | "order.payment_reminder";
  orderId: string;
  from: OrderStatus | null;
  to: OrderStatus;
};

/** Producer side. Safe to use from both HTTP and worker processes. */
@Injectable()
export class NotificationsQueue {
  constructor(@InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue<NotificationJob>) {}

  /** `eventId` (the order_events row) is the job id, so retries never double-send. */
  async orderStatusChanged(eventId: string, job: Omit<NotificationJob, "kind">) {
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
}
