import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

export const ANNOUNCEMENTS_QUEUE = "announcements";

export type SendAnnouncementJob = { announcementId: string };

/** The job's id for an announcement: one job per announcement, so it can't be queued twice. */
function jobIdFor(announcementId: string): string {
  return `announcement-${announcementId}`;
}

/** Producer side: puts an announcement in line to be sent, now or at a set time. */
@Injectable()
export class AnnouncementsQueue {
  constructor(
    @InjectQueue(ANNOUNCEMENTS_QUEUE) private readonly queue: Queue<SendAnnouncementJob>,
  ) {}

  /** `at` null = as soon as possible. A "delay" makes BullMQ hold the job until then. */
  async enqueue(announcementId: string, at: Date | null): Promise<void> {
    let delay = 0;
    if (at !== null) {
      delay = Math.max(0, at.getTime() - Date.now());
    }
    await this.queue.add(
      "send",
      { announcementId },
      {
        jobId: jobIdFor(announcementId),
        delay,
        attempts: 3,
        backoff: { type: "exponential", delay: 60_000 },
        removeOnComplete: 100,
        removeOnFail: 100,
      },
    );
  }

  /** Takes a scheduled announcement out of the line (nothing happens if it already ran). */
  async cancel(announcementId: string): Promise<void> {
    await this.queue.remove(jobIdFor(announcementId));
  }
}
