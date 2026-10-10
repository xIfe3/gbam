import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { reportJobFailure } from "../instrument.js";
import { AnnouncementSenderService } from "./announcement-sender.service.js";
import { ANNOUNCEMENTS_QUEUE, type SendAnnouncementJob } from "./announcements.queue.js";

/** Runs in the WORKER process only: sends an announcement when its time comes. */
@Processor(ANNOUNCEMENTS_QUEUE)
export class AnnouncementsProcessor extends WorkerHost {
  constructor(private readonly sender: AnnouncementSenderService) {
    super(); // required because we extend WorkerHost
  }

  /** Tells Sentry when a job has failed for good (see reportJobFailure in instrument.ts). */
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error) {
    reportJobFailure(job, error);
  }

  async process(job: Job<SendAnnouncementJob>) {
    return this.sender.run(job.data.announcementId);
  }
}
