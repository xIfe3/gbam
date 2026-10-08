import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";

export const ORDER_EXPIRY_QUEUE = "order-expiry";
export const ORDER_EXPIRY_INTERVAL_MS = 15 * 60 * 1000;

/** Producer side: makes sure the every-15-minutes expiry job exists. The worker runs it. */
@Injectable()
export class OrderExpiryQueue implements OnModuleInit {
  constructor(@InjectQueue(ORDER_EXPIRY_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    // A "job scheduler" is BullMQ's repeating job. Using the same id every startup
    // updates the one schedule instead of adding a new one each time the app restarts.
    await this.queue.upsertJobScheduler(
      "order-expiry",
      { every: ORDER_EXPIRY_INTERVAL_MS },
      { name: "expire", opts: { removeOnComplete: 10, removeOnFail: 50 } },
    );
  }
}
