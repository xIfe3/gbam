/** Integration test over HTTP against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { adminAuditLog, sellers, sessions, users } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { hashToken, newSessionToken } from "../auth/crypto.js";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { createTestSeller } from "../test-helpers.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminTestData, callAdmin, listen } from "./admin-test-helpers.js";
import { AdminModule } from "./admin.module.js";

process.loadEnvFile?.("../../.env");

describe("Team, roles and sessions (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let auth: AdminAuthService;
  let data: AdminTestData;
  const sent: EmailJob[] = [];
  const sellerIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, AdminModule] })
      .overrideProvider(EmailQueue)
      .useValue({
        send: async (_jobId: string, job: EmailJob) => {
          sent.push(job);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    baseUrl = await listen(app);
    db = moduleRef.get(DB);
    auth = moduleRef.get(AdminAuthService);
    data = new AdminTestData(db, auth);
  });

  afterAll(async () => {
    await data.cleanUp();
    for (const sellerId of sellerIds) {
      await db.delete(sellers).where(eq(sellers.id, sellerId));
    }
    for (const userId of userIds) {
      await db.delete(users).where(eq(users.id, userId));
    }
    await app.close();
  });

  it("needs a signed-in superadmin", async () => {
    const roleId = await data.role(["shops.view"]);
    const support = await data.admin({ isSuperadmin: false, roleId });
    expect((await callAdmin(baseUrl, "GET", "/admin/team", null)).status).toBe(401);
    expect((await callAdmin(baseUrl, "GET", "/admin/team", support.token)).status).toBe(403);
  });

  it("invite sends an email and lists the invite", async () => {
    const boss = await data.admin({ isSuperadmin: true });
    const roleId = await data.role(["orders.view"]);
    const email = `invitee-${randomUUID().slice(0, 8)}@example.com`;
    data.adminEmails.push(email);

    const invited = await callAdmin(baseUrl, "POST", "/admin/team", boss.token, {
      name: "Chika",
      email,
      roleId,
      isSuperadmin: false,
    });
    expect(invited.status).toBe(201);
    expect(sent.some((job) => job.kind === "admin_invite" && job.to === email)).toBe(true);

    const team = await callAdmin(baseUrl, "GET", "/admin/team", boss.token);
    const body = team.json as { invites: { email: string }[] };
    expect(body.invites.some((invite) => invite.email === email)).toBe(true);
  });

  it("role change applies on the next request", async () => {
    const boss = await data.admin({ isSuperadmin: true });
    const roleId = await data.role([]);
    const staff = await data.admin({ isSuperadmin: false, roleId });
    expect((await auth.sessionAdmin(staff.token))?.permissions).toEqual([]);

    const updated = await callAdmin(baseUrl, "PATCH", `/admin/roles/${roleId}`, boss.token, {
      name: "Grown role",
      permissions: ["shops.view", "orders.view"],
    });
    expect(updated.status).toBe(200);
    expect((await auth.sessionAdmin(staff.token))?.permissions).toEqual([
      "shops.view",
      "orders.view",
    ]);
  });

  it("admin can't change their own role", async () => {
    const boss = await data.admin({ isSuperadmin: true });
    const roleId = await data.role([]);
    const result = await callAdmin(baseUrl, "PATCH", `/admin/team/${boss.id}`, boss.token, {
      roleId,
      isSuperadmin: false,
    });
    expect(result.status).toBe(400);
  });

  it("another admin's role can be changed, and it's audited", async () => {
    const boss = await data.admin({ isSuperadmin: true });
    const roleA = await data.role(["shops.view"]);
    const roleB = await data.role(["orders.view"]);
    const staff = await data.admin({ isSuperadmin: false, roleId: roleA });

    const result = await callAdmin(baseUrl, "PATCH", `/admin/team/${staff.id}`, boss.token, {
      roleId: roleB,
      isSuperadmin: false,
    });
    expect(result.status).toBe(200);
    const entries = await db
      .select()
      .from(adminAuditLog)
      .where(
        and(eq(adminAuditLog.adminId, boss.id), eq(adminAuditLog.action, "admin.role_changed")),
      );
    expect(entries).toHaveLength(1);
    expect(entries[0]?.targetId).toBe(staff.id);
  });

  it("removing an admin signs them out for good", async () => {
    const boss = await data.admin({ isSuperadmin: true });
    const roleId = await data.role(["shops.view"]);
    const staff = await data.admin({ isSuperadmin: false, roleId });
    const result = await callAdmin(baseUrl, "POST", `/admin/team/${staff.id}/remove`, boss.token);
    expect(result.status).toBe(200);
    expect(await auth.sessionAdmin(staff.token)).toBeNull();
  });

  it("an admin can't remove themselves", async () => {
    const boss = await data.admin({ isSuperadmin: true });
    const result = await callAdmin(baseUrl, "POST", `/admin/team/${boss.id}/remove`, boss.token);
    expect(result.status).toBe(400);
  });

  it("role in use can't be deleted, an unused one goes to the bin and comes back", async () => {
    const boss = await data.admin({ isSuperadmin: true });
    const usedRole = await data.role(["shops.view"]);
    await data.admin({ isSuperadmin: false, roleId: usedRole });
    expect(
      (await callAdmin(baseUrl, "DELETE", `/admin/roles/${usedRole}`, boss.token)).status,
    ).toBe(409);

    const unused = await data.role([]);
    expect((await callAdmin(baseUrl, "DELETE", `/admin/roles/${unused}`, boss.token)).status).toBe(
      200,
    );
    const restored = await callAdmin(baseUrl, "POST", `/admin/roles/${unused}/restore`, boss.token);
    expect(restored.status).toBe(200);
  });

  it("ending an admin session signs them out, but not your own", async () => {
    const boss = await data.admin({ isSuperadmin: true });
    const roleId = await data.role([]);
    const staff = await data.admin({ isSuperadmin: false, roleId });
    const staffSession = await auth.sessionAdmin(staff.token);
    const bossSession = await auth.sessionAdmin(boss.token);
    if (!staffSession || !bossSession) {
      throw new Error("expected sessions");
    }

    const list = await callAdmin(baseUrl, "GET", "/admin/sessions/admins", boss.token);
    const rows = list.json as { id: string; isCurrent: boolean }[];
    expect(rows.find((row) => row.id === bossSession.sessionId)?.isCurrent).toBe(true);

    const own = await callAdmin(
      baseUrl,
      "POST",
      `/admin/sessions/admins/${bossSession.sessionId}/end`,
      boss.token,
    );
    expect(own.status).toBe(400);

    const ended = await callAdmin(
      baseUrl,
      "POST",
      `/admin/sessions/admins/${staffSession.sessionId}/end`,
      boss.token,
    );
    expect(ended.status).toBe(200);
    expect(await auth.sessionAdmin(staff.token)).toBeNull();
  });

  it("ending a seller session needs a reason and is audited", async () => {
    const boss = await data.admin({ isSuperadmin: true });
    const seller = await createTestSeller(db, "adminsess");
    sellerIds.push(seller.id);
    const userRows = await db
      .insert(users)
      .values({ email: `seller-${randomUUID().slice(0, 8)}@example.com`, passwordHash: "x" })
      .returning({ id: users.id });
    const user = userRows[0];
    if (!user) {
      throw new Error("expected a user");
    }
    userIds.push(user.id);
    await db.update(sellers).set({ ownerUserId: user.id }).where(eq(sellers.id, seller.id));
    const sessionRows = await db
      .insert(sessions)
      .values({
        userId: user.id,
        tokenHash: hashToken(newSessionToken()),
        expiresAt: new Date(Date.now() + 86_400_000),
        userAgent: "Chrome on Android",
        ip: "102.89.1.1",
      })
      .returning({ id: sessions.id });
    const session = sessionRows[0];
    if (!session) {
      throw new Error("expected a session");
    }

    const url = `/admin/sessions/sellers/${session.id}/end`;
    expect((await callAdmin(baseUrl, "POST", url, boss.token, { reason: "no" })).status).toBe(400);
    const ended = await callAdmin(baseUrl, "POST", url, boss.token, {
      reason: "Seller reported a stolen phone",
    });
    expect(ended.status).toBe(200);
    expect(await db.select().from(sessions).where(eq(sessions.id, session.id))).toHaveLength(0);
    const entries = await db
      .select()
      .from(adminAuditLog)
      .where(
        and(eq(adminAuditLog.adminId, boss.id), eq(adminAuditLog.action, "seller.session_ended")),
      );
    expect(entries[0]?.note).toBe("Seller reported a stolen phone");
  });
});
