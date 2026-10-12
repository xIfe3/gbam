import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { ORDER_EXPIRY_QUEUE } from "./order-expiry.queue.js";
import { OrderExpiryService } from "./order-expiry.service.js";
import { reportJobFailure } from "../instrument.js";

/**
 * Runs in the WORKER process only, every 15 minutes: remind, then expire, unpaid orders,
 * and expire orders the seller never approved.
 */
@Processor(ORDER_EXPIRY_QUEUE)
export class OrderExpiryProcessor extends WorkerHost {
  constructor(private readonly expiry: OrderExpiryService) {
    super(); // required because we extend WorkerHost
  }

  /** Tells Sentry when a job has failed for good (see reportJobFailure in instrument.ts). */
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error) {
    reportJobFailure(job, error);
  }

  async process() {
    const now = new Date();
    const reminded = await this.expiry.sendDueReminders(now);
    const cancelled = await this.expiry.expireOverdue(now);
    const unapproved = await this.expiry.expireUnapproved(now);
    return {
      reminded: reminded.length,
      cancelled: cancelled.length,
      unapproved: unapproved.length,
    };
  }
}
