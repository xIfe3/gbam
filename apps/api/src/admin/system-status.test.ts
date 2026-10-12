/** Integration test against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { ServiceUnavailableException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InfraModule, REDIS } from "../infra/infra.module.js";
import { HEARTBEAT_KEY, WorkerHeartbeat } from "../platform/worker-heartbeat.js";
import { WorkerHealthController } from "../health/worker-health.controller.js";
import { SystemStatusService } from "./system-status.service.js";

process.loadEnvFile?.("../../.env");

describe("System status (integration)", () => {
  let moduleRef: TestingModule;
  let redis: Redis;
  let status: SystemStatusService;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule],
      providers: [SystemStatusService, WorkerHeartbeat],
    }).compile();
    redis = moduleRef.get<Redis>(REDIS);
    status = moduleRef.get(SystemStatusService);
  });

  afterAll(async () => {
    await redis.del(HEARTBEAT_KEY);
    await moduleRef.close();
  });

  beforeEach(async () => {
    await redis.del(HEARTBEAT_KEY);
  });

  it("heartbeat writes the time", async () => {
    const before = Date.now();
    await moduleRef.get(WorkerHeartbeat).beat();
    const saved = Number(await redis.get(HEARTBEAT_KEY));
    expect(saved).toBeGreaterThanOrEqual(before);
    // It expires on its own, so a worker that's gone for good shows as "missing".
    expect(await redis.ttl(HEARTBEAT_KEY)).toBeGreaterThan(0);
  });

  it("database and redis answer", async () => {
    const result = await status.status();
    expect(result.database.ok).toBe(true);
    expect(result.redis.ok).toBe(true);
    expect(result.database.ms).toBeGreaterThanOrEqual(0);
  });

  it("worker ok when recent", async () => {
    await redis.set(HEARTBEAT_KEY, String(Date.now() - 20_000));
    const result = await status.status();
    expect(result.worker.state).toBe("ok");
    expect(result.worker.lastBeatAt).not.toBeNull();
  });

  it("worker late after 2 minutes", async () => {
    await redis.set(HEARTBEAT_KEY, String(Date.now() - 3 * 60_000));
    expect((await status.status()).worker.state).toBe("late");
  });

  it("worker missing when never seen", async () => {
    const result = await status.status();
    expect(result.worker).toEqual({ state: "missing", lastBeatAt: null });
  });

  // GET /health/worker: what UptimeRobot watches, so you hear when background jobs stop.
  // (In this file because every test here shares the one heartbeat key in Redis.)
  describe("GET /health/worker", () => {
    it("answers 200 while the worker is beating", async () => {
      await redis.set(HEARTBEAT_KEY, String(Date.now() - 20_000));
      const result = await new WorkerHealthController(redis).check();
      expect(result.worker).toBe("ok");
    });

    it("answers 503 when the worker has gone quiet for 2 minutes", async () => {
      await redis.set(HEARTBEAT_KEY, String(Date.now() - 3 * 60_000));
      await expect(new WorkerHealthController(redis).check()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });

    it("answers 503 when the worker has never been seen", async () => {
      await expect(new WorkerHealthController(redis).check()).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    });
  });
});
