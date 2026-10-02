import { Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PAYMENTS_QUEUE, type ConfirmPaymentJob } from "./payments.queue.js";
import { PaymentsService } from "./payments.service.js";

/** Worker only. Failures (Paystack down, DB blip) throw, and BullMQ retries with backoff. */
@Processor(PAYMENTS_QUEUE)
export class PaymentsProcessor extends WorkerHost {
  constructor(private readonly payments: PaymentsService) {
    super();
  }

  async process(job: Job<ConfirmPaymentJob>) {
    return { result: await this.payments.confirm(job.data.reference) };
  }
}
