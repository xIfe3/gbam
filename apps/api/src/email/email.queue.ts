import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";
import type { EmailJob } from "./templates.js";

export const EMAILS_QUEUE = "emails";

/** Producer side. Safe to use from both HTTP and worker processes. */
@Injectable()
export class EmailQueue {
  constructor(@InjectQueue(EMAILS_QUEUE) private readonly queue: Queue<EmailJob>) {}

  /**
   * `jobId` is chosen by the caller (`code-<emailCodeId>` / `contact-<messageId>`), so
   * adding the same email twice never sends it twice.
   */
  async send(jobId: string, job: EmailJob) {
    await this.queue.add(job.kind, job, {
      jobId,
      attempts: 5,
      backoff: { type: "exponential", delay: 2_000 },
      removeOnComplete: 1_000,
      removeOnFail: 5_000,
    });
  }
}
