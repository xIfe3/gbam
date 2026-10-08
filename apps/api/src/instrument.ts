/**
 * Error alerts (Sentry). Imported FIRST by main.ts and worker.ts: Sentry has to start
 * before anything else loads so it can see errors from everywhere.
 *
 * With no SENTRY_DSN set (local development, tests) this does nothing at all.
 */
import { scrubText } from "@gbam/shared";
import * as Sentry from "@sentry/nestjs";
import type { Job } from "bullmq";
import { UnrecoverableError } from "bullmq";

const dsn = process.env.SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV ?? "development",
    // What Sentry may collect on its own: nothing personal. Job data and code variables are
    // off too, because they can hold sign-in codes, emails and phone numbers.
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      databaseQueryData: false,
      queues: false,
      stackFrameVariables: false,
    },
    // Errors only. Performance tracing costs more and we don't need it yet.
    tracesSampleRate: 0,
    // Runs on every report just before it is sent: our last chance to remove private data.
    beforeSend(event) {
      // The request can carry session cookies, headers and form bodies (passwords, codes).
      delete event.request;
      delete event.user;
      if (event.message) {
        event.message = scrubText(event.message);
      }
      const exceptions = event.exception?.values ?? [];
      for (const exception of exceptions) {
        if (exception.value) {
          exception.value = scrubText(exception.value);
        }
      }
      const breadcrumbs = event.breadcrumbs ?? [];
      for (const breadcrumb of breadcrumbs) {
        if (breadcrumb.message) {
          breadcrumb.message = scrubText(breadcrumb.message);
        }
        // Breadcrumb data can include URLs (with tracking keys) and request details.
        delete breadcrumb.data;
      }
      return event;
    },
  });
}

/**
 * Called by each background job processor when a job fails. BullMQ retries most jobs a few
 * times, so we only report the LAST failure: a job that fails once and then works is normal
 * (a network blip), and alerting on it would be noise.
 */
export function reportJobFailure(job: Job | undefined, error: Error): void {
  if (!job) {
    return;
  }
  let maxAttempts = 1;
  if (job.opts.attempts) {
    maxAttempts = job.opts.attempts;
  }
  const isLastAttempt = job.attemptsMade >= maxAttempts;
  const willNeverRetry = error instanceof UnrecoverableError;
  if (!isLastAttempt && !willNeverRetry) {
    return;
  }
  Sentry.captureException(error, {
    tags: { queue: job.queueName, jobName: job.name },
    extra: { jobId: job.id, attemptsMade: job.attemptsMade },
  });
}
