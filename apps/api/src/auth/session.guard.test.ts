/**
 * HTTP-level test of SessionGuard: a real Nest app on a random port, the dev Postgres and
 * Redis db 1, and plain fetch() calls. The email queue is a recorder.
 */
import "reflect-metadata";
import { sellers, sessions, users } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomInt, randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainErrorsFilter } from "../common/domain-errors.filter.js";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { ProductsModule } from "../products/products.module.js";
import { createTestProduct, TEST_DELIVERY } from "../test-helpers.js";
import { AuthModule } from "./auth.module.js";
import { AuthService } from "./auth.service.js";
import { hashToken, newSessionToken } from "./crypto.js";

process.loadEnvFile?.("../../.env");
// The API trusts x-client-ip only with this secret (as apps/web sends it). A fixed value
// here keeps the test independent of .env; each call gets its own fake "IP" so the
// per-IP limits never carry over between runs.
const INTERNAL_SECRET = "session-guard-test-internal-secret-0123456789";
process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;

const DAY_MS = 24 * 60 * 60 * 1000;

describe("SessionGuard over HTTP (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let auth: AuthService;
  let orders: OrdersService;
  const createdEmails: string[] = [];

  beforeAll(async () => {
    const fakeQueue = { send: async (_jobId: string, _job: EmailJob) => {} };
    moduleRef = await Test.createTestingModule({
      // IntegrationsModule is global and provides the photo storage ProductsModule needs.
      imports: [InfraModule, IntegrationsModule, AuthModule, OrdersModule, ProductsModule],
    })
      .overrideProvider(EmailQueue)
      .useValue(fakeQueue)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorsFilter());
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    db = moduleRef.get(DB);
    auth = moduleRef.get(AuthService);
    orders = moduleRef.get(OrdersService);
  });

  afterAll(async () => {
    const rows = await db.select().from(users).where(inArray(users.email, createdEmails));
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(sellers).where(inArray(sellers.ownerUserId, ids)); // cascades to orders
      await db.delete(users).where(inArray(users.id, ids)); // cascades to sessions and codes
    }
    await app.close();
  });

  /** Signs up a fresh seller; `verified` marks the email as verified straight away. */
  async function newSeller(verified: boolean) {
    const id = randomUUID().slice(0, 8);
    let phone = "299";
    for (let i = 0; i < 10; i++) {
      phone = phone + String(randomInt(10));
    }
    const email = `guardtest-${id}@example.com`;
    createdEmails.push(email);
    const result = await auth.signup(
      {
        businessName: "Guard Test",
        slug: `guardtest-${id}`,
        phone,
        email,
        password: "correct horse battery",
      },
      { ip: "203.0.113.10", userAgent: "vitest" },
    );
    if (verified) {
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, result.user.id));
    }
    return { ...result, email, password: "correct horse battery" };
  }

  async function call(
    method: string,
    path: string,
    options: { authorization?: string; body?: unknown } = {},
  ) {
    const headers: Record<string, string> = {
      "x-client-ip": `test-${randomUUID()}`,
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

  it("401 without an Authorization header", async () => {
    expect((await call("GET", "/orders")).status).toBe(401);
    expect((await call("GET", "/auth/me")).status).toBe(401);
  });

  it("401 for a malformed header or an unknown token", async () => {
    const { sessionToken } = await newSeller(true);
    expect((await call("GET", "/orders", { authorization: sessionToken })).status).toBe(401);
    expect((await call("GET", "/orders", { authorization: `Basic ${sessionToken}` })).status).toBe(
      401,
    );
    expect((await call("GET", "/orders", { authorization: "Bearer" })).status).toBe(401);
    expect(
      (await call("GET", "/orders", { authorization: `Bearer ${newSessionToken()}` })).status,
    ).toBe(401);
  });

  it("401 for an expired session", async () => {
    const { sessionToken } = await newSeller(true);
    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, hashToken(sessionToken)));
    expect((await call("GET", "/orders", { authorization: `Bearer ${sessionToken}` })).status).toBe(
      401,
    );
  });

  it("accepts a lowercase scheme with extra spaces", async () => {
    const { sessionToken, user } = await newSeller(true);
    const res = await call("GET", "/auth/me", { authorization: `bearer    ${sessionToken}` });
    expect(res.status).toBe(200);
    expect(res.json).toMatchObject({ id: user.id, emailVerified: true });
    expect((await call("GET", "/orders", { authorization: `BEARER ${sessionToken}` })).status).toBe(
      200,
    );
  });

  it("403 EMAIL_NOT_VERIFIED for unverified users, except on @AllowUnverified routes", async () => {
    const { sessionToken, user } = await newSeller(false);
    const authorization = `Bearer ${sessionToken}`;

    const ordersRes = await call("GET", "/orders", { authorization });
    expect(ordersRes.status).toBe(403);
    expect(ordersRes.json).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });
    const productsRes = await call("GET", "/products", { authorization });
    expect(productsRes.status).toBe(403);
    expect(productsRes.json).toMatchObject({ code: "EMAIL_NOT_VERIFIED" });

    const me = await call("GET", "/auth/me", { authorization });
    expect(me.status).toBe(200);
    expect(me.json).toMatchObject({ id: user.id, emailVerified: false });
    // Reaches the service (wrong code → 400), so the guard let it through.
    const verify = await call("POST", "/auth/verify-email", {
      authorization,
      body: { code: "000000" },
    });
    expect(verify.status).toBe(400);
  });

  it("403 when the user has no seller", async () => {
    const email = `guardtest-noseller-${randomUUID().slice(0, 8)}@example.com`;
    createdEmails.push(email);
    const [user] = await db
      .insert(users)
      .values({ email, passwordHash: "not-a-real-hash", emailVerifiedAt: new Date() })
      .returning();
    if (!user) {
      throw new Error("Expected a user");
    }
    const token = newSessionToken();
    await db.insert(sessions).values({
      userId: user.id,
      tokenHash: hashToken(token),
      expiresAt: new Date(Date.now() + DAY_MS),
    });
    const res = await call("GET", "/orders", { authorization: `Bearer ${token}` });
    expect(res.status).toBe(403);
    expect(res.json).toMatchObject({ code: "NO_SELLER" });
  });

  it("a seller cannot read another seller's order (404)", async () => {
    const a = await newSeller(true);
    const b = await newSeller(true);
    const bSeller = b.user.seller;
    if (!bSeller) {
      throw new Error("Expected seller B");
    }
    const { variant } = await createTestProduct(db, bSeller.id, { name: "Suya" });
    const order = await orders.createFromStorefront(bSeller.slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      delivery: TEST_DELIVERY,
      items: [{ variantId: variant.id, quantity: 1 }],
    });

    const asA = await call("GET", `/orders/${order.id}`, {
      authorization: `Bearer ${a.sessionToken}`,
    });
    expect(asA.status).toBe(404);
    const asB = await call("GET", `/orders/${order.id}`, {
      authorization: `Bearer ${b.sessionToken}`,
    });
    expect(asB.status).toBe(200);
  });

  it("slides the expiry forward at most once a day", async () => {
    const { sessionToken } = await newSeller(true);
    const tokenHash = hashToken(sessionToken);
    const authorization = `Bearer ${sessionToken}`;

    // Last used two days ago and about to expire: one request pushes it out 30 days.
    await db
      .update(sessions)
      .set({
        lastUsedAt: new Date(Date.now() - 2 * DAY_MS),
        expiresAt: new Date(Date.now() + DAY_MS),
      })
      .where(eq(sessions.tokenHash, tokenHash));
    expect((await call("GET", "/auth/me", { authorization })).status).toBe(200);
    const [slid] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    let slidExpiry = 0;
    let slidLastUsed = 0;
    if (slid && slid.lastUsedAt) {
      slidExpiry = slid.expiresAt.getTime();
      slidLastUsed = slid.lastUsedAt.getTime();
    }
    expect(slidExpiry).toBeGreaterThan(Date.now() + 29 * DAY_MS);
    expect(Date.now() - slidLastUsed).toBeLessThan(60_000);

    // Used an hour ago: no write this time.
    const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
    const soon = new Date(Date.now() + DAY_MS);
    await db
      .update(sessions)
      .set({ lastUsedAt: anHourAgo, expiresAt: soon })
      .where(eq(sessions.tokenHash, tokenHash));
    expect((await call("GET", "/auth/me", { authorization })).status).toBe(200);
    const [same] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash));
    expect(same?.expiresAt.getTime()).toBe(soon.getTime());
    expect(same?.lastUsedAt?.getTime()).toBe(anHourAgo.getTime());
  });

  it("login, me and logout over HTTP", async () => {
    const seller = await newSeller(true);
    const bad = await call("POST", "/auth/login", {
      body: { email: seller.email, password: "wrong password" },
    });
    expect(bad.status).toBe(401);
    const empty = await call("POST", "/auth/login", {
      body: { email: seller.email, password: "" },
    });
    expect(empty.status).toBe(400);

    const login = await call("POST", "/auth/login", {
      body: { email: seller.email.toUpperCase(), password: seller.password },
    });
    expect(login.status).toBe(200);
    const token = (login.json as { sessionToken: string }).sessionToken;
    const authorization = `Bearer ${token}`;
    expect((await call("GET", "/auth/me", { authorization })).status).toBe(200);

    const logout = await call("POST", "/auth/logout", { authorization });
    expect(logout.status).toBe(200);
    expect((await call("GET", "/auth/me", { authorization })).status).toBe(401);
  });

  it("forgot-password answers the same for unknown and known emails", async () => {
    const seller = await newSeller(true);
    const unknown = await call("POST", "/auth/forgot-password", {
      body: { email: `nobody-${randomUUID()}@example.com` },
    });
    const known = await call("POST", "/auth/forgot-password", { body: { email: seller.email } });
    expect(unknown.status).toBe(200);
    expect(known.status).toBe(200);
    const unknownBody = unknown.json as Record<string, unknown>;
    const knownBody = known.json as Record<string, unknown>;
    expect(Object.keys(unknownBody).sort()).toEqual(Object.keys(knownBody).sort());
    expect(unknownBody.message).toBe(knownBody.message);
    expect(unknownBody.requestId).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(knownBody.requestId).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("reset-password with a bad code is a 400 with field code", async () => {
    const seller = await newSeller(true);
    const res = await call("POST", "/auth/reset-password", {
      body: {
        email: seller.email,
        requestId: "x".repeat(43),
        code: "000000",
        password: "a brand new password",
      },
    });
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ field: "code" });
  });
});
