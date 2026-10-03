import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { UnrecoverableError, type Job } from "bullmq";
import { EmailError } from "@gbam/integrations";
import { InjectEmail, type EmailClient } from "../integrations/integrations.module.js";
import { EMAILS_QUEUE } from "./email.queue.js";
import { renderEmail, type EmailJob } from "./templates.js";

/**
 * Runs in the WORKER process only. BullMQ calls `process()` once per job in the "emails"
 * queue; if it throws, BullMQ retries later (up to 5 times).
 */
@Processor(EMAILS_QUEUE)
export class EmailProcessor extends WorkerHost {
  private readonly logger = new Logger(EmailProcessor.name);

  constructor(@InjectEmail() private readonly email: EmailClient) {
    super(); // required because we extend WorkerHost
  }

  async process(job: Job<EmailJob>) {
    const message = renderEmail(job.data);
    try {
      const sent = await this.email.send(message);
      return { id: sent.id };
    } catch (error) {
      // A 4xx (other than 429 rate limit) means the request itself is wrong: retrying
      // can't help, so stop now instead of repeating it five times.
      if (
        error instanceof EmailError &&
        error.status !== undefined &&
        error.status >= 400 &&
        error.status < 500 &&
        error.status !== 429
      ) {
        this.logger.error(`Email job ${job.id} failed permanently: ${error.message}`);
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}
