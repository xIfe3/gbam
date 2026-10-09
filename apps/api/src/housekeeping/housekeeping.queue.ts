import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";

export const HOUSEKEEPING_QUEUE = "housekeeping";
const EVERY_DAY_MS = 24 * 60 * 60 * 1000;

/** Producer side: makes sure the daily tidy-up job exists. The worker runs it. */
@Injectable()
export class HousekeepingQueue implements OnModuleInit {
  constructor(@InjectQueue(HOUSEKEEPING_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    // A "job scheduler" is BullMQ's repeating job; the same id every startup updates it.
    await this.queue.upsertJobScheduler(
      "housekeeping",
      { every: EVERY_DAY_MS },
      { name: "tidy", opts: { removeOnComplete: 10, removeOnFail: 50 } },
    );
  }
}
