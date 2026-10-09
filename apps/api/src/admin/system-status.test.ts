/** Integration test against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { InfraModule, REDIS } from "../infra/infra.module.js";
import { HEARTBEAT_KEY, WorkerHeartbeat } from "../platform/worker-heartbeat.js";
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
});
