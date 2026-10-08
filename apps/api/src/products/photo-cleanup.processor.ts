import { OnWorkerEvent, Processor, WorkerHost } from "@nestjs/bullmq";
import type { Job } from "bullmq";
import { Logger } from "@nestjs/common";
import { PHOTO_CLEANUP_QUEUE } from "./photo-cleanup.queue.js";
import { PhotosService } from "./photos.service.js";
import { reportJobFailure } from "../instrument.js";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Runs in the WORKER process only. Deletes photos nobody attached within 24 hours. */
@Processor(PHOTO_CLEANUP_QUEUE)
export class PhotoCleanupProcessor extends WorkerHost {
  private readonly logger = new Logger(PhotoCleanupProcessor.name);

  constructor(private readonly photos: PhotosService) {
    super(); // required because we extend WorkerHost
  }

  /** Tells Sentry when a job has failed for good (see reportJobFailure in instrument.ts). */
  @OnWorkerEvent("failed")
  onFailed(job: Job | undefined, error: Error) {
    reportJobFailure(job, error);
  }

  async process() {
    const olderThan = new Date(Date.now() - ONE_DAY_MS);
    const count = await this.photos.cleanupOrphans(olderThan);
    this.logger.log(`Deleted ${count} orphan photo(s)`);
    return { deleted: count };
  }
}
