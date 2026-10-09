import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";

export const VISITS_COPY_QUEUE = "visits-copy";

/** Producer side: makes sure the every-15-minutes copy job exists. The worker runs it. */
@Injectable()
export class VisitsCopyQueue implements OnModuleInit {
  constructor(@InjectQueue(VISITS_COPY_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    // A "job scheduler" is BullMQ's repeating job; the same id every startup updates it.
    await this.queue.upsertJobScheduler(
      "visits-copy",
      { every: 15 * 60 * 1000 },
      { name: "copy", opts: { removeOnComplete: 10, removeOnFail: 50 } },
    );
  }
}
