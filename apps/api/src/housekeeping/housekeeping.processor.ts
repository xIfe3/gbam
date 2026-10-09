import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { reportJobFailure } from "../instrument.js";
import { HOUSEKEEPING_QUEUE } from "./housekeeping.queue.js";
import { HousekeepingService } from "./housekeeping.service.js";

/** Runs in the WORKER process only, once a day: closes quiet tickets and empties the bin. */
@Processor(HOUSEKEEPING_QUEUE)
export class HousekeepingProcessor extends WorkerHost {
  constructor(private readonly housekeeping: HousekeepingService) {
    super(); // required because we extend WorkerHost
  }

  /** Tells Sentry when a job has failed for good (see reportJobFailure in instrument.ts). */
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error) {
    reportJobFailure(job, error);
  }

  async process() {
    return this.housekeeping.run(new Date());
  }
}
