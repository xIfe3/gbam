/** Integration test over HTTP against the dev Postgres + Redis (db 1). Queue and email recorded. */
import "reflect-metadata";
import { adminAuditLog, announcements, sellers, users } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { ENV, type Env } from "../env.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { AnnouncementsQueue } from "../messaging/announcements.queue.js";
import { createTestSeller } from "../test-helpers.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminTestData, callAdmin, listen, type TestAdmin } from "./admin-test-helpers.js";
import { AdminModule } from "./admin.module.js";

process.loadEnvFile?.("../../.env");
process.env.UNSUBSCRIBE_SIGNING_KEY = "announcements-test-key-0123456789abcdef";

type Detail = {
  announcement: { id: string; status: string; subject: string; scheduledAt: string | null };
  counts: { queued: number; sent: number; failed: number };
  audienceCount: number;
};

describe("Admin announcements API (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let data: AdminTestData;
  let sender: TestAdmin;
  let outsider: TestAdmin;
  let shopId: string;
  let userId: string;
  const queued: { id: string; at: Date | null }[] = [];
  const cancelled: string[] = [];
  const sent: EmailJob[] = [];
  const createdIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, AdminModule] })
      .overrideProvider(EmailQueue)
      .useValue({
        send: async (_jobId: string, job: EmailJob) => {
          sent.push(job);
        },
      })
      .overrideProvider(AnnouncementsQueue)
      .useValue({
        enqueue: async (id: string, at: Date | null) => {
          queued.push({ id, at });
        },
        cancel: async (id: string) => {
          cancelled.push(id);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    baseUrl = await listen(app);
    db = moduleRef.get(DB);
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    sender = await data.admin({ isSuperadmin: false, roleId: await data.role(["messages.send"]) });
    outsider = await data.admin({ isSuperadmin: false, roleId: await data.role(["shops.view"]) });
    // One shop with an owner, so an audience of just this shop has exactly 1 seller.
    const seller = await createTestSeller(db, "announce");
    shopId = seller.id;
    const owners = await db
      .insert(users)
      .values({ email: `announce-${randomUUID().slice(0, 8)}@example.com`, passwordHash: "x" })
      .returning({ id: users.id });
    const owner = owners[0];
    if (!owner) {
      throw new Error("owner not created");
    }
    userId = owner.id;
    await db.update(sellers).set({ ownerUserId: userId }).where(eq(sellers.id, shopId));
  });

  afterAll(async () => {
    if (createdIds.length > 0) {
      await db.delete(adminAuditLog).where(inArray(adminAuditLog.targetId, createdIds));
      await db.delete(announcements).where(inArray(announcements.id, createdIds));
    }
    await db.delete(sellers).where(eq(sellers.id, shopId));
    await db.delete(users).where(eq(users.id, userId));
    await data.cleanUp();
    await app.close();
  });

  beforeEach(() => {
    queued.length = 0;
    cancelled.length = 0;
    sent.length = 0;
  });

  const draft = () => ({
    subject: "Delivery zones are here",
    body: "Hello **sellers**, set your delivery fees today.",
    buttonLabel: "Open settings",
    buttonUrl: "https://gbam.app/dashboard/settings",
    audience: { shopId },
  });

  async function newDraft(): Promise<string> {
    const result = await callAdmin(baseUrl, "POST", "/admin/announcements", sender.token, draft());
    expect(result.status).toBe(201);
    const id = (result.json as { id: string }).id;
    createdIds.push(id);
    return id;
  }

  const detail = async (id: string) =>
    (await callAdmin(baseUrl, "GET", `/admin/announcements/${id}`, sender.token)).json as Detail;

  it("needs messages.send", async () => {
    expect((await callAdmin(baseUrl, "GET", "/admin/announcements", outsider.token)).status).toBe(
      403,
    );
    const create = await callAdmin(
      baseUrl,
      "POST",
      "/admin/announcements",
      outsider.token,
      draft(),
    );
    expect(create.status).toBe(403);
  });

  it("preview renders the email and counts the audience", async () => {
    const result = await callAdmin(
      baseUrl,
      "POST",
      "/admin/announcements/preview",
      sender.token,
      draft(),
    );
    expect(result.status).toBe(200);
    const preview = result.json as { html: string; subject: string; recipients: number };
    expect(preview.recipients).toBe(1);
    expect(preview.html).toContain("sellers</strong>");
    expect(preview.html).toContain("Unsubscribe from news and tips");
  });

  it("drafts can be edited, sent ones can't", async () => {
    const id = await newDraft();
    const edit = await callAdmin(baseUrl, "PATCH", `/admin/announcements/${id}`, sender.token, {
      ...draft(),
      subject: "Delivery zones: now live",
    });
    expect(edit.status).toBe(200);
    expect((await detail(id)).announcement.subject).toBe("Delivery zones: now live");
    await db.update(announcements).set({ status: "sent" }).where(eq(announcements.id, id));
    const late = await callAdmin(
      baseUrl,
      "PATCH",
      `/admin/announcements/${id}`,
      sender.token,
      draft(),
    );
    expect(late.status).toBe(409);
  });

  it("send needs the right count", async () => {
    const id = await newDraft();
    const wrong = await callAdmin(
      baseUrl,
      "POST",
      `/admin/announcements/${id}/send`,
      sender.token,
      {
        confirmCount: 5,
      },
    );
    expect(wrong.status).toBe(400);
    expect(queued).toHaveLength(0);
    const right = await callAdmin(
      baseUrl,
      "POST",
      `/admin/announcements/${id}/send`,
      sender.token,
      {
        confirmCount: 1,
      },
    );
    expect(right.status).toBe(200);
    expect(queued).toEqual([{ id, at: null }]);
    expect((await detail(id)).announcement.status).toBe("sending");
    const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, id));
    expect(audit.map((entry) => entry.action).sort()).toEqual([
      "announcement.create",
      "announcement.send",
    ]);
  });

  it("schedule and cancel", async () => {
    const id = await newDraft();
    const at = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
    const past = await callAdmin(baseUrl, "POST", `/admin/announcements/${id}/send`, sender.token, {
      confirmCount: 1,
      scheduledAt: new Date(Date.now() - 60_000).toISOString(),
    });
    expect(past.status).toBe(400);
    const scheduled = await callAdmin(
      baseUrl,
      "POST",
      `/admin/announcements/${id}/send`,
      sender.token,
      {
        confirmCount: 1,
        scheduledAt: at,
      },
    );
    expect(scheduled.status).toBe(200);
    expect(queued[0]?.at?.toISOString()).toBe(at);
    expect((await detail(id)).announcement.status).toBe("scheduled");
    const cancel = await callAdmin(
      baseUrl,
      "POST",
      `/admin/announcements/${id}/cancel`,
      sender.token,
    );
    expect(cancel.status).toBe(200);
    expect(cancelled).toEqual([id]);
    expect((await detail(id)).announcement.status).toBe("cancelled");
  });

  it("test goes only to me", async () => {
    const id = await newDraft();
    const result = await callAdmin(
      baseUrl,
      "POST",
      `/admin/announcements/${id}/test`,
      sender.token,
    );
    expect(result.status).toBe(200);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ kind: "announcement", to: sender.email, test: true });
  });

  it("bin and restore", async () => {
    const id = await newDraft();
    expect(
      (await callAdmin(baseUrl, "POST", `/admin/announcements/${id}/delete`, sender.token)).status,
    ).toBe(200);
    const list = (await callAdmin(baseUrl, "GET", "/admin/announcements", sender.token)).json as {
      id: string;
    }[];
    expect(list.some((row) => row.id === id)).toBe(false);
    const bin = (await callAdmin(baseUrl, "GET", "/admin/announcements?bin=1", sender.token))
      .json as { id: string }[];
    expect(bin.some((row) => row.id === id)).toBe(true);
    expect(
      (await callAdmin(baseUrl, "POST", `/admin/announcements/${id}/restore`, sender.token)).status,
    ).toBe(200);
  });

  it("no signing key → 503", async () => {
    const id = await newDraft();
    const env = moduleRef.get<Env>(ENV);
    const key = env.UNSUBSCRIBE_SIGNING_KEY;
    env.UNSUBSCRIBE_SIGNING_KEY = undefined;
    try {
      const result = await callAdmin(
        baseUrl,
        "POST",
        `/admin/announcements/${id}/send`,
        sender.token,
        {
          confirmCount: 1,
        },
      );
      expect(result.status).toBe(503);
    } finally {
      env.UNSUBSCRIBE_SIGNING_KEY = key;
    }
  });
});
