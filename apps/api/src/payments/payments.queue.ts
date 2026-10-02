import { InjectQueue } from "@nestjs/bullmq";
import { Injectable } from "@nestjs/common";
import type { Queue } from "bullmq";

export const PAYMENTS_QUEUE = "payments";

export type ConfirmPaymentJob = { reference: string };

@Injectable()
export class PaymentsQueue {
  constructor(@InjectQueue(PAYMENTS_QUEUE) private readonly queue: Queue<ConfirmPaymentJob>) {}

  /** jobId = reference, so Paystack's duplicate webhooks collapse into one job. */
  async confirm(reference: string) {
    await this.queue.add(
      "confirm",
      { reference },
      {
        jobId: `paystack-${reference}`,
        attempts: 8,
        backoff: { type: "exponential", delay: 5_000 },
        removeOnComplete: 1_000,
        removeOnFail: 5_000,
      },
    );
  }
}
