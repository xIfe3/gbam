import { InjectQueue } from "@nestjs/bullmq";
import { Injectable, type OnModuleInit } from "@nestjs/common";
import type { Queue } from "bullmq";

export const PHOTO_CLEANUP_QUEUE = "photo-cleanup";
export const PHOTO_CLEANUP_INTERVAL_MS = 24 * 60 * 60 * 1000;

/** Producer side: makes sure the daily cleanup job exists. The worker process runs it. */
@Injectable()
export class PhotoCleanupQueue implements OnModuleInit {
  constructor(@InjectQueue(PHOTO_CLEANUP_QUEUE) private readonly queue: Queue) {}

  async onModuleInit() {
    // A "job scheduler" is BullMQ's repeating job. Using the same id every startup
    // updates the one schedule instead of adding a new one each time the app restarts.
    await this.queue.upsertJobScheduler(
      "photo-cleanup",
      { every: PHOTO_CLEANUP_INTERVAL_MS },
      { name: "cleanup", opts: { removeOnComplete: 10, removeOnFail: 50 } },
    );
  }
}
