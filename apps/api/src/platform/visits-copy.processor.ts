import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { reportJobFailure } from "../instrument.js";
import { VISITS_COPY_QUEUE } from "./visits-copy.queue.js";
import { VisitsService } from "./visits.service.js";

/** Runs in the WORKER process only, every 15 minutes: visit counters → daily_visits. */
@Processor(VISITS_COPY_QUEUE)
export class VisitsCopyProcessor extends WorkerHost {
  constructor(private readonly visits: VisitsService) {
    super(); // required because we extend WorkerHost
  }

  /** Tells Sentry when a job has failed for good (see reportJobFailure in instrument.ts). */
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error) {
    reportJobFailure(job, error);
  }

  async process() {
    const days = await this.visits.copyRecent(new Date());
    return { days };
  }
}
