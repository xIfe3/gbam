/**
 * HTTP-level test of the payout endpoints: a real Nest app on a random port, the dev
 * Postgres and Redis db 1, the fake Paystack, and plain fetch() calls.
 * Covers spec 8: signup → verify → bank → subaccount (stubbed Paystack).
 */
import "reflect-metadata";
import { products, sellers, users } from "@gbam/db";
import { FakePaystackClient } from "@gbam/integrations";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import type { Redis } from "ioredis";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthModule } from "../auth/auth.module.js";
import { AuthService } from "../auth/auth.service.js";
import { DomainErrorsFilter } from "../common/domain-errors.filter.js";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { IntegrationsModule, PAYSTACK } from "../integrations/integrations.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { PayoutsModule } from "./payouts.module.js";

process.loadEnvFile?.("../../.env");
// x-client-ip is trusted only with this secret; each call sends its own fake IP, so
// per-IP limits never carry over between runs.
const INTERNAL_SECRET = "payouts-http-test-internal-secret-0123456789";
process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;

const ACCOUNT = "0123456789";

describe("Payout endpoints over HTTP (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let redis: Redis;
  let auth: AuthService;
  let orders: OrdersService;
  const createdEmails: string[] = [];
  const sellerIds: string[] = [];

  beforeAll(async () => {
    const fakeQueue = { send: async (_jobId: string, _job: EmailJob) => {} };
    const paystack = new FakePaystackClient(
      async () => undefined,
      () => {},
    );
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, AuthModule, OrdersModule, PayoutsModule],
    })
      .overrideProvider(EmailQueue)
      .useValue(fakeQueue)
      .overrideProvider(PAYSTACK)
      .useValue(paystack)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorsFilter());
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);
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
    const keys: string[] = [];
    for (const id of sellerIds) {
      keys.push(`payouts:resolve:seller:${id}`, `payouts:create:seller:${id}`);
    }
    if (keys.length > 0) {
      await redis.del(...keys);
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
    const email = `payouttest-${id}@example.com`;
    createdEmails.push(email);
    const result = await auth.signup(
      {
        businessName: "Payout Test",
        slug: `payouttest-${id}`,
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
    const seller = result.user.seller;
    if (!seller) {
      throw new Error("Signup made no shop");
    }
    sellerIds.push(seller.id);
    return {
      authorization: `Bearer ${result.sessionToken}`,
      sellerId: seller.id,
      slug: seller.slug,
    };
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

  /** A pending order in the seller's shop. */
  async function pendingOrder(sellerId: string, slug: string) {
    const productRows = await db
      .insert(products)
      .values({ sellerId, name: "Chin chin", priceKobo: 20_000 })
      .returning();
    const product = productRows[0];
    if (!product) {
      throw new Error("No product");
    }
    return orders.createFromStorefront(slug, {
      customer: { name: "Tolu", phone: "2348033334444" },
      items: [{ productId: product.id, quantity: 1 }],
    });
  }

  it("needs a session (401) and a verified email (403)", async () => {
    expect((await call("GET", "/payouts/banks")).status).toBe(401);
    const unverified = await newSeller(false);
    const res = await call("POST", "/payouts/resolve-account", {
      authorization: unverified.authorization,
      body: { bankCode: "058", accountNumber: ACCOUNT },
    });
    expect(res.status).toBe(403);
  });

  it("rejects an account number that isn't 10 digits (400) before calling Paystack", async () => {
    const seller = await newSeller(true);
    const res = await call("POST", "/payouts/resolve-account", {
      authorization: seller.authorization,
      body: { bankCode: "058", accountNumber: "12345" },
    });
    expect(res.status).toBe(400);
  });

  it("signup → verify → bank → subaccount, then payment can be requested", async () => {
    const seller = await newSeller(true);
    const order = await pendingOrder(seller.sellerId, seller.slug);

    // Before: no payout account, so "Request payment" is refused.
    const blocked = await call("PATCH", `/orders/${order.id}/status`, {
      authorization: seller.authorization,
      body: { status: "awaiting_payment" },
    });
    expect(blocked.status).toBe(409);
    expect(blocked.json).toMatchObject({ code: "PAYOUT_ACCOUNT_REQUIRED" });

    const banks = await call("GET", "/payouts/banks", { authorization: seller.authorization });
    expect(banks.status).toBe(200);
    expect(banks.json).toContainEqual({ name: "Guaranty Trust Bank", code: "058" });

    const wrong = await call("POST", "/payouts/resolve-account", {
      authorization: seller.authorization,
      body: { bankCode: "058", accountNumber: "0000000000" },
    });
    expect(wrong.status).toBe(400);
    expect(wrong.json).toMatchObject({ field: "accountNumber" });

    const resolved = await call("POST", "/payouts/resolve-account", {
      authorization: seller.authorization,
      body: { bankCode: "058", accountNumber: ACCOUNT },
    });
    expect(resolved.status).toBe(200);
    expect(resolved.json).toEqual({ accountName: "TEST ACCOUNT", bankName: "Guaranty Trust Bank" });

    const created = await call("POST", "/payouts/account", {
      authorization: seller.authorization,
      body: { bankCode: "058", accountNumber: ACCOUNT },
    });
    expect(created.status).toBe(201);
    expect(created.json).toEqual({
      bankName: "Guaranty Trust Bank",
      accountLast4: "6789",
      bankAccountName: "TEST ACCOUNT",
    });
    expect(JSON.stringify(created.json)).not.toContain(ACCOUNT);

    const me = await call("GET", "/auth/me", { authorization: seller.authorization });
    expect(me.json).toMatchObject({ seller: { hasPayoutAccount: true } });

    const again = await call("POST", "/payouts/account", {
      authorization: seller.authorization,
      body: { bankCode: "058", accountNumber: ACCOUNT },
    });
    expect(again.status).toBe(409);
    expect(again.json).toMatchObject({ code: "PAYOUT_ACCOUNT_EXISTS" });

    const allowed = await call("PATCH", `/orders/${order.id}/status`, {
      authorization: seller.authorization,
      body: { status: "awaiting_payment" },
    });
    expect(allowed.status).toBe(200);
    expect(allowed.json).toMatchObject({ status: "awaiting_payment" });
  });
});
