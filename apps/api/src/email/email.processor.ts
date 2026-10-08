import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import { UnrecoverableError, type Job } from "bullmq";
import { EmailError } from "@gbam/integrations";
import { InjectEmail, type EmailClient } from "../integrations/integrations.module.js";
import { EMAILS_QUEUE } from "./email.queue.js";
import { renderEmail, type EmailJob } from "./templates.js";
import { reportJobFailure } from "../instrument.js";

/**
 * HTTP statuses where retrying can never help. A bad request (400/422) or missing
 * address (404) won't fix itself, and the user can simply ask for a new code.
 * 401/403 mean our Resend key or domain is misconfigured: an operator must fix that,
 * and the error is logged clearly.
 */
export const PERMANENT_STATUSES = [400, 401, 403, 404, 422];

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

  /** Tells Sentry when a job has failed for good (see reportJobFailure in instrument.ts). */
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error) {
    reportJobFailure(job, error);
  }

  async process(job: Job<EmailJob>) {
    const message = renderEmail(job.data);
    try {
      const sent = await this.email.send(message);
      return { id: sent.id };
    } catch (error) {
      // Only these statuses are permanent. Everything else (408, 409, 429, 5xx, network
      // errors) is rethrown so BullMQ retries it.
      if (
        error instanceof EmailError &&
        error.status !== undefined &&
        PERMANENT_STATUSES.includes(error.status)
      ) {
        this.logger.error(`Email job ${job.id} failed permanently: ${error.message}`);
        throw new UnrecoverableError(error.message);
      }
      throw error;
    }
  }
}
