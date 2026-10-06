/**
 * HTTP-level test of order tracking: a customer finds their order without an account, pays,
 * and reports a problem; the seller sees and resolves it. Real Nest app, dev Postgres,
 * Redis db 1, fake Paystack, and a fake email queue that records what would be sent.
 */
import "reflect-metadata";
import { orders, sellers, users } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import type { Redis } from "ioredis";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AuthModule } from "../auth/auth.module.js";
import { AuthService } from "../auth/auth.service.js";
import { DomainErrorsFilter } from "../common/domain-errors.filter.js";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { createTestProduct } from "../test-helpers.js";
import { TrackingModule } from "./tracking.module.js";

process.loadEnvFile?.("../../.env");
const INTERNAL_SECRET = "tracking-http-test-internal-secret-0123456789";
process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;

const NOT_FOUND = "We couldn't find an order with that code and phone number";

describe("Order tracking over HTTP (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let redis: Redis;
  let auth: AuthService;
  let ordersService: OrdersService;
  const sentEmails: EmailJob[] = [];
  const createdEmails: string[] = [];
  const usedKeys: string[] = [];

  beforeAll(async () => {
    const fakeQueue = {
      send: async (_jobId: string, job: EmailJob) => {
        sentEmails.push(job);
      },
    };
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, AuthModule, OrdersModule, TrackingModule],
    })
      .overrideProvider(EmailQueue)
      .useValue(fakeQueue)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorsFilter());
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);
    auth = moduleRef.get(AuthService);
    ordersService = moduleRef.get(OrdersService);
  });

  beforeEach(() => {
    sentEmails.length = 0;
  });

  afterAll(async () => {
    const rows = await db.select().from(users).where(inArray(users.email, createdEmails));
    const ids: string[] = [];
    for (const row of rows) {
      ids.push(row.id);
    }
    if (ids.length > 0) {
      await db.delete(sellers).where(inArray(sellers.ownerUserId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    if (usedKeys.length > 0) {
      await redis.del(...usedKeys);
    }
    await app.close();
  });

  /** A signed-up, verified seller (so problem emails have an owner to go to) with one product. */
  async function newShop() {
    const id = randomUUID().slice(0, 8);
    let phone = "296";
    for (let i = 0; i < 10; i++) {
      phone = phone + String(randomInt(10));
    }
    const email = `tracktest-${id}@example.com`;
    createdEmails.push(email);
    const result = await auth.signup(
      {
        businessName: "Track Test",
        slug: `tracktest-${id}`,
        phone,
        email,
        password: "correct horse battery",
      },
      { ip: "203.0.113.14", userAgent: "vitest" },
    );
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, result.user.id));
    const seller = result.user.seller;
    if (!seller) {
      throw new Error("Signup made no shop");
    }
    const { variant } = await createTestProduct(db, seller.id, { name: "Cake", priceKobo: 500000 });
    return {
      slug: seller.slug,
      sellerId: seller.id,
      email,
      authorization: `Bearer ${result.sessionToken}`,
      variantId: variant.id,
    };
  }

  type Shop = Awaited<ReturnType<typeof newShop>>;

  async function placeOrder(shop: Shop, customerEmail?: string) {
    return ordersService.createFromStorefront(shop.slug, {
      customer: { name: "Ada Obi", phone: "2348012345678", email: customerEmail },
      items: [{ variantId: shop.variantId, quantity: 2 }],
    });
  }

  async function call(
    method: string,
    url: string,
    body?: unknown,
    headers: Record<string, string> = {},
  ) {
    // Each call is its own visitor IP unless a test pins one, so limits don't leak between tests.
    const ip = headers["x-client-ip"] ?? `test-${randomUUID()}`;
    const all: Record<string, string> = {
      "x-client-ip": ip,
      "x-internal-secret": INTERNAL_SECRET,
      ...headers,
    };
    let payload: string | undefined;
    if (body !== undefined) {
      all["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}${url}`, { method, headers: all, body: payload });
    const text = await res.text();
    let json: unknown = null;
    if (text !== "") {
      json = JSON.parse(text);
    }
    return { status: res.status, json, text };
  }

  it("gives every new order a long secret tracking key", async () => {
    const shop = await newShop();
    const order = await placeOrder(shop);
    expect(order.trackingKey.length).toBeGreaterThanOrEqual(40);
  });

  it("finds an order only with its code AND the last 4 phone digits, same answer for every miss", async () => {
    const shop = await newShop();
    const order = await placeOrder(shop);

    const found = await call("POST", "/track/lookup", {
      code: order.code.toLowerCase(),
      phoneLast4: "5678",
    });
    expect(found.status).toBe(200);
    expect(found.json).toEqual({ code: order.code, key: order.trackingKey });

    const wrongPhone = await call("POST", "/track/lookup", {
      code: order.code,
      phoneLast4: "0000",
    });
    const unknownCode = await call("POST", "/track/lookup", {
      code: "GB-ZZZZ",
      phoneLast4: "5678",
    });
    expect(wrongPhone.status).toBe(404);
    expect(unknownCode.status).toBe(404);
    expect(wrongPhone.text).toContain(NOT_FOUND);
    expect(wrongPhone.json).toEqual(unknownCode.json);
  });

  it("limits lookups per visitor", async () => {
    const shop = await newShop();
    const order = await placeOrder(shop);
    const ip = `test-${randomUUID()}`;
    usedKeys.push(`track-lookup:${ip}`);
    for (let i = 0; i < 10; i++) {
      await call(
        "POST",
        "/track/lookup",
        { code: order.code, phoneLast4: "0000" },
        { "x-client-ip": ip },
      );
    }
    const blocked = await call(
      "POST",
      "/track/lookup",
      { code: order.code, phoneLast4: "5678" },
      { "x-client-ip": ip },
    );
    expect(blocked.status).toBe(429);
  });

  it("the private link shows only its own order, without the customer's personal details", async () => {
    const shop = await newShop();
    const order = await placeOrder(shop);
    const view = await call("GET", `/track/${order.code}?key=${order.trackingKey}`);
    expect(view.status).toBe(200);
    const body = view.json as {
      shop: { slug: string; businessName: string; whatsappPhone: string };
      order: {
        code: string;
        status: string;
        totalKobo: number;
        items: { productName: string; quantity: number }[];
        events: { toStatus: string }[];
      };
      canPay: boolean;
      issues: unknown[];
    };
    expect(body.shop.slug).toBe(shop.slug);
    expect(body.order.code).toBe(order.code);
    expect(body.order.totalKobo).toBe(1000000);
    expect(body.order.items[0]).toMatchObject({ productName: "Cake", quantity: 2 });
    expect(body.order.events[0]?.toStatus).toBe("pending");
    expect(body.canPay).toBe(false);
    expect(view.text).not.toContain("Ada Obi");
    expect(view.text).not.toContain("2348012345678");
    expect(view.text).not.toContain(order.id);

    expect((await call("GET", `/track/${order.code}?key=wrong`)).status).toBe(404);
    expect((await call("GET", `/track/GB-ZZZZ?key=${order.trackingKey}`)).status).toBe(404);
  });

  it("Pay now works only while the order is awaiting payment", async () => {
    const shop = await newShop();
    const order = await placeOrder(shop);
    const early = await call("POST", `/track/${order.code}/pay?key=${order.trackingKey}`);
    expect(early.status).toBe(409);

    await db.update(orders).set({ status: "awaiting_payment" }).where(eq(orders.id, order.id));
    const view = await call("GET", `/track/${order.code}?key=${order.trackingKey}`);
    expect((view.json as { canPay: boolean }).canPay).toBe(true);
    const pay = await call("POST", `/track/${order.code}/pay?key=${order.trackingKey}`);
    expect(pay.status).toBe(200);
    expect((pay.json as { url: string }).url).toMatch(/^https:\/\/checkout\.paystack\.com\//);
  });

  it("reporting a problem emails the seller, shows on both sides, and is limited to 3 an hour", async () => {
    const shop = await newShop();
    const order = await placeOrder(shop);
    usedKeys.push(`track-issue:${order.id}`);
    const url = `/track/${order.code}/issues?key=${order.trackingKey}`;

    const first = await call("POST", url, { reason: "paid_not_marked", note: "I paid at 3pm" });
    expect(first.status).toBe(201);
    const email = sentEmails.find((job) => job.kind === "issue_reported");
    expect(email).toMatchObject({
      kind: "issue_reported",
      to: shop.email,
      code: order.code,
      reasonLabel: "Paid but it shows unpaid",
      note: "I paid at 3pm",
    });

    const view = await call("GET", `/track/${order.code}?key=${order.trackingKey}`);
    expect((view.json as { issues: { reason: string; resolved: boolean }[] }).issues).toEqual([
      expect.objectContaining({ reason: "paid_not_marked", resolved: false }),
    ]);

    await call("POST", url, { reason: "other" });
    await call("POST", url, { reason: "other" });
    expect((await call("POST", url, { reason: "other" })).status).toBe(429);
    expect((await call("POST", url, { reason: "nonsense" })).status).toBe(400);
  });

  it("the seller sees open problems on the order and in the list, and can resolve them", async () => {
    const shop = await newShop();
    const other = await newShop();
    const order = await placeOrder(shop);
    usedKeys.push(`track-issue:${order.id}`);
    await call("POST", `/track/${order.code}/issues?key=${order.trackingKey}`, {
      reason: "not_received",
    });

    const list = await call("GET", "/orders", undefined, { authorization: shop.authorization });
    expect(
      (list.json as { code: string; openIssues: number }[]).find((o) => o.code === order.code)
        ?.openIssues,
    ).toBe(1);

    const detail = await call("GET", `/orders/${order.id}`, undefined, {
      authorization: shop.authorization,
    });
    const issues = (
      detail.json as { issues: { id: string; reason: string; resolvedAt: string | null }[] }
    ).issues;
    expect(issues).toHaveLength(1);
    const issueId = issues[0]?.id ?? "";

    const stranger = await call(
      "PATCH",
      `/orders/${order.id}/issues/${issueId}/resolve`,
      undefined,
      { authorization: other.authorization },
    );
    expect(stranger.status).toBe(404);

    const resolved = await call(
      "PATCH",
      `/orders/${order.id}/issues/${issueId}/resolve`,
      undefined,
      { authorization: shop.authorization },
    );
    expect(resolved.status).toBe(200);
    const after = await call("GET", "/orders", undefined, { authorization: shop.authorization });
    expect(
      (after.json as { code: string; openIssues: number }[]).find((o) => o.code === order.code)
        ?.openIssues,
    ).toBe(0);
  });

  it("emails a receipt with the tracking link only when the customer gave an email", async () => {
    const shop = await newShop();
    await placeOrder(shop);
    expect(sentEmails.filter((job) => job.kind === "order_receipt")).toHaveLength(0);

    // The API lowercases emails before this point (emailSchema); the service gets them clean.
    const order = await placeOrder(shop, "ada@example.com");
    const receipt = sentEmails.find((job) => job.kind === "order_receipt");
    expect(receipt).toMatchObject({
      kind: "order_receipt",
      to: "ada@example.com",
      code: order.code,
    });
    if (receipt && receipt.kind === "order_receipt") {
      expect(receipt.trackingUrl).toContain(`/track/${order.code}?k=${order.trackingKey}`);
    }
  });
});
