import type { Metadata } from "next";
import Link from "next/link";
import { unstable_rethrow } from "next/navigation";
import { ActionButton } from "@/components/admin/action-forms";
import { adminCan } from "@/components/admin/admin-nav";
import { shortTime } from "@/components/admin/list-bits";
import { param } from "@/components/admin/list-params";
import { adminApi, type FailedJob, type SystemOverview } from "@/lib/admin-api";
import { ApiError } from "@/lib/api";
import { retryJobAction } from "../admin-actions";

export const metadata: Metadata = { title: "System · Admin" };

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

/** Is everything running? Status, errors, background jobs and uptime on one page. */
export default async function SystemPage(props: { searchParams: SearchParams }) {
  const searchParams = await props.searchParams;
  const me = await adminApi.me();
  const overview = await adminApi.system();
  const canRetry = adminCan(me, "system.manage");

  const queue = param(searchParams, "queue");
  let failed: FailedJob[] | null = null;
  let failedProblem: string | null = null;
  if (queue) {
    try {
      failed = await adminApi.failedJobs(queue);
    } catch (error) {
      // Redirects (signed out...) must carry on; a 404 means a made-up queue name.
      unstable_rethrow(error);
      if (error instanceof ApiError && error.status === 404) {
        failedProblem = "There's no queue with that name.";
      } else {
        throw error;
      }
    }
  }

  return (
    <div className="space-y-6">
      <h1 className="font-display text-ink text-3xl font-black">System</h1>
      <StatusPanel status={overview.status} />
      <ErrorsPanel errors={overview.errors} />
      <QueuesPanel queues={overview.queues} />
      {queue && (
        <FailedPanel queue={queue} jobs={failed} problem={failedProblem} canRetry={canRetry} />
      )}
      <UptimePanel uptime={overview.uptime} />
    </div>
  );
}

const panelClasses = "rounded-xl border border-zinc-200 bg-white p-5";

type Light = { label: string; good: boolean; detail: string };

/** One line of the status list: a ✓ or ! as well as the colour, so it never relies on colour. */
function StatusLine({ name, light }: { name: string; light: Light }) {
  let mark = "✓";
  let classes = "text-brand font-bold";
  if (!light.good) {
    mark = "!";
    classes = "text-coral-deep font-bold";
  }
  return (
    <li className="flex flex-wrap items-baseline justify-between gap-2 py-2">
      <span className="text-ink font-bold">{name}</span>
      <span className={classes}>
        <span aria-hidden="true">{mark} </span>
        {light.label}
        <span className="text-ink-muted font-normal"> {light.detail}</span>
      </span>
    </li>
  );
}

function checkLight(check: { ok: boolean; ms: number }): Light {
  if (check.ok) {
    return { label: "Working", good: true, detail: `(${check.ms} ms)` };
  }
  return { label: "Not answering", good: false, detail: "" };
}

function StatusPanel({ status }: { status: SystemOverview["status"] }) {
  let worker: Light = { label: "Running", good: true, detail: "" };
  if (status.worker.state === "late") {
    worker = { label: "Late", good: false, detail: "(no heartbeat for over 2 minutes)" };
  }
  if (status.worker.state === "missing") {
    worker = { label: "Not running", good: false, detail: "(never seen recently)" };
  }
  if (status.worker.lastBeatAt) {
    worker.detail = `${worker.detail} last seen ${shortTime(status.worker.lastBeatAt)}`.trim();
  }

  return (
    <section className={panelClasses}>
      <h2 className="text-ink font-bold">Status</h2>
      <ul aria-label="Status" className="mt-2 divide-y divide-zinc-100 text-sm">
        <StatusLine name="API" light={{ label: "Working", good: true, detail: "" }} />
        <StatusLine name="Database" light={checkLight(status.database)} />
        <StatusLine name="Redis" light={checkLight(status.redis)} />
        <StatusLine name="Worker" light={worker} />
      </ul>
      <p className="text-ink-muted mt-2 text-sm">
        The worker sends emails and WhatsApp messages, confirms payments and expires unpaid orders.
        If it isn&apos;t running, restart it on the host.
      </p>
    </section>
  );
}

function ErrorsPanel({ errors }: { errors: SystemOverview["errors"] }) {
  return (
    <section className={panelClasses}>
      <h2 className="text-ink font-bold">Latest errors (Sentry)</h2>
      {errors.state === "not_configured" && (
        <p className="text-ink-muted mt-2 text-sm">
          Not set up. Add SENTRY_AUTH_TOKEN, SENTRY_ORG and SENTRY_PROJECT to the API&apos;s
          settings to see errors here.
        </p>
      )}
      {errors.state === "unavailable" && (
        <p className="text-ink-muted mt-2 text-sm">
          Couldn&apos;t reach Sentry just now. Try again in a minute.
        </p>
      )}
      {errors.state === "ok" && errors.issues.length === 0 && (
        <p className="text-ink-muted mt-2 text-sm">No unresolved errors.</p>
      )}
      {errors.state === "ok" && errors.issues.length > 0 && (
        <ul className="mt-2 divide-y divide-zinc-100 text-sm">
          {errors.issues.map((issue) => (
            <li key={issue.id} className="py-2">
              <a
                href={issue.link}
                target="_blank"
                rel="noreferrer"
                className="text-brand font-bold break-words"
              >
                {issue.title}
              </a>
              <span className="text-ink-muted block">
                {issue.culprit} · {issue.count} times · last {shortTime(issue.lastSeen)}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function QueuesPanel({ queues }: { queues: SystemOverview["queues"] }) {
  return (
    <section className={panelClasses}>
      <h2 id="background-jobs" className="text-ink font-bold">
        Background jobs
      </h2>
      <div className="mt-2 overflow-x-auto">
        <table aria-labelledby="background-jobs" className="w-full text-left text-sm">
          <thead>
            <tr>
              <th className="py-2">Queue</th>
              <th className="py-2 text-right">Waiting</th>
              <th className="py-2 text-right">Running</th>
              <th className="py-2 text-right">Delayed</th>
              <th className="py-2 text-right">Failed</th>
              <th className="py-2">
                <span className="sr-only">Actions</span>
              </th>
            </tr>
          </thead>
          <tbody style={{ fontVariantNumeric: "tabular-nums" }}>
            {queues.map((queue) => (
              <tr key={queue.name} className="border-t border-zinc-100">
                <th scope="row" className="py-2 font-bold">
                  {queue.name}
                </th>
                {queue.counts === null && (
                  <td colSpan={5} className="text-ink-muted py-2">
                    Couldn&apos;t count (Redis isn&apos;t answering)
                  </td>
                )}
                {queue.counts !== null && (
                  <>
                    <td className="py-2 text-right">{queue.counts.waiting}</td>
                    <td className="py-2 text-right">{queue.counts.active}</td>
                    <td className="py-2 text-right">{queue.counts.delayed}</td>
                    <td className="py-2 text-right">{queue.counts.failed}</td>
                    <td className="py-2 text-right">
                      {queue.counts.failed > 0 && (
                        <Link
                          href={`/admin/system?queue=${encodeURIComponent(queue.name)}`}
                          className="text-brand font-bold"
                        >
                          See failed
                        </Link>
                      )}
                    </td>
                  </>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function FailedPanel({
  queue,
  jobs,
  problem,
  canRetry,
}: {
  queue: string;
  jobs: FailedJob[] | null;
  problem: string | null;
  canRetry: boolean;
}) {
  const title = `Failed jobs in ${queue}`;
  return (
    <section className={panelClasses}>
      <h2 id="failed-jobs" className="text-ink font-bold">
        {title}
      </h2>
      <p className="text-ink-muted text-sm">
        The latest 50. A job&apos;s contents are never shown here: they can hold sign-in codes and
        contact details.
      </p>
      {problem && <p className="text-coral-deep mt-2 text-sm">{problem}</p>}
      {jobs !== null && jobs.length === 0 && (
        <p className="text-ink-muted mt-2 text-sm">No failed jobs.</p>
      )}
      {jobs !== null && jobs.length > 0 && (
        <div className="mt-2 overflow-x-auto">
          <table aria-labelledby="failed-jobs" className="w-full text-left text-sm">
            <thead>
              <tr>
                <th className="py-2">Job</th>
                <th className="py-2">Error</th>
                <th className="py-2 text-right">Tries</th>
                <th className="py-2">Failed</th>
                {canRetry && (
                  <th className="py-2">
                    <span className="sr-only">Retry</span>
                  </th>
                )}
              </tr>
            </thead>
            <tbody>
              {jobs.map((job) => (
                <tr key={job.id} className="border-t border-zinc-100 align-top">
                  <td className="py-2">
                    {job.name} <span className="text-ink-muted">#{job.id}</span>
                  </td>
                  <td className="py-2 break-words">{job.error}</td>
                  <td className="py-2 text-right">{job.attempts}</td>
                  <td className="py-2">{shortTime(job.failedAt)}</td>
                  {canRetry && (
                    <td className="py-2">
                      <ActionButton
                        action={retryJobAction.bind(null, queue, job.id)}
                        label="Retry"
                      />
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

function UptimePanel({ uptime }: { uptime: SystemOverview["uptime"] }) {
  return (
    <section className={panelClasses}>
      <h2 className="text-ink font-bold">Uptime (UptimeRobot)</h2>
      {uptime.state === "not_configured" && (
        <p className="text-ink-muted mt-2 text-sm">
          Not set up. Add UPTIME_API_KEY to the API&apos;s settings to see uptime here.
        </p>
      )}
      {uptime.state === "unavailable" && (
        <p className="text-ink-muted mt-2 text-sm">
          Couldn&apos;t reach UptimeRobot just now. Try again in a minute.
        </p>
      )}
      {uptime.state === "ok" && (
        <ul className="mt-2 divide-y divide-zinc-100 text-sm">
          {uptime.monitors.map((monitor) => {
            let percent = "no figure yet";
            if (monitor.uptime30d !== null) {
              percent = `${monitor.uptime30d.toFixed(2)}% over 30 days`;
            }
            return (
              <li key={monitor.name} className="flex justify-between gap-2 py-2">
                <span className="text-ink font-bold">{monitor.name}</span>
                <span>
                  <MonitorStatus status={monitor.status} /> · {percent}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function MonitorStatus({ status }: { status: "up" | "down" | "paused" | "unknown" }) {
  if (status === "up") {
    return <span className="text-brand font-bold">✓ Up</span>;
  }
  if (status === "down") {
    return <span className="text-coral-deep font-bold">! Down</span>;
  }
  if (status === "paused") {
    return <span className="text-ink-muted">Paused</span>;
  }
  return <span className="text-ink-muted">Not checked yet</span>;
}
