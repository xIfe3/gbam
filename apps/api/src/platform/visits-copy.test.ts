/** Integration test against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { dailyVisits, sellers } from "@gbam/db";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Redis } from "ioredis";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { createTestSeller } from "../test-helpers.js";
import { PlatformModule } from "./platform.module.js";
import { lagosDay, VisitsService } from "./visits.service.js";

process.loadEnvFile?.("../../.env");

describe("copying visit counts to the database (integration)", () => {
  let moduleRef: TestingModule;
  let db: Db;
  let redis: Redis;
  let visits: VisitsService;
  let sellerId: string;
  // A day far in the past, so this test's counters can't mix with real ones.
  const day = "2001-02-03";

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, PlatformModule],
    }).compile();
    moduleRef.enableShutdownHooks();
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);
    visits = moduleRef.get(VisitsService);
    sellerId = (await createTestSeller(db, "visitcopy")).id;
    await redis.del(`visits:${day}`);
    await redis.hset(`visits:${day}`, `${sellerId}:storefront`, "5", `${sellerId}:checkout`, "2");
  });

  afterAll(async () => {
    await redis.del(`visits:${day}`);
    await db.delete(sellers).where(eq(sellers.id, sellerId));
    await moduleRef.close();
  });

  async function stored(kind: string): Promise<number | undefined> {
    const rows = await db
      .select()
      .from(dailyVisits)
      .where(
        and(
          eq(dailyVisits.day, day),
          eq(dailyVisits.sellerId, sellerId),
          eq(dailyVisits.kind, kind),
        ),
      );
    return rows[0]?.visits;
  }

  it("copies the day's counters", async () => {
    await visits.copyDay(day);
    expect(await stored("storefront")).toBe(5);
    expect(await stored("checkout")).toBe(2);
  });

  it("copying twice doesn't double", async () => {
    await redis.hincrby(`visits:${day}`, `${sellerId}:storefront`, 1);
    await visits.copyDay(day);
    await visits.copyDay(day);
    expect(await stored("storefront")).toBe(6);
  });

  it("copyRecent copies today and yesterday", async () => {
    const days = await visits.copyRecent(new Date());
    expect(days).toEqual([lagosDay(new Date(Date.now() - 86_400_000)), lagosDay(new Date())]);
  });
});
