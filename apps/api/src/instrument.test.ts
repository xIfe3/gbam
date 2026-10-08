import { UnrecoverableError, type Job } from "bullmq";
import { beforeEach, describe, expect, it, vi } from "vitest";

// A pretend Sentry, so we can see what would have been reported without sending anything.
const { captureException } = vi.hoisted(() => ({ captureException: vi.fn() }));
vi.mock("@sentry/nestjs", () => ({ init: vi.fn(), captureException }));

import { reportJobFailure } from "./instrument.js";

/** Just the parts of a BullMQ job that reportJobFailure reads. */
function fakeJob(attemptsMade: number, attempts: number | undefined): Job {
  return {
    id: "job-1",
    name: "send",
    queueName: "emails",
    attemptsMade,
    opts: { attempts },
  } as unknown as Job;
}

beforeEach(() => {
  captureException.mockClear();
});

describe("reportJobFailure", () => {
  it("stays quiet while BullMQ will still retry the job", () => {
    reportJobFailure(fakeJob(1, 5), new Error("network blip"));
    expect(captureException).not.toHaveBeenCalled();
  });

  it("reports the last failed attempt", () => {
    const error = new Error("still failing");
    reportJobFailure(fakeJob(5, 5), error);
    expect(captureException).toHaveBeenCalledWith(
      error,
      expect.objectContaining({ tags: { queue: "emails", jobName: "send" } }),
    );
  });

  it("reports at once when the job will never be retried", () => {
    reportJobFailure(fakeJob(1, 5), new UnrecoverableError("template not approved"));
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("treats a job with no retry setting as a single attempt", () => {
    reportJobFailure(fakeJob(1, undefined), new Error("boom"));
    expect(captureException).toHaveBeenCalledTimes(1);
  });
});
