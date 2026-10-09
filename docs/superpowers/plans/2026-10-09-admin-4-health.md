# Admin Phase 4 (System health) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One System page where admins with `system.view` see whether the API, database, Redis and worker are healthy, the latest Sentry errors, background-job counts and failures, and uptime; admins with `system.manage` can retry a failed job.

**Architecture:** The worker writes a heartbeat to Redis every 30 seconds. `GET /admin/system` pings the database and Redis, reads the heartbeat, counts every BullMQ queue, and asks Sentry and UptimeRobot (each optional, cached 60 seconds, 5-second timeout). Failed jobs are listed without their data; a retry is audited.

**Tech Stack:** NestJS 12, BullMQ, ioredis, Sentry REST API, UptimeRobot API v2, Next.js 16 server components and actions.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-design.md` section 4.

## Global Constraints

- CLAUDE.md code style.
- `system.view` for everything read-only; `system.manage` for retry. Retry writes one audit entry (`job.retry`, target `job`, id `queue:jobId`).
- Failed jobs never expose job data; error text goes through `scrubText`.
- New optional env: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_API_URL` (default `https://sentry.io`), `UPTIME_API_KEY`. Unset = that panel says "not set up", never an error.
- Worker heartbeat key `worker:heartbeat` (ms timestamp, expires after 10 minutes); "late" after 2 minutes.

## Review Focus

1. Sentry or UptimeRobot down or slow → the page still loads, that panel says it couldn't be reached. (Task 2 tests `sentry unavailable` and `uptime unavailable`.)
2. A failed job whose data holds an email or code → the list shows only id, name, scrubbed error, attempts and time. (Task 3 test `failed jobs never include data`.)
3. Retrying a job that isn't failed, or a queue that doesn't exist → 409 / 404, nothing audited. (Task 3 tests.)
4. Worker stopped → status says so within 2 minutes. (Task 1 test `worker late after 2 minutes`.)
5. Admin with `system.view` but not `system.manage` → sees no Retry button, API refuses with 403. (Task 3 and Task 4 tests.)

---

### Task 1: Heartbeat and status

**Files:** `apps/api/src/platform/worker-heartbeat.ts` (provider in WorkerModule), `apps/api/src/admin/system-status.service.ts` (`SystemStatusService.status()`), test.

**Produces:** `status(): { database: { ok: boolean; ms: number }, redis: { ok: boolean; ms: number }, worker: { state: "ok" | "late" | "missing"; lastBeatAt: string | null } }`.

**Tests:** `heartbeat writes the time`; `worker ok when recent`; `worker late after 2 minutes`; `worker missing when never seen`.

### Task 2: Sentry and uptime clients

**Files:** `apps/api/src/admin/sentry-issues.client.ts`, `apps/api/src/admin/uptime.client.ts`, env additions, tests (global fetch stubbed).

**Produces:** `SentryIssuesClient.latest(): SentryResult`, `UptimeClient.monitors(): UptimeResult` where each result is `{ state: "not_configured" } | { state: "unavailable" } | { state: "ok", ... }`. Sentry: `GET {SENTRY_API_URL}/api/0/projects/{org}/{project}/issues/?query=is:unresolved&limit=10`, bearer token; issues `{ id, title (scrubbed), culprit (scrubbed), count, lastSeen, link }`. UptimeRobot: `POST https://api.uptimerobot.com/v2/getMonitors` with `api_key`, `custom_uptime_ratios=30`; monitors `{ name, status: "up" | "down" | "paused" | "unknown", uptime30d: number | null }`. Both cache a good answer for 60 seconds.

**Tests:** `sentry not configured`; `sentry issues mapped and scrubbed`; `sentry unavailable`; `uptime not configured`; `uptime monitors mapped`; `uptime unavailable`.

### Task 3: System API

**Files:** `apps/api/src/admin/system-admin.controller.ts`, `system-admin.service.ts`, queue list provider `SYSTEM_QUEUES`, integration test.

**Produces:** `GET /admin/system` (system.view) → `{ status, queues: { name, waiting, active, failed, delayed }[], errors: SentryResult, uptime: UptimeResult }`; `GET /admin/system/queues/:name/failed` (system.view) → `{ id, name, error, attempts, failedAt }[]` (latest 50); `POST /admin/system/queues/:name/jobs/:id/retry` (system.manage).

**Tests:** `needs system.view`; `counts every queue`; `failed jobs never include data`; `retry needs system.manage`; `retry moves the job back and is audited`; `retry of a job that isn't failed is refused`; `unknown queue is 404`.

### Task 4: System page

**Files:** `apps/web/app/admin/(signed-in)/system/page.tsx`, `lib/admin-api.ts`, admin action `retryJobAction`, nav item System (system.view), tests.

**Tests:** `system page shows status, errors, queues and uptime`; `not set up panels explain what to add`; `failed jobs list with retry only for system.manage`; `nav shows System by permission`.
