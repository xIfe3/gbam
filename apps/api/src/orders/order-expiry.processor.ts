import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { PaymentsService } from "../payments/payments.service.js";
import { ORDER_EXPIRY_QUEUE } from "./order-expiry.queue.js";
import { OrderExpiryService } from "./order-expiry.service.js";
import { reportJobFailure } from "../instrument.js";

/**
 * Runs in the WORKER process only, every 15 minutes:
 * 1. re-check unconfirmed payments with Paystack (a webhook may have gone missing),
 * 2. remind, then expire, unpaid orders,
 * 3. expire orders the seller never approved.
 * Step 1 comes first so a customer who really paid is never cancelled in step 2.
 */
@Processor(ORDER_EXPIRY_QUEUE)
export class OrderExpiryProcessor extends WorkerHost {
  constructor(
    private readonly expiry: OrderExpiryService,
    private readonly payments: PaymentsService,
  ) {
    super(); // required because we extend WorkerHost
  }

  /** Tells Sentry when a job has failed for good (see reportJobFailure in instrument.ts). */
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error) {
    reportJobFailure(job, error);
  }

  async process() {
    const now = new Date();
    const paidOnRecheck = await this.payments.recheckPending(now);
    const reminded = await this.expiry.sendDueReminders(now);
    const cancelled = await this.expiry.expireOverdue(now);
    const unapproved = await this.expiry.expireUnapproved(now);
    return {
      paidOnRecheck: paidOnRecheck.length,
      reminded: reminded.length,
      cancelled: cancelled.length,
      unapproved: unapproved.length,
    };
  }
}
