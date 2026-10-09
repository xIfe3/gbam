/** Integration test against the dev Postgres + Redis (db 1). The email queue is a recorder. */
import "reflect-metadata";
import { adminAuditLog, contactMessages, sellers, supportTickets, ticketMessages } from "@gbam/db";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import type { Redis } from "ioredis";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AdminAuthService } from "../admin/admin-auth.service.js";
import { AdminTestData, type TestAdmin } from "../admin/admin-test-helpers.js";
import { AdminModule } from "../admin/admin.module.js";
import { ContactModule } from "../contact/contact.module.js";
import { ContactService } from "../contact/contact.service.js";
import { EmailQueue } from "../email/email.queue.js";
import { ENV, type Env } from "../env.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { createTestSeller } from "../test-helpers.js";
import { TicketsModule } from "./tickets.module.js";
import { TicketsService } from "./tickets.service.js";

process.loadEnvFile?.("../../.env");

describe("TicketsService (integration)", () => {
  let moduleRef: TestingModule;
  let db: Db;
  let redis: Redis;
  let tickets: TicketsService;
  let data: AdminTestData;
  let admin: TestAdmin;
  let assignee: TestAdmin;
  let sellerId: string;
  const ticketIds: string[] = [];
  const sent: { jobId: string; job: EmailJob }[] = [];
  const ip = `test-ip-${randomUUID()}`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, AdminModule, ContactModule, TicketsModule],
    })
      .overrideProvider(EmailQueue)
      .useValue({
        send: async (jobId: string, job: EmailJob) => {
          sent.push({ jobId, job });
        },
      })
      .compile();
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);
    tickets = moduleRef.get(TicketsService);
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    admin = await data.admin({ isSuperadmin: true });
    assignee = await data.admin({ isSuperadmin: true });
    sellerId = (await createTestSeller(db, "tickets")).id;
  });

  afterAll(async () => {
    if (ticketIds.length > 0) {
      await db.delete(adminAuditLog).where(inArray(adminAuditLog.targetId, ticketIds));
      await db.delete(supportTickets).where(inArray(supportTickets.id, ticketIds));
    }
    await db.delete(sellers).where(eq(sellers.id, sellerId));
    await redis.del(`contact:${ip}`);
    await data.cleanUp();
    await moduleRef.close();
  });

  beforeEach(() => {
    sent.length = 0;
  });

  async function sellerTicket(): Promise<string> {
    const created = await tickets.create({
      source: "seller",
      subject: "Payout missing",
      message: "I was paid for GB-7K2Q but nothing came to my bank.",
      requesterName: "Ada",
      requesterEmail: "ada@example.com",
      sellerId,
    });
    ticketIds.push(created.id);
    return created.id;
  }

  async function ticketRow(id: string) {
    const rows = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    const row = rows[0];
    if (!row) {
      throw new Error("ticket not found");
    }
    return row;
  }

  it("contact form opens a ticket", async () => {
    const email = `contact-${randomUUID().slice(0, 8)}@example.com`;
    await moduleRef.get(ContactService).submit(ip, {
      name: "Bola",
      email,
      phone: undefined,
      message: "Do you work with shops in Abuja?",
    });
    const messages = await db
      .select()
      .from(contactMessages)
      .where(eq(contactMessages.email, email));
    const contact = messages[0];
    if (!contact) {
      throw new Error("contact message not stored");
    }
    const rows = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.contactMessageId, contact.id));
    const ticket = rows[0];
    if (!ticket) {
      throw new Error("no ticket for the contact message");
    }
    ticketIds.push(ticket.id);
    expect(ticket).toMatchObject({
      source: "contact",
      status: "open",
      requesterName: "Bola",
      requesterEmail: email,
    });
    expect(ticket.accessKey?.length).toBeGreaterThanOrEqual(40);
    const thread = await tickets.thread(ticket.id, true);
    expect(thread).toHaveLength(1);
    expect(thread[0]).toMatchObject({
      author: "requester",
      body: "Do you work with shops in Abuja?",
    });
    // The team's contact email links to the ticket; the auto-reply still carries nothing typed.
    const toTeam = sent.find((item) => item.job.kind === "contact_message");
    expect(toTeam?.job).toMatchObject({
      ticketUrl: expect.stringContaining(`/admin/tickets/${ticket.id}`),
    });
    const autoReply = sent.find((item) => item.job.kind === "contact_auto_reply");
    expect(autoReply?.job).toEqual({ kind: "contact_auto_reply", to: email });
    expect(sent.some((item) => item.job.kind === "ticket_new")).toBe(false);
    await db.delete(contactMessages).where(eq(contactMessages.email, email));
  });

  it("new ticket emails support", async () => {
    const id = await sellerTicket();
    await tickets.announceNew(id);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.jobId).toBe(`ticket-new-${id}`);
    expect(sent[0]?.job).toMatchObject({
      kind: "ticket_new",
      subject: "Payout missing",
      requesterName: "Ada",
      adminUrl: expect.stringContaining(`/admin/tickets/${id}`),
    });
  });

  it("admin reply emails the requester and sets waiting", async () => {
    const id = await sellerTicket();
    await tickets.replyAsAdmin(id, { id: admin.id, name: "Chika" }, "We're looking into it.", null);
    expect((await ticketRow(id)).status).toBe("waiting");
    const reply = sent.find((item) => item.job.kind === "ticket_reply");
    expect(reply?.job).toMatchObject({
      to: "ada@example.com",
      message: "We're looking into it.",
      link: expect.stringContaining(`/dashboard/help/${id}`),
    });
    const audit = await db.select().from(adminAuditLog).where(eq(adminAuditLog.targetId, id));
    expect(audit.map((entry) => entry.action)).toEqual(["ticket.reply"]);
  });

  it("contact ticket reply email carries the private link", async () => {
    const created = await tickets.create({
      source: "contact",
      subject: "Contact form",
      message: "Hello there, a question.",
      requesterName: "Bola",
      requesterEmail: "bola@example.com",
    });
    ticketIds.push(created.id);
    await tickets.replyAsAdmin(created.id, { id: admin.id, name: "Chika" }, "Hi Bola!", null);
    const key = (await ticketRow(created.id)).accessKey;
    const reply = sent.find((item) => item.job.kind === "ticket_reply");
    const webUrl = moduleRef.get<Env>(ENV).WEB_URL;
    expect(reply?.job).toMatchObject({ link: `${webUrl}/help/tickets/${created.id}?k=${key}` });
  });

  it("requester reply re-opens and emails the assignee", async () => {
    const id = await sellerTicket();
    await db
      .update(supportTickets)
      .set({ status: "solved", solvedAt: new Date(), assigneeId: assignee.id })
      .where(eq(supportTickets.id, id));
    await tickets.replyAsRequester(id, "Still nothing, sorry.");
    const row = await ticketRow(id);
    expect(row.status).toBe("open");
    expect(row.solvedAt).toBeNull();
    const alert = sent.find((item) => item.job.kind === "ticket_requester_replied");
    expect(alert?.job).toMatchObject({
      to: assignee.email,
      adminUrl: expect.stringContaining(`/admin/tickets/${id}`),
    });
  });

  it("closed takes no replies", async () => {
    const id = await sellerTicket();
    await db
      .update(supportTickets)
      .set({ status: "closed", closedAt: new Date() })
      .where(eq(supportTickets.id, id));
    await expect(tickets.replyAsRequester(id, "Hello?")).rejects.toThrow(/closed/);
    expect(sent).toHaveLength(0);
    const thread = await tickets.thread(id, true);
    expect(thread).toHaveLength(1);
  });

  it("notes are never emailed or shown to the requester", async () => {
    const id = await sellerTicket();
    await tickets.addNote(
      id,
      { id: admin.id, name: "Chika" },
      "Seller seems upset; check payouts.",
      null,
    );
    expect(sent).toHaveLength(0);
    const forRequester = await tickets.thread(id, false);
    expect(forRequester.some((message) => message.internal)).toBe(false);
    const forAdmins = await tickets.thread(id, true);
    expect(forAdmins.find((message) => message.internal)).toMatchObject({
      author: "admin",
      adminName: expect.any(String),
    });
    // The note doesn't change the status.
    expect((await ticketRow(id)).status).toBe("open");
    const rows = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, id));
    expect(rows).toHaveLength(2);
  });
});
