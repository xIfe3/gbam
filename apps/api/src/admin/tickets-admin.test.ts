/** Integration test over HTTP against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { adminAuditLog, supportTickets } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { and, eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { TicketsService } from "../tickets/tickets.service.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminTestData, callAdmin, listen, type TestAdmin } from "./admin-test-helpers.js";
import { AdminModule } from "./admin.module.js";

process.loadEnvFile?.("../../.env");

type Row = {
  id: string;
  number: number;
  status: string;
  priority: string;
  assigneeName: string | null;
};
type Page = { rows: Row[]; total: number };
type Detail = {
  ticket: {
    id: string;
    status: string;
    priority: string;
    assigneeId: string | null;
    deletedAt: string | null;
  };
  messages: { body: string; internal: boolean; adminName: string | null }[];
};

describe("Admin tickets API (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let data: AdminTestData;
  let tickets: TicketsService;
  let handler: TestAdmin;
  let viewer: TestAdmin;
  let outsider: TestAdmin;
  // Every ticket here is "from" this address, so lists can be narrowed to this test's tickets.
  const tag = `tadmin-${randomUUID().slice(0, 8)}`;
  const requesterEmail = `${tag}@example.com`;
  const sent: EmailJob[] = [];

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
    tickets = moduleRef.get(TicketsService);
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    handler = await data.admin({
      isSuperadmin: false,
      roleId: await data.role(["tickets.view", "tickets.handle"]),
    });
    viewer = await data.admin({ isSuperadmin: false, roleId: await data.role(["tickets.view"]) });
    outsider = await data.admin({ isSuperadmin: false, roleId: await data.role(["shops.view"]) });
  });

  afterAll(async () => {
    const rows = await db
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(eq(supportTickets.requesterEmail, requesterEmail));
    const ids: string[] = [];
    for (const row of rows) {
      ids.push(row.id);
    }
    if (ids.length > 0) {
      await db.delete(adminAuditLog).where(inArray(adminAuditLog.targetId, ids));
      await db.delete(supportTickets).where(inArray(supportTickets.id, ids));
    }
    await data.cleanUp();
    await app.close();
  });

  async function newTicket(subject = "Payout missing"): Promise<string> {
    const created = await tickets.create({
      source: "seller",
      subject,
      message: "Nothing arrived in my bank.",
      requesterName: "Ada",
      requesterEmail,
    });
    return created.id;
  }

  const get = (url: string, token: string) => callAdmin(baseUrl, "GET", url, token);
  const post = (url: string, token: string, body?: unknown) =>
    callAdmin(baseUrl, "POST", url, token, body);

  it("needs tickets.view / tickets.handle", async () => {
    const id = await newTicket();
    expect((await get("/admin/tickets", outsider.token)).status).toBe(403);
    expect((await get(`/admin/tickets/${id}`, viewer.token)).status).toBe(200);
    const reply = await post(`/admin/tickets/${id}/reply`, viewer.token, { message: "Hi" });
    expect(reply.status).toBe(403);
    const update = await callAdmin(baseUrl, "PATCH", `/admin/tickets/${id}`, viewer.token, {
      status: "solved",
    });
    expect(update.status).toBe(403);
  });

  it("filters", async () => {
    // Its own marker: every ticket here shares the requester email, which q= also searches.
    const marker = `filters${randomUUID().slice(0, 8)}`;
    const urgent = await newTicket(`Urgent thing ${marker}`);
    const plain = await newTicket(`Plain thing ${marker}`);
    await db
      .update(supportTickets)
      .set({ priority: "urgent" })
      .where(eq(supportTickets.id, urgent));
    await db
      .update(supportTickets)
      .set({ assigneeId: handler.id })
      .where(eq(supportTickets.id, plain));
    const byPriority = (await get(`/admin/tickets?q=${marker}&priority=urgent`, viewer.token))
      .json as Page;
    expect(byPriority.rows.map((row) => row.id)).toEqual([urgent]);
    const mine = (await get(`/admin/tickets?q=${marker}&assignee=me`, handler.token)).json as Page;
    expect(mine.rows.map((row) => row.id)).toEqual([plain]);
    const nobody = (await get(`/admin/tickets?q=${marker}&assignee=none`, handler.token))
      .json as Page;
    expect(nobody.rows.map((row) => row.id)).toEqual([urgent]);
    const rows = await db.select().from(supportTickets).where(eq(supportTickets.id, urgent));
    const number = rows[0]?.number;
    const byNumber = (await get(`/admin/tickets?q=%23${number}`, viewer.token)).json as Page;
    expect(byNumber.rows.map((row) => row.id)).toEqual([urgent]);
  });

  it("reply, note and update are audited", async () => {
    const id = await newTicket();
    expect(
      (await post(`/admin/tickets/${id}/reply`, handler.token, { message: "On it." })).status,
    ).toBe(201);
    expect(
      (await post(`/admin/tickets/${id}/notes`, handler.token, { message: "Check bank" })).status,
    ).toBe(201);
    const update = await callAdmin(baseUrl, "PATCH", `/admin/tickets/${id}`, handler.token, {
      status: "solved",
      priority: "low",
      assigneeId: handler.id,
    });
    expect(update.status).toBe(200);
    const detail = (await get(`/admin/tickets/${id}`, viewer.token)).json as Detail;
    expect(detail.ticket).toMatchObject({
      status: "solved",
      priority: "low",
      assigneeId: handler.id,
    });
    expect(detail.messages.map((message) => message.internal)).toEqual([false, false, true]);
    const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, id));
    expect(audit.map((entry) => entry.action).sort()).toEqual([
      "ticket.note",
      "ticket.reply",
      "ticket.update",
    ]);
  });

  it("assigning to someone who isn't an admin is refused", async () => {
    const id = await newTicket();
    const update = await callAdmin(baseUrl, "PATCH", `/admin/tickets/${id}`, handler.token, {
      assigneeId: randomUUID(),
    });
    expect(update.status).toBe(400);
  });

  it("bulk assign and close", async () => {
    const first = await newTicket();
    const second = await newTicket();
    const assign = await post("/admin/tickets/bulk", handler.token, {
      ids: [first, second],
      note: "Taking these",
      action: "assign",
      assigneeId: handler.id,
    });
    expect(assign.json).toEqual({ done: [first, second], skipped: [] });
    const close = await post("/admin/tickets/bulk", handler.token, {
      ids: [first, second],
      note: "Answered by phone",
      action: "close",
    });
    expect((close.json as { done: string[] }).done).toHaveLength(2);
    const rows = await db
      .select()
      .from(supportTickets)
      .where(inArray(supportTickets.id, [first, second]));
    for (const row of rows) {
      expect(row.status).toBe("closed");
      expect(row.assigneeId).toBe(handler.id);
    }
    const audit = await db
      .select()
      .from(adminAuditLog)
      .where(
        and(
          eq(adminAuditLog.action, "ticket.close"),
          inArray(adminAuditLog.targetId, [first, second]),
        ),
      );
    expect(audit).toHaveLength(2);
    expect(audit[0]?.batchId).toBe(audit[1]?.batchId);
    expect(audit[0]?.note).toBe("Answered by phone");
  });

  it("bulk reports skipped", async () => {
    const ok = await newTicket();
    const binned = await newTicket();
    await db
      .update(supportTickets)
      .set({ deletedAt: new Date() })
      .where(eq(supportTickets.id, binned));
    const missing = randomUUID();
    const result = await post("/admin/tickets/bulk", handler.token, {
      ids: [ok, binned, missing],
      note: "Raise these",
      action: "priority",
      priority: "urgent",
    });
    expect(result.json).toEqual({
      done: [ok],
      skipped: [
        { id: binned, why: "In the bin" },
        { id: missing, why: "Ticket not found" },
      ],
    });
  });

  it("bin and restore", async () => {
    const id = await newTicket(`Binned ${tag}`);
    expect(
      (await post(`/admin/tickets/${id}/delete`, handler.token, { reason: "Spam message" })).status,
    ).toBe(201);
    const list = (await get(`/admin/tickets?q=${tag}`, viewer.token)).json as Page;
    expect(list.rows.some((row) => row.id === id)).toBe(false);
    const bin = (await get(`/admin/tickets?q=${tag}&bin=1`, viewer.token)).json as Page;
    expect(bin.rows.map((row) => row.id)).toContain(id);
    expect((await post(`/admin/tickets/${id}/restore`, handler.token)).status).toBe(201);
    const back = (await get(`/admin/tickets/${id}`, viewer.token)).json as Detail;
    expect(back.ticket.deletedAt).toBeNull();
    const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, id));
    expect(audit.map((entry) => entry.action).sort()).toEqual(["ticket.delete", "ticket.restore"]);
  });
});
