/** Integration test over HTTP against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { sellers } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AdminAuthService } from "../admin/admin-auth.service.js";
import { AdminTestData, callAdmin, listen, type TestAdmin } from "../admin/admin-test-helpers.js";
import { AdminModule } from "../admin/admin.module.js";
import { EmailQueue } from "../email/email.queue.js";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { createTestSeller } from "../test-helpers.js";
import { lagosDay, VisitsService } from "./visits.service.js";

process.loadEnvFile?.("../../.env");

type Active = {
  sellersInDashboard: number;
  shoppers: number;
  checkout: number;
  admins: number;
  topShops: { slug: string; count: number }[];
};

describe("Visit beacon and active now (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let redis: Redis;
  let data: AdminTestData;
  let analyst: TestAdmin;
  let sellerId: string;
  let slug: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, AdminModule] })
      .overrideProvider(EmailQueue)
      .useValue({ send: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    baseUrl = await listen(app);
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    analyst = await data.admin({
      isSuperadmin: false,
      roleId: await data.role(["analytics.view"]),
    });
    const seller = await createTestSeller(db, "beat");
    sellerId = seller.id;
    slug = seller.slug;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId));
    await data.cleanUp();
    await app.close();
  });

  const newTab = () => `tab-${randomUUID().replaceAll("-", "")}`;

  function beat(
    body: Record<string, unknown>,
    userAgent = "Mozilla/5.0 (Linux; Android 14) Chrome/120",
  ) {
    return fetch(`${baseUrl}/beat`, {
      method: "POST",
      headers: { "content-type": "application/json", "user-agent": userAgent },
      body: JSON.stringify(body),
    });
  }

  async function active(): Promise<Active> {
    const result = await callAdmin(baseUrl, "GET", "/admin/active", analyst.token);
    expect(result.status).toBe(200);
    return result.json as Active;
  }

  async function visitsToday(kind: string): Promise<number> {
    const value = await redis.hget(`visits:${lagosDay(new Date())}`, `${sellerId}:${kind}`);
    return Number(value ?? 0);
  }

  it("a beat shows in active now and counts a visit", async () => {
    const before = await visitsToday("storefront");
    const response = await beat({ tabId: newTab(), kind: "storefront", shop: slug, first: true });
    expect(response.status).toBe(204);
    const now = await active();
    expect(now.topShops.find((shop) => shop.slug === slug)?.count).toBeGreaterThanOrEqual(1);
    expect(now.shoppers).toBeGreaterThanOrEqual(1);
    expect(await visitsToday("storefront")).toBe(before + 1);
  });

  it("one tab counts once a minute", async () => {
    const tabId = newTab();
    const before = await visitsToday("product");
    for (let i = 0; i < 5; i++) {
      await beat({ tabId, kind: "product", shop: slug, first: true });
    }
    expect(await visitsToday("product")).toBe(before + 1);
  });

  it("bots are ignored", async () => {
    const before = await visitsToday("checkout");
    const response = await beat(
      { tabId: newTab(), kind: "checkout", shop: slug, first: true },
      "Googlebot/2.1 (+http://www.google.com/bot.html)",
    );
    expect(response.status).toBe(204);
    expect(await visitsToday("checkout")).toBe(before);
  });

  it("unknown shop ignored", async () => {
    const response = await beat({
      tabId: newTab(),
      kind: "storefront",
      shop: "no-such-shop-xyz",
      first: true,
    });
    expect(response.status).toBe(204);
    const keys = await redis.hkeys(`visits:${lagosDay(new Date())}`);
    expect(keys.some((key) => key.includes("no-such-shop"))).toBe(false);
  });

  it("a malformed beat is refused", async () => {
    expect((await beat({ tabId: "x", kind: "storefront", first: true })).status).toBe(400);
  });

  it("active entries expire after 2 minutes", async () => {
    const stale = `${newTab()}|${slug}-stale`;
    await redis.zadd("active:storefront", Date.now() - 3 * 60_000, stale);
    const now = await active();
    expect(now.topShops.some((shop) => shop.slug === `${slug}-stale`)).toBe(false);
    expect(await redis.zscore("active:storefront", stale)).toBeNull();
  });

  it("admins in the admin area are counted", async () => {
    await moduleRef
      .get(VisitsService)
      .beat({ tabId: newTab(), kind: "admin", first: true }, "Mozilla/5.0");
    expect((await active()).admins).toBeGreaterThanOrEqual(1);
  });
});
