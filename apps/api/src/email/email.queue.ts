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
    const options = {
      jobId,
      attempts: 5,
      backoff: { type: "exponential" as const, delay: 2_000 },
      removeOnComplete: 1_000 as number | boolean,
      removeOnFail: 5_000 as number | { age: number },
    };
    // Codes and private tracking links sit in plaintext in the job data: don't keep them around.
    if (
      job.kind === "verify_email" ||
      job.kind === "reset_password" ||
      job.kind === "order_receipt" ||
      job.kind === "payment_confirmed" ||
      job.kind === "order_cancelled" ||
      job.kind === "order_refunded"
    ) {
      options.removeOnComplete = true;
      options.removeOnFail = { age: 3600 };
    }
    await this.queue.add(job.kind, job, options);
  }
}
