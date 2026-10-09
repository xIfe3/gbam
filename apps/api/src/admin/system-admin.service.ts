import { scrubText } from "@gbam/shared";
import { ConflictException, Inject, Injectable, NotFoundException } from "@nestjs/common";
import type { Queue } from "bullmq";
import { EMAILS_QUEUE } from "../email/email.queue.js";
import { NOTIFICATIONS_QUEUE } from "../notifications/notifications.queue.js";
import { ORDER_EXPIRY_QUEUE } from "../orders/order-expiry.queue.js";
import { PAYMENTS_QUEUE } from "../payments/payments.queue.js";
import { VISITS_COPY_QUEUE } from "../platform/visits-copy.queue.js";
import { PHOTO_CLEANUP_QUEUE } from "../products/photo-cleanup.queue.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AuditService } from "./audit.service.js";
import { SentryIssuesClient } from "./sentry-issues.client.js";
import { SystemStatusService } from "./system-status.service.js";
import { UptimeClient } from "./uptime.client.js";

/** Every background-job queue Gbam has. Add new queues here so the System page shows them. */
export const SYSTEM_QUEUE_NAMES = [
  EMAILS_QUEUE,
  NOTIFICATIONS_QUEUE,
  PAYMENTS_QUEUE,
  ORDER_EXPIRY_QUEUE,
  PHOTO_CLEANUP_QUEUE,
  VISITS_COPY_QUEUE,
];

/** The list of Queue objects, given to the service by AdminModule (tests swap in their own). */
export const SYSTEM_QUEUES = Symbol("SYSTEM_QUEUES");

const FAILED_LIST_SIZE = 50;

export type QueueCounts = { waiting: number; active: number; failed: number; delayed: number };

/** Status, errors, jobs and uptime for the admin System page. */
@Injectable()
export class SystemAdminService {
  constructor(
    @Inject(SYSTEM_QUEUES) private readonly queues: Queue[],
    private readonly statusService: SystemStatusService,
    private readonly sentry: SentryIssuesClient,
    private readonly uptime: UptimeClient,
    private readonly audit: AuditService,
  ) {}

  async overview() {
    const status = await this.statusService.status();
    const queues: { name: string; counts: QueueCounts | null }[] = [];
    for (const queue of this.queues) {
      queues.push({ name: queue.name, counts: await this.counts(queue) });
    }
    const errors = await this.sentry.latest();
    const uptime = await this.uptime.monitors();
    return { status, queues, errors, uptime };
  }

  /** How many jobs are in each state; null if Redis can't be reached (the status says so). */
  private async counts(queue: Queue): Promise<QueueCounts | null> {
    try {
      const counts = await queue.getJobCounts("waiting", "active", "failed", "delayed");
      return {
        waiting: counts.waiting ?? 0,
        active: counts.active ?? 0,
        failed: counts.failed ?? 0,
        delayed: counts.delayed ?? 0,
      };
    } catch {
      return null;
    }
  }

  /**
   * The latest failed jobs in one queue. Deliberately never the job's data: it can hold
   * sign-in codes, emails and phone numbers. The error text is scrubbed for the same reason.
   */
  async failedJobs(queueName: string) {
    const queue = this.queueNamed(queueName);
    const jobs = await queue.getFailed(0, FAILED_LIST_SIZE - 1);
    const rows = [];
    for (const job of jobs) {
      let failedAt = job.timestamp;
      if (job.finishedOn) {
        failedAt = job.finishedOn;
      }
      let error = "";
      if (job.failedReason) {
        error = scrubText(job.failedReason);
      }
      rows.push({
        id: String(job.id),
        name: job.name,
        error,
        attempts: job.attemptsMade,
        failedAt: new Date(failedAt).toISOString(),
      });
    }
    return rows;
  }

  /** Puts a failed job back in the queue to run again, and records who did it. */
  async retry(queueName: string, jobId: string, admin: AdminContext, ip: string | null) {
    const queue = this.queueNamed(queueName);
    const job = await queue.getJob(jobId);
    if (!job) {
      throw new NotFoundException("No such job (it may have been cleaned up)");
    }
    const state = await job.getState();
    if (state !== "failed") {
      throw new ConflictException("Only failed jobs can be retried");
    }
    await job.retry("failed");
    // Not a database change, so there's no transaction to share: the entry is written once
    // the retry has worked.
    await this.audit.record({
      adminId: admin.id,
      action: "job.retry",
      targetType: "job",
      targetId: `${queueName}:${jobId}`,
      ip,
    });
    return { ok: true };
  }

  private queueNamed(name: string): Queue {
    for (const queue of this.queues) {
      if (queue.name === name) {
        return queue;
      }
    }
    throw new NotFoundException("No such queue");
  }
}
