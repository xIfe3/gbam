import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PAYMENTS_QUEUE, type ConfirmPaymentJob } from "./payments.queue.js";
import { PaymentsService } from "./payments.service.js";
import { reportJobFailure } from "../instrument.js";

/** Worker only. Failures (Paystack down, DB blip) throw, and BullMQ retries with backoff. */
@Processor(PAYMENTS_QUEUE)
export class PaymentsProcessor extends WorkerHost {
  constructor(private readonly payments: PaymentsService) {
    super();
  }

  /** Tells Sentry when a job has failed for good (see reportJobFailure in instrument.ts). */
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error) {
    reportJobFailure(job, error);
  }

  async process(job: Job<ConfirmPaymentJob>) {
    return { result: await this.payments.confirm(job.data.reference) };
  }
}
