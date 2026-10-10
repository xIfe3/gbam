/** Integration test against the dev Postgres + Redis (db 1): resending a payment request. */
import "reflect-metadata";
import { sellers } from "@gbam/db";
import { getQueueToken } from "@nestjs/bullmq";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Queue } from "bullmq";
import { eq } from "drizzle-orm";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TooManyRequestsError } from "../common/rate-limiter.js";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { NOTIFICATIONS_QUEUE } from "../notifications/notifications.queue.js";
import { createTestProduct, createTestSeller, TEST_DELIVERY } from "../test-helpers.js";
import { OrdersModule } from "./orders.module.js";
import { OrdersService } from "./orders.service.js";

process.loadEnvFile?.("../../.env");

describe("resending a payment request (integration)", () => {
  let moduleRef: TestingModule;
  let service: OrdersService;
  let db: Db;
  let redis: Redis;
  let queue: Queue;
  let sellerId: string;
  let otherSellerId: string;
  let slug: string;
  let variantId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, OrdersModule] }).compile();
    service = moduleRef.get(OrdersService);
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);
    queue = moduleRef.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));
    const seller = await createTestSeller(db, "resend");
    sellerId = seller.id;
    slug = seller.slug;
    otherSellerId = (await createTestSeller(db, "resend")).id;
    await db
      .update(sellers)
      .set({ paystackSubaccountCode: "ACCT_test123" })
      .where(eq(sellers.id, sellerId));
    variantId = (await createTestProduct(db, sellerId, { name: "Suya", priceKobo: 150_000 }))
      .variant.id;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId));
    await db.delete(sellers).where(eq(sellers.id, otherSellerId));
    await moduleRef.close();
  });

  async function awaitingOrder() {
    const order = await service.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      delivery: TEST_DELIVERY,
      items: [{ variantId, quantity: 1 }],
    });
    await service.transition({
      orderId: order.id,
      to: "awaiting_payment",
      actor: "seller",
      sellerId,
    });
    return order;
  }

  /** The resend jobs queued for this order. */
  async function resendJobs(orderId: string) {
    const jobs = await queue.getJobs(["waiting", "delayed", "active", "completed", "failed"]);
    const mine = [];
    for (const job of jobs) {
      if (job.id && job.id.startsWith(`resend-${orderId}-`)) {
        mine.push(job);
      }
    }
    return mine;
  }

  it("sends the payment request again, at most once every 10 minutes", async () => {
    const order = await awaitingOrder();
    const result = await service.resendPaymentRequest(sellerId, order.id);
    expect(result.nextAllowedAt).toBeDefined();
    const jobs = await resendJobs(order.id);
    expect(jobs).toHaveLength(1);
    expect(jobs[0]?.data).toMatchObject({
      kind: "order.payment_reminder",
      orderId: order.id,
      to: "awaiting_payment",
    });
    await expect(service.resendPaymentRequest(sellerId, order.id)).rejects.toBeInstanceOf(
      TooManyRequestsError,
    );
    expect(await resendJobs(order.id)).toHaveLength(1);
    await redis.del(`payment-resend:${order.id}`);
  });

  it("only for orders waiting for payment, and only the shop's own", async () => {
    const pending = await service.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      delivery: TEST_DELIVERY,
      items: [{ variantId, quantity: 1 }],
    });
    await expect(service.resendPaymentRequest(sellerId, pending.id)).rejects.toBeInstanceOf(
      ConflictException,
    );
    const order = await awaitingOrder();
    await expect(service.resendPaymentRequest(otherSellerId, order.id)).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });

  it("the seller's order view carries the pay link to copy while payment is due", async () => {
    const order = await awaitingOrder();
    const detail = await service.getForSeller(sellerId, order.id);
    expect(detail.payLink).toContain(`/pay/${order.code}`);
    expect(detail.payLink).toContain(`k=${detail.trackingKey}`);
    const pending = await service.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      delivery: TEST_DELIVERY,
      items: [{ variantId, quantity: 1 }],
    });
    expect((await service.getForSeller(sellerId, pending.id)).payLink).toBeNull();
  });
});
