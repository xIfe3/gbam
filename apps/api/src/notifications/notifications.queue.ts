import type { OrderStatus } from "@gbam/shared";
import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

export const NOTIFICATIONS_QUEUE = "notifications";

export type NotificationJob = {
  kind: "order.status_changed";
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
}
