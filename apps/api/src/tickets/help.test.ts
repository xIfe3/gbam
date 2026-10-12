/**
 * HTTP-level test of the seller "Get help" and public ticket endpoints: a real Nest app on a
 * random port, the dev Postgres and Redis db 1, and plain fetch() calls.
 */
import "reflect-metadata";
import { orderIssues, sellers, supportTickets, ticketMessages, users } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthModule } from "../auth/auth.module.js";
import { AuthService } from "../auth/auth.service.js";
import { DomainErrorsFilter } from "../common/domain-errors.filter.js";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { addTestPayoutAccount, createTestProduct, TEST_DELIVERY } from "../test-helpers.js";
import { TicketsModule } from "./tickets.module.js";
import { TicketsService } from "./tickets.service.js";

process.loadEnvFile?.("../../.env");
// x-client-ip is trusted only with this secret, so each test can act as its own visitor.
const INTERNAL_SECRET = "help-http-test-internal-secret-0123456789abc";
process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;

type Seller = { authorization: string; sellerId: string; slug: string };
type TicketView = {
  id: string;
  number: number;
  subject: string;
  status: string;
  messages: { author: string; body: string; internal?: boolean; adminName: string | null }[];
};

describe("Help tickets over HTTP (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let auth: AuthService;
  let orders: OrdersService;
  let tickets: TicketsService;
  const createdEmails: string[] = [];
  const sent: EmailJob[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, AuthModule, OrdersModule, TicketsModule],
    })
      .overrideProvider(EmailQueue)
      .useValue({
        send: async (_jobId: string, job: EmailJob) => {
          sent.push(job);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorsFilter());
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    db = moduleRef.get(DB);
    auth = moduleRef.get(AuthService);
    orders = moduleRef.get(OrdersService);
    tickets = moduleRef.get(TicketsService);
  });

  afterAll(async () => {
    const rows = await db.select().from(users).where(inArray(users.email, createdEmails));
    const userIds: string[] = [];
    for (const row of rows) {
      userIds.push(row.id);
    }
    if (userIds.length > 0) {
      const shops = await db
        .select({ id: sellers.id })
        .from(sellers)
        .where(inArray(sellers.ownerUserId, userIds));
      const shopIds: string[] = [];
      for (const shop of shops) {
        shopIds.push(shop.id);
      }
      if (shopIds.length > 0) {
        await db.delete(supportTickets).where(inArray(supportTickets.sellerId, shopIds));
      }
      await db.delete(sellers).where(inArray(sellers.ownerUserId, userIds));
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await db.delete(supportTickets).where(eq(supportTickets.requesterEmail, "public@example.com"));
    await app.close();
  });

  async function newSeller(): Promise<Seller> {
    const id = randomUUID().slice(0, 8);
    let phone = "299";
    for (let i = 0; i < 10; i++) {
      phone = phone + String(randomInt(10));
    }
    const email = `helptest-${id}@example.com`;
    createdEmails.push(email);
    const result = await auth.signup(
      {
        businessName: "Help Test",
        slug: `helptest-${id}`,
        phone,
        email,
        password: "correct horse battery",
      },
      { ip: "203.0.113.20", userAgent: "vitest" },
    );
    // Help needs a verified email: Gbam's replies are emailed there.
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, result.user.id));
    const seller = result.user.seller;
    if (!seller) {
      throw new Error("Signup made no shop");
    }
    await addTestPayoutAccount(db, seller.id);
    return {
      authorization: `Bearer ${result.sessionToken}`,
      sellerId: seller.id,
      slug: seller.slug,
    };
  }

  async function call(
    method: string,
    path: string,
    options: { authorization?: string; body?: unknown; ip?: string } = {},
  ) {
    let ip = `test-${randomUUID()}`;
    if (options.ip) {
      ip = options.ip;
    }
    const headers: Record<string, string> = {
      "x-client-ip": ip,
      "x-internal-secret": INTERNAL_SECRET,
    };
    if (options.authorization !== undefined) {
      headers.authorization = options.authorization;
    }
    let body: string | undefined;
    if (options.body !== undefined) {
      headers["content-type"] = "application/json";
      body = JSON.stringify(options.body);
    }
    const res = await fetch(`${baseUrl}${path}`, { method, headers, body });
    const text = await res.text();
    let json: unknown = null;
    if (text !== "") {
      json = JSON.parse(text);
    }
    return { status: res.status, json };
  }

  async function orderFor(seller: Seller) {
    const { variant } = await createTestProduct(db, seller.sellerId, {
      name: "Chin chin",
      priceKobo: 20_000,
    });
    return orders.createFromStorefront(seller.slug, {
      customer: { name: "Tolu", phone: "2348033334444" },
      delivery: TEST_DELIVERY,
      items: [{ variantId: variant.id, quantity: 1 }],
    });
  }

  it("seller opens a ticket, optionally for an order", async () => {
    const seller = await newSeller();
    const order = await orderFor(seller);
    sent.length = 0;
    const opened = await call("POST", "/help/tickets", {
      authorization: seller.authorization,
      body: {
        subject: "Customer says unpaid",
        message: "The customer insists they paid me.",
        orderCode: order.code,
      },
    });
    expect(opened.status).toBe(201);
    const ticket = opened.json as { id: string; number: number };
    const rows = await db.select().from(supportTickets).where(eq(supportTickets.id, ticket.id));
    expect(rows[0]).toMatchObject({
      source: "seller",
      sellerId: seller.sellerId,
      orderId: order.id,
    });
    expect(sent.some((job) => job.kind === "ticket_new")).toBe(true);

    const badOrder = await call("POST", "/help/tickets", {
      authorization: seller.authorization,
      body: {
        subject: "Customer says unpaid",
        message: "The customer insists they paid me.",
        orderCode: "GB-ZZZZ",
      },
    });
    expect(badOrder.status).toBe(400);

    const list = await call("GET", "/help/tickets", { authorization: seller.authorization });
    expect(list.status).toBe(200);
    expect((list.json as { id: string }[]).map((item) => item.id)).toContain(ticket.id);
  });

  it("seller sees only their own tickets", async () => {
    const owner = await newSeller();
    const stranger = await newSeller();
    const opened = await call("POST", "/help/tickets", {
      authorization: owner.authorization,
      body: { subject: "Payout question", message: "When do payouts arrive each week?" },
    });
    const id = (opened.json as { id: string }).id;
    expect(
      (await call("GET", `/help/tickets/${id}`, { authorization: owner.authorization })).status,
    ).toBe(200);
    expect(
      (await call("GET", `/help/tickets/${id}`, { authorization: stranger.authorization })).status,
    ).toBe(404);
    const reply = await call("POST", `/help/tickets/${id}/reply`, {
      authorization: stranger.authorization,
      body: { message: "sneaky" },
    });
    expect(reply.status).toBe(404);
    const strangerList = await call("GET", "/help/tickets", {
      authorization: stranger.authorization,
    });
    expect(strangerList.json).toEqual([]);
    expect((await call("GET", "/help/tickets")).status).toBe(401);
  });

  it("the seller's view hides notes and admin names, and replies re-open it", async () => {
    const seller = await newSeller();
    const opened = await call("POST", "/help/tickets", {
      authorization: seller.authorization,
      body: { subject: "Payout question", message: "When do payouts arrive each week?" },
    });
    const id = (opened.json as { id: string }).id;
    await db.insert(ticketMessages).values([
      { ticketId: id, author: "admin", body: "Internal: check their bank", internal: true },
      { ticketId: id, author: "admin", body: "Payouts arrive the next working day." },
    ]);
    await db.update(supportTickets).set({ status: "waiting" }).where(eq(supportTickets.id, id));
    const view = (await call("GET", `/help/tickets/${id}`, { authorization: seller.authorization }))
      .json as TicketView;
    expect(view.messages.map((message) => message.body)).toEqual([
      "When do payouts arrive each week?",
      "Payouts arrive the next working day.",
    ]);
    expect(view.messages[1]?.adminName).toBeNull();
    const reply = await call("POST", `/help/tickets/${id}/reply`, {
      authorization: seller.authorization,
      body: { message: "Thanks, got it!" },
    });
    expect(reply.status).toBe(201);
    const rows = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    expect(rows[0]?.status).toBe("open");
  });

  it("escalating a problem opens one ticket (twice = same ticket)", async () => {
    const seller = await newSeller();
    const order = await orderFor(seller);
    const issues = await db
      .insert(orderIssues)
      .values({ orderId: order.id, reason: "not_received", note: "Nothing arrived after 5 days" })
      .returning({ id: orderIssues.id });
    const issueId = issues[0]?.id;
    const url = `/orders/${order.id}/issues/${issueId}/escalate`;
    const body = { message: "I sent it with GIG, tracking says delivered." };
    const first = await call("POST", url, { authorization: seller.authorization, body });
    expect(first.status).toBe(201);
    const second = await call("POST", url, { authorization: seller.authorization, body });
    expect((second.json as { id: string }).id).toBe((first.json as { id: string }).id);
    const rows = await db
      .select()
      .from(supportTickets)
      .where(eq(supportTickets.orderIssueId, issueId ?? ""));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ source: "problem_report", orderId: order.id });
    const thread = await tickets.thread(rows[0]?.id ?? "", false);
    expect(thread[0]?.body).toContain("Nothing arrived after 5 days");
    expect(thread[0]?.body).toContain("I sent it with GIG");

    const other = await newSeller();
    const notTheirs = await call("POST", url, { authorization: other.authorization, body });
    expect(notTheirs.status).toBe(404);
  });

  it("public view needs the key and hides notes", async () => {
    const created = await tickets.create({
      source: "contact",
      subject: "Message from Bola",
      message: "Do you work in Abuja?",
      requesterName: "Bola",
      requesterEmail: "public@example.com",
    });
    await db
      .insert(ticketMessages)
      .values({ ticketId: created.id, author: "admin", body: "Note: spam?", internal: true });
    const rows = await db.select().from(supportTickets).where(eq(supportTickets.id, created.id));
    const key = rows[0]?.accessKey ?? "";
    expect((await call("GET", `/tickets/${created.id}?k=wrong`)).status).toBe(404);
    expect((await call("GET", `/tickets/${created.id}`)).status).toBe(404);
    const view = await call("GET", `/tickets/${created.id}?k=${key}`);
    expect(view.status).toBe(200);
    const body = view.json as TicketView;
    expect(body.subject).toBe("Message from Bola");
    expect(JSON.stringify(body)).not.toContain("spam");
    expect(JSON.stringify(body)).not.toContain("public@example.com");
  });

  it("public reply works and is rate limited", async () => {
    const created = await tickets.create({
      source: "contact",
      subject: "Message from Bola",
      message: "Do you work in Abuja?",
      requesterName: "Bola",
      requesterEmail: "public@example.com",
    });
    const rows = await db.select().from(supportTickets).where(eq(supportTickets.id, created.id));
    const key = rows[0]?.accessKey ?? "";
    const ip = `test-${randomUUID()}`;
    const url = `/tickets/${created.id}/reply?k=${key}`;
    const first = await call("POST", url, { ip, body: { message: "Any news?" } });
    expect(first.status).toBe(201);
    expect(
      (await call("POST", `/tickets/${created.id}/reply?k=bad`, { body: { message: "x" } })).status,
    ).toBe(404);
    let last = 0;
    for (let i = 0; i < 12; i++) {
      last = (await call("POST", url, { ip, body: { message: "again" } })).status;
    }
    expect(last).toBe(429);
  });
});
