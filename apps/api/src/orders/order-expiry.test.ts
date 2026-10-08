/**
 * Integration test against the dev Postgres + Redis (pnpm db:up && pnpm db:migrate).
 * Each run creates its own seller, so it never collides with seed data.
 */
import "reflect-metadata";
import { orderEvents, orders, sellers } from "@gbam/db";
import { getQueueToken } from "@nestjs/bullmq";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Queue } from "bullmq";
import { and, desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { NOTIFICATIONS_QUEUE } from "../notifications/notifications.queue.js";
import { createTestProduct, createTestSeller, TEST_DELIVERY } from "../test-helpers.js";
import { OrderExpiryService } from "./order-expiry.service.js";
import { OrdersModule } from "./orders.module.js";
import { OrdersService } from "./orders.service.js";

process.loadEnvFile?.("../../.env");

const HOUR_MS = 60 * 60 * 1000;

describe("OrderExpiryService (integration)", () => {
  let moduleRef: TestingModule;
  let expiry: OrderExpiryService;
  let ordersService: OrdersService;
  let db: Db;
  let notifications: Queue;
  let sellerId: string;
  let slug: string;
  let variantId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, OrdersModule] }).compile();
    moduleRef.enableShutdownHooks();
    expiry = moduleRef.get(OrderExpiryService);
    ordersService = moduleRef.get(OrdersService);
    db = moduleRef.get(DB);
    notifications = moduleRef.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));

    const seller = await createTestSeller(db, "expiry");
    sellerId = seller.id;
    slug = seller.slug;
    await db
      .update(sellers)
      .set({ paystackSubaccountCode: "ACCT_test123" })
      .where(eq(sellers.id, sellerId));
    const created = await createTestProduct(db, sellerId, { name: "Chin chin" });
    variantId = created.variant.id;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId)); // cascades to everything
    await moduleRef.close();
  });

  /** An order that has been waiting for payment for `hoursAgo` hours. */
  async function orderAwaitingPaymentSince(hoursAgo: number): Promise<string> {
    const order = await ordersService.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      delivery: TEST_DELIVERY,
      items: [{ variantId, quantity: 1 }],
    });
    await ordersService.transition({
      orderId: order.id,
      to: "awaiting_payment",
      actor: "seller",
      sellerId,
    });
    // Pretend the payment request went out `hoursAgo` hours ago.
    const then = new Date(Date.now() - hoursAgo * HOUR_MS);
    await db
      .update(orderEvents)
      .set({ createdAt: then })
      .where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.toStatus, "awaiting_payment")));
    return order.id;
  }

  async function statusOf(orderId: string) {
    const rows = await db.select().from(orders).where(eq(orders.id, orderId));
    const row = rows[0];
    if (!row) {
      throw new Error("order not found");
    }
    return row;
  }

  it("leaves an order alone for its first 24 hours", async () => {
    const orderId = await orderAwaitingPaymentSince(2);
    await expiry.sendDueReminders(new Date());
    await expiry.expireOverdue(new Date());

    const order = await statusOf(orderId);
    expect(order.status).toBe("awaiting_payment");
    expect(order.paymentReminderSentAt).toBeNull();
    expect(await notifications.getJob(`reminder-${orderId}`)).toBeUndefined();
  });

  it("sends one payment reminder after 24 hours, never two", async () => {
    const orderId = await orderAwaitingPaymentSince(25);

    await expiry.sendDueReminders(new Date());
    const order = await statusOf(orderId);
    expect(order.paymentReminderSentAt).toBeInstanceOf(Date);
    const job = await notifications.getJob(`reminder-${orderId}`);
    expect(job?.data).toMatchObject({ orderId, to: "awaiting_payment" });

    // A second run finds nothing new to remind.
    const remindedAgain = await expiry.sendDueReminders(new Date());
    expect(remindedAgain).not.toContain(orderId);
  });

  it("cancels an order still unpaid after 48 hours, as the system", async () => {
    const orderId = await orderAwaitingPaymentSince(49);

    const cancelled = await expiry.expireOverdue(new Date());
    expect(cancelled).toContain(orderId);

    const order = await statusOf(orderId);
    expect(order.status).toBe("cancelled");
    const events = await db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(desc(orderEvents.createdAt))
      .limit(1);
    expect(events[0]).toMatchObject({ toStatus: "cancelled", actor: "system" });
  });

  it("never touches an order that was paid", async () => {
    const orderId = await orderAwaitingPaymentSince(49);
    await ordersService.transition({ orderId, to: "paid", actor: "system" });

    await expiry.sendDueReminders(new Date());
    const cancelled = await expiry.expireOverdue(new Date());

    expect(cancelled).not.toContain(orderId);
    expect((await statusOf(orderId)).status).toBe("paid");
  });
});
