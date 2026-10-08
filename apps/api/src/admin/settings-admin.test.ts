/** Integration test over HTTP against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { adminAuditLog, platformSettings } from "@gbam/db";
import { DEFAULT_PLATFORM_SETTINGS } from "@gbam/shared";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { and, eq, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailQueue } from "../email/email.queue.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { PLATFORM_SETTINGS_NAMESPACE } from "../infra/platform-settings.service.js";
import { PlatformSettingsService } from "../infra/platform-settings.service.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminTestData, callAdmin, listen, type TestAdmin } from "./admin-test-helpers.js";
import { PlatformModule } from "../platform/platform.module.js";
import { AdminModule } from "./admin.module.js";

process.loadEnvFile?.("../../.env");

// This test's own settings rows, so other test files (running at the same time against the
// same database) keep seeing the defaults.
const NAMESPACE = `test-${randomUUID().slice(0, 8)}:`;

describe("Admin settings and maintenance (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let data: AdminTestData;
  let settings: PlatformSettingsService;
  let manager: TestAdmin;
  let boss: TestAdmin;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, AdminModule, PlatformModule],
    })
      .overrideProvider(PLATFORM_SETTINGS_NAMESPACE)
      .useValue(NAMESPACE)
      .overrideProvider(EmailQueue)
      .useValue({ send: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    baseUrl = await listen(app);
    db = moduleRef.get(DB);
    settings = moduleRef.get(PlatformSettingsService);
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    manager = await data.admin({
      isSuperadmin: false,
      roleId: await data.role(["settings.manage"]),
    });
    boss = await data.admin({ isSuperadmin: true });
  });

  afterAll(async () => {
    await db.delete(platformSettings).where(like(platformSettings.key, `${NAMESPACE}%`));
    await data.cleanUp();
    await app.close();
  });

  it("get returns defaults when nothing is stored", async () => {
    const result = await callAdmin(baseUrl, "GET", "/admin/settings", manager.token);
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ settings: DEFAULT_PLATFORM_SETTINGS });
  });

  it("update validates, saves and audits before/after; saving clears this process's cache", async () => {
    // Warm the cache with the defaults first.
    expect((await settings.get()).feePercentBasisPoints).toBe(150);

    const bad = await callAdmin(baseUrl, "PATCH", "/admin/settings", manager.token, {
      ...DEFAULT_PLATFORM_SETTINGS,
      reminderAfterHours: 72,
    });
    expect(bad.status).toBe(400);

    const saved = await callAdmin(baseUrl, "PATCH", "/admin/settings", manager.token, {
      ...DEFAULT_PLATFORM_SETTINGS,
      feePercentBasisPoints: 200,
      signupsOpen: false,
    });
    expect(saved.status).toBe(200);
    // Seen at once by this process, despite the 30-second cache.
    const now = await settings.get();
    expect(now.feePercentBasisPoints).toBe(200);
    expect(now.signupsOpen).toBe(false);

    const entries = await db
      .select()
      .from(adminAuditLog)
      .where(
        and(eq(adminAuditLog.adminId, manager.id), eq(adminAuditLog.action, "settings.updated")),
      );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.before).toMatchObject({ feePercentBasisPoints: 150 });
    expect(entries[0]?.after).toMatchObject({ feePercentBasisPoints: 200 });
  });

  it("the public endpoint shares only what the website needs", async () => {
    const result = await callAdmin(baseUrl, "GET", "/platform/public", null);
    expect(result.status).toBe(200);
    expect(Object.keys(result.json as object).sort()).toEqual([
      "feeCapKobo",
      "feePercentBasisPoints",
      "maintenance",
      "signupsOpen",
      "whatsappNumber",
    ]);
  });

  it("non-superadmin can't set maintenance", async () => {
    const body = { level: "full", message: "Back soon", backBy: null };
    expect(
      (await callAdmin(baseUrl, "PUT", "/admin/maintenance", manager.token, body)).status,
    ).toBe(403);
    const done = await callAdmin(baseUrl, "PUT", "/admin/maintenance", boss.token, body);
    expect(done.status).toBe(200);
    expect((await settings.maintenance()).level).toBe("full");

    await callAdmin(baseUrl, "PUT", "/admin/maintenance", boss.token, {
      level: "off",
      message: null,
      backBy: null,
    });
    expect((await settings.maintenance()).level).toBe("off");
    const entries = await db
      .select()
      .from(adminAuditLog)
      .where(
        and(eq(adminAuditLog.adminId, boss.id), eq(adminAuditLog.action, "maintenance.changed")),
      );
    expect(entries).toHaveLength(2);
  });
});
