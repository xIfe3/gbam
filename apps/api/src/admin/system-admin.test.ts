/** Integration test over HTTP against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { adminAuditLog } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { Queue, Worker } from "bullmq";
import { and, eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailQueue } from "../email/email.queue.js";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminTestData, callAdmin, listen, type TestAdmin } from "./admin-test-helpers.js";
import { AdminModule } from "./admin.module.js";
import { SentryIssuesClient } from "./sentry-issues.client.js";
import { SYSTEM_QUEUES } from "./system-admin.service.js";
import { UptimeClient } from "./uptime.client.js";

process.loadEnvFile?.("../../.env");

type QueueRow = {
  name: string;
  counts: { waiting: number; active: number; failed: number; delayed: number } | null;
};
type FailedJob = { id: string; name: string; error: string; attempts: number; failedAt: string };

describe("Admin system API (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let redis: Redis;
  let data: AdminTestData;
  let viewer: TestAdmin;
  let manager: TestAdmin;
  let outsider: TestAdmin;
  // A queue of its own (on Redis db 1), so no real job or other test is touched.
  const queueName = `test-system-${randomUUID()}`;
  let queue: Queue;
  let worker: Worker;

  beforeAll(async () => {
    const infra = await Test.createTestingModule({ imports: [InfraModule] }).compile();
    const sharedRedis = infra.get<Redis>(REDIS);
    queue = new Queue(queueName, { connection: sharedRedis.duplicate() });
    // A worker with no job function: the test takes jobs and fails them by hand.
    worker = new Worker(queueName, undefined, { connection: sharedRedis.duplicate() });
    await infra.close();

    moduleRef = await Test.createTestingModule({ imports: [InfraModule, AdminModule] })
      .overrideProvider(EmailQueue)
      .useValue({ send: async () => undefined })
      .overrideProvider(SYSTEM_QUEUES)
      .useValue([queue])
      .overrideProvider(SentryIssuesClient)
      .useValue({ latest: async () => ({ state: "not_configured" }) })
      .overrideProvider(UptimeClient)
      .useValue({ monitors: async () => ({ state: "unavailable" }) })
      .compile();
    app = moduleRef.createNestApplication();
    baseUrl = await listen(app);
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    viewer = await data.admin({ isSuperadmin: false, roleId: await data.role(["system.view"]) });
    manager = await data.admin({
      isSuperadmin: false,
      roleId: await data.role(["system.view", "system.manage"]),
    });
    outsider = await data.admin({ isSuperadmin: false, roleId: await data.role(["shops.view"]) });
  });

  afterAll(async () => {
    await worker.close();
    await queue.obliterate({ force: true });
    await queue.close();
    await db.delete(adminAuditLog).where(eq(adminAuditLog.action, "job.retry"));
    await data.cleanUp();
    await app.close();
  });

  /** Adds a job holding private data, then fails it with an error naming an email. */
  async function failedJob(): Promise<string> {
    const added = await queue.add("send-code", { email: "ada@example.com", code: "123456" });
    const token = randomUUID();
    const job = await worker.getNextJob(token);
    if (!job || job.id !== added.id) {
      throw new Error("The test worker didn't get the job just added");
    }
    await job.moveToFailed(new Error("Resend refused ada@example.com"), token);
    if (!added.id) {
      throw new Error("BullMQ gave the job no id");
    }
    return added.id;
  }

  it("needs system.view", async () => {
    expect((await callAdmin(baseUrl, "GET", "/admin/system", outsider.token)).status).toBe(403);
    expect((await callAdmin(baseUrl, "GET", "/admin/system", null)).status).toBe(401);
  });

  it("counts every queue and includes status, errors and uptime", async () => {
    await failedJob();
    await queue.add("later", {}, { delay: 60_000 });
    const result = await callAdmin(baseUrl, "GET", "/admin/system", viewer.token);
    expect(result.status).toBe(200);
    const body = result.json as {
      status: { database: { ok: boolean }; worker: { state: string } };
      queues: QueueRow[];
      errors: { state: string };
      uptime: { state: string };
    };
    expect(body.status.database.ok).toBe(true);
    expect(body.errors).toEqual({ state: "not_configured" });
    expect(body.uptime).toEqual({ state: "unavailable" });
    const row = body.queues.find((item) => item.name === queueName);
    expect(row?.counts?.failed).toBeGreaterThanOrEqual(1);
    expect(row?.counts?.delayed).toBeGreaterThanOrEqual(1);
  });

  it("failed jobs never include data", async () => {
    const id = await failedJob();
    const result = await callAdmin(
      baseUrl,
      "GET",
      `/admin/system/queues/${queueName}/failed`,
      viewer.token,
    );
    expect(result.status).toBe(200);
    const jobs = result.json as FailedJob[];
    const job = jobs.find((item) => item.id === id);
    expect(job).toMatchObject({ name: "send-code", error: "Resend refused [email]" });
    expect(Object.keys(job ?? {}).sort()).toEqual(["attempts", "error", "failedAt", "id", "name"]);
    expect(JSON.stringify(jobs)).not.toContain("123456");
    expect(JSON.stringify(jobs)).not.toContain("ada@example.com");
  });

  it("retry needs system.manage", async () => {
    const id = await failedJob();
    const url = `/admin/system/queues/${queueName}/jobs/${id}/retry`;
    expect((await callAdmin(baseUrl, "POST", url, viewer.token)).status).toBe(403);
  });

  it("retry moves the job back and is audited", async () => {
    const id = await failedJob();
    const url = `/admin/system/queues/${queueName}/jobs/${id}/retry`;
    const result = await callAdmin(baseUrl, "POST", url, manager.token);
    expect(result.status).toBe(201);
    const job = await queue.getJob(id);
    expect(await job?.getState()).toBe("waiting");
    const entries = await db
      .select()
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.action, "job.retry"),
          eq(adminAuditLog.targetId, `${queueName}:${id}`),
        ),
      );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.adminId).toBe(manager.id);
  });

  it("retry of a job that isn't failed is refused", async () => {
    const waiting = await queue.add("waiting-job", {}, { delay: 60_000 });
    const url = `/admin/system/queues/${queueName}/jobs/${waiting.id}/retry`;
    const result = await callAdmin(baseUrl, "POST", url, manager.token);
    expect(result.status).toBe(409);
    const entries = await db
      .select()
      .from(adminAuditLog)
      .where(eq(adminAuditLog.targetId, `${queueName}:${waiting.id}`));
    expect(entries).toHaveLength(0);
  });

  it("unknown queue or job is 404", async () => {
    const noQueue = await callAdmin(
      baseUrl,
      "GET",
      "/admin/system/queues/nope/failed",
      viewer.token,
    );
    expect(noQueue.status).toBe(404);
    const noJob = await callAdmin(
      baseUrl,
      "POST",
      `/admin/system/queues/${queueName}/jobs/999999/retry`,
      manager.token,
    );
    expect(noJob.status).toBe(404);
    expect(redis.status).toBe("ready");
  });
});
