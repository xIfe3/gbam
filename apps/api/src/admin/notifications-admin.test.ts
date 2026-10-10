/** Integration test over HTTP against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import {
  adminAuditLog,
  notificationCampaigns,
  sellerNotifications,
  sellers,
  users,
} from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailQueue } from "../email/email.queue.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { createTestSeller } from "../test-helpers.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminTestData, callAdmin, listen, type TestAdmin } from "./admin-test-helpers.js";
import { AdminModule } from "./admin.module.js";

process.loadEnvFile?.("../../.env");

describe("Admin notifications API (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let data: AdminTestData;
  let sender: TestAdmin;
  let outsider: TestAdmin;
  let shopId: string;
  let userId: string;
  const campaignIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, AdminModule] })
      .overrideProvider(EmailQueue)
      .useValue({ send: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    baseUrl = await listen(app);
    db = moduleRef.get(DB);
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    sender = await data.admin({ isSuperadmin: false, roleId: await data.role(["messages.send"]) });
    outsider = await data.admin({ isSuperadmin: false, roleId: await data.role(["shops.view"]) });
    const seller = await createTestSeller(db, "notify");
    shopId = seller.id;
    const owners = await db
      .insert(users)
      .values({ email: `notify-${randomUUID().slice(0, 8)}@example.com`, passwordHash: "x" })
      .returning({ id: users.id });
    const owner = owners[0];
    if (!owner) {
      throw new Error("owner not created");
    }
    userId = owner.id;
    await db.update(sellers).set({ ownerUserId: userId }).where(eq(sellers.id, shopId));
  });

  afterAll(async () => {
    if (campaignIds.length > 0) {
      await db.delete(adminAuditLog).where(inArray(adminAuditLog.targetId, campaignIds));
      await db.delete(notificationCampaigns).where(inArray(notificationCampaigns.id, campaignIds));
    }
    await db.delete(sellers).where(eq(sellers.id, shopId));
    await db.delete(users).where(eq(users.id, userId));
    await data.cleanUp();
    await app.close();
  });

  const input = (confirmCount: number) => ({
    type: "action",
    title: "Add your bank account",
    body: "Customers can't pay you until you add one.",
    link: "/dashboard/settings",
    audience: { shopId },
    confirmCount,
  });

  it("needs messages.send", async () => {
    expect((await callAdmin(baseUrl, "GET", "/admin/notifications", outsider.token)).status).toBe(
      403,
    );
    const send = await callAdmin(baseUrl, "POST", "/admin/notifications", outsider.token, input(1));
    expect(send.status).toBe(403);
  });

  it("counts the audience", async () => {
    const result = await callAdmin(baseUrl, "POST", "/admin/notifications/count", sender.token, {
      audience: { shopId },
    });
    expect(result.json).toEqual({ recipients: 1 });
  });

  it("admin campaign reaches the audience", async () => {
    const wrong = await callAdmin(baseUrl, "POST", "/admin/notifications", sender.token, input(9));
    expect(wrong.status).toBe(400);
    const result = await callAdmin(baseUrl, "POST", "/admin/notifications", sender.token, input(1));
    expect(result.status).toBe(201);
    const id = (result.json as { id: string }).id;
    campaignIds.push(id);
    const rows = await db
      .select()
      .from(sellerNotifications)
      .where(eq(sellerNotifications.campaignId, id));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      sellerId: shopId,
      type: "action",
      title: "Add your bank account",
      link: "/dashboard/settings",
    });
    const list = (await callAdmin(baseUrl, "GET", "/admin/notifications", sender.token)).json as {
      id: string;
      recipientCount: number;
      readCount: number;
    }[];
    expect(list.find((row) => row.id === id)).toMatchObject({ recipientCount: 1, readCount: 0 });
    const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, id));
    expect(audit.map((entry) => entry.action)).toEqual(["notification.send"]);
  });

  it("bin and restore a campaign", async () => {
    const result = await callAdmin(baseUrl, "POST", "/admin/notifications", sender.token, input(1));
    const id = (result.json as { id: string }).id;
    campaignIds.push(id);
    const del = await callAdmin(baseUrl, "POST", `/admin/notifications/${id}/delete`, sender.token);
    expect(del.status).toBe(200);
    const bin = (await callAdmin(baseUrl, "GET", "/admin/notifications?bin=1", sender.token))
      .json as { id: string }[];
    expect(bin.some((row) => row.id === id)).toBe(true);
    const back = await callAdmin(
      baseUrl,
      "POST",
      `/admin/notifications/${id}/restore`,
      sender.token,
    );
    expect(back.status).toBe(200);
  });
});
