/**
 * HTTP-level test of the public "place an order" endpoint's limits: a real Nest app on a
 * random port, the dev Postgres and Redis db 1, and plain fetch() calls.
 *
 * Why limits: every order sends a WhatsApp message from gbam's one number and emails, so
 * an unlimited endpoint would let a script spam strangers in gbam's name (and run up the bill).
 */
import "reflect-metadata";
import { orders, sellers } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { randomInt } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainErrorsFilter } from "../common/domain-errors.filter.js";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { createTestProduct, createTestSeller, TEST_DELIVERY } from "../test-helpers.js";
import { OrdersModule } from "./orders.module.js";

process.loadEnvFile?.("../../.env");
// x-client-ip is trusted only with this secret, so each test can pretend to be a new visitor.
const INTERNAL_SECRET = "storefront-orders-test-internal-secret-0123456789";
process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;

describe("Placing storefront orders over HTTP: limits (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let redis: Redis;
  let sellerId: string;
  let slug: string;
  let variantId: string;
  const usedKeys: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, OrdersModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorsFilter());
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);

    const seller = await createTestSeller(db, "ordlimits");
    sellerId = seller.id;
    slug = seller.slug;
    // A shop needs a payout account before it takes orders.
    await db
      .update(sellers)
      .set({ paystackSubaccountCode: "ACCT_test123" })
      .where(eq(sellers.id, sellerId));
    const created = await createTestProduct(db, sellerId, { name: "Chin chin", priceKobo: 50_000 });
    variantId = created.variant.id;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId)); // cascades to its orders
    usedKeys.push(`storefront-order:shop:${slug}`);
    await redis.del(...usedKeys);
    await app.close();
  });

  /** A made-up Nigerian mobile number, different on every call. */
  function randomPhone(): string {
    let phone = "23480";
    for (let i = 0; i < 8; i++) {
      phone = phone + String(randomInt(10));
    }
    usedKeys.push(`storefront-order:phone:${phone}`);
    return phone;
  }

  /**
   * A made-up visitor IP, different on every call. 2001:db8:: is the range reserved for
   * documentation, so it can never be a real visitor.
   */
  function randomIp(): string {
    const part1 = randomInt(65536).toString(16);
    const part2 = randomInt(65536).toString(16);
    const ip = `2001:db8::${part1}:${part2}`;
    usedKeys.push(`storefront-order:ip:${ip}`);
    return ip;
  }

  async function placeOrder(phone: string, ip: string) {
    const res = await fetch(`${baseUrl}/storefront/${slug}/orders`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-internal-secret": INTERNAL_SECRET,
        "x-client-ip": ip,
      },
      body: JSON.stringify({
        customer: { name: "Ada", phone },
        delivery: TEST_DELIVERY,
        items: [{ variantId, quantity: 1 }],
      }),
    });
    return res.status;
  }

  async function orderCount(): Promise<number> {
    const rows = await db.select({ id: orders.id }).from(orders).where(eq(orders.sellerId, sellerId));
    return rows.length;
  }

  it("allows 5 orders per customer phone an hour, then answers 429", async () => {
    const phone = randomPhone();
    for (let i = 0; i < 5; i++) {
      expect(await placeOrder(phone, randomIp())).toBe(201);
    }
    const before = await orderCount();
    expect(await placeOrder(phone, randomIp())).toBe(429);
    // The refused request created nothing.
    expect(await orderCount()).toBe(before);
  });

  it("allows 30 orders per visitor IP an hour, then answers 429", async () => {
    const ip = randomIp();
    // Pretend this visitor already placed 29 orders this hour (placing them all is slow).
    await redis.set(`storefront-order:ip:${ip}`, "29", "EX", 3600);
    expect(await placeOrder(randomPhone(), ip)).toBe(201); // the 30th is allowed
    expect(await placeOrder(randomPhone(), ip)).toBe(429); // the 31st is not
  });

  it("allows 200 orders per shop an hour, then answers 429", async () => {
    // Pretend the shop already had 200 orders this hour, instead of placing them all.
    await redis.set(`storefront-order:shop:${slug}`, "200", "EX", 3600);
    expect(await placeOrder(randomPhone(), randomIp())).toBe(429);
    await redis.del(`storefront-order:shop:${slug}`);
  });
});
