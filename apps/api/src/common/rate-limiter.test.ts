/** Integration test against the dev Redis (db 1, set in vitest.config.ts). */
import "reflect-metadata";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { InfraModule, REDIS } from "../infra/infra.module.js";
import { RateLimiter, RateLimiterModule } from "./rate-limiter.js";

process.loadEnvFile?.("../../.env");

describe("RateLimiter (integration)", () => {
  let moduleRef: TestingModule;
  let limiter: RateLimiter;
  let redis: Redis;
  const keys: string[] = [];

  function newKey(): string {
    const key = `test-limit:${randomUUID()}`;
    keys.push(key);
    return key;
  }

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, RateLimiterModule],
    }).compile();
    limiter = moduleRef.get(RateLimiter);
    redis = moduleRef.get<Redis>(REDIS);
  });

  afterAll(async () => {
    await redis.del(...keys);
    await moduleRef.close();
  });

  it("allows hits up to the limit, then blocks with a retry time inside the window", async () => {
    const key = newKey();
    for (let i = 0; i < 3; i++) {
      const result = await limiter.hit(key, 3, 60);
      expect(result.allowed).toBe(true);
    }
    const blocked = await limiter.hit(key, 3, 60);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1);
    expect(blocked.retryAfterSeconds).toBeLessThanOrEqual(60);
  });

  it("counts each key separately", async () => {
    const a = newKey();
    const b = newKey();
    await limiter.hit(a, 1, 60);
    expect((await limiter.hit(a, 1, 60)).allowed).toBe(false);
    expect((await limiter.hit(b, 1, 60)).allowed).toBe(true);
  });

  it("repairs a counter that lost its expiry", async () => {
    const key = newKey();
    await redis.set(key, "1"); // no TTL, as if EXPIRE never ran
    await limiter.hit(key, 3, 60);
    const ttl = await redis.ttl(key);
    expect(ttl).toBeGreaterThan(0);
  });
});
