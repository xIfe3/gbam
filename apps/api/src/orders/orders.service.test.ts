/**
 * Integration test against the dev Postgres + Redis (pnpm db:up && pnpm db:migrate).
 * Each run creates its own seller, so it never collides with seed data.
 */
import "reflect-metadata";
import { orderEvents, payments, productVariants, products, sellers, users } from "@gbam/db";
import { createOrderSchema, InvalidOrderTransitionError } from "@gbam/shared";
import { getQueueToken } from "@nestjs/bullmq";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import type { Queue } from "bullmq";
import { randomUUID } from "node:crypto";
import { desc, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EMAILS_QUEUE } from "../email/email.queue.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { NOTIFICATIONS_QUEUE } from "../notifications/notifications.queue.js";
import {
  addTestPayoutAccount,
  createTestProduct,
  createTestSeller,
  TEST_DELIVERY,
} from "../test-helpers.js";
import { OrdersModule } from "./orders.module.js";
import { OrdersService } from "./orders.service.js";

process.loadEnvFile?.("../../.env");

describe("OrdersService (integration)", () => {
  let moduleRef: TestingModule;
  let service: OrdersService;
  let db: Db;
  let sellerId: string;
  let slug: string;
  let variantId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, OrdersModule] }).compile();
    moduleRef.enableShutdownHooks();
    service = moduleRef.get(OrdersService);
    db = moduleRef.get(DB);

    const seller = await createTestSeller(db, "test");
    slug = seller.slug;
    sellerId = seller.id;
    // Sellers need a payout account before they can request payment (one test removes it).
    await db
      .update(sellers)
      .set({ paystackSubaccountCode: "ACCT_test123" })
      .where(eq(sellers.id, sellerId));
    const created = await createTestProduct(db, sellerId, { name: "Suya", priceKobo: 150_000 });
    variantId = created.variant.id;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId)); // cascades to everything
    await moduleRef.close();
  });

  const placeOrder = () =>
    service.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      delivery: TEST_DELIVERY,
      items: [
        { variantId, quantity: 2 },
        { variantId, quantity: 1 }, // duplicate line gets merged
      ],
    });

  it("creates a pending order priced from the DB, with an audit event", async () => {
    const order = await placeOrder();
    expect(order.status).toBe("pending");
    expect(order.totalKobo).toBe(450_000);
    expect(order.code).toMatch(/^GB-[2-9A-Z]{4}$/);

    const detail = await service.getForSeller(sellerId, order.id);
    expect(detail.items).toHaveLength(1);
    expect(detail.items[0]!.quantity).toBe(3);
    expect(detail.allowedTransitions).toEqual(["awaiting_payment", "cancelled"]);
    expect(detail.events.map((e) => e.toStatus)).toEqual(["pending"]);
  });

  it("refuses to mark an order refunded when it has no successful payment", async () => {
    const { id } = await placeOrder();
    await service.transition({ orderId: id, to: "cancelled", actor: "seller", sellerId });
    await expect(
      service.transition({ orderId: id, to: "refunded", actor: "seller", sellerId }),
    ).rejects.toThrow(/no successful payment/);
  });

  it("marks a paid-then-cancelled order refunded", async () => {
    const { id } = await placeOrder();
    await service.transition({ orderId: id, to: "cancelled", actor: "seller", sellerId });
    // The customer paid anyway (the webhook logs NEEDS REFUND and leaves it cancelled).
    await db.insert(payments).values({
      orderId: id,
      reference: `test-ref-${id}`,
      amountKobo: 450_000,
      status: "success",
    });
    const order = await service.transition({
      orderId: id,
      to: "refunded",
      actor: "seller",
      sellerId,
    });
    expect(order.status).toBe("refunded");
  });

  it("does not let a seller mark an order paid, but lets the system", async () => {
    const { id } = await placeOrder();
    await service.transition({ orderId: id, to: "awaiting_payment", actor: "seller", sellerId });

    await expect(
      service.transition({ orderId: id, to: "paid", actor: "seller", sellerId }),
    ).rejects.toBeInstanceOf(InvalidOrderTransitionError);

    const paid = await service.transition({ orderId: id, to: "paid", actor: "system" });
    expect(paid.status).toBe("paid");
  });

  it("refuses new orders while the shop has no payout account", async () => {
    await db.update(sellers).set({ paystackSubaccountCode: null }).where(eq(sellers.id, sellerId));
    try {
      let caught: unknown = null;
      try {
        await placeOrder();
      } catch (error) {
        caught = error;
      }
      // The customer could never pay, so the order is refused up front.
      expect(caught).toBeInstanceOf(ConflictException);
      const body = (caught as ConflictException).getResponse();
      expect(body).toMatchObject({ code: "SHOP_NOT_READY" });
    } finally {
      await db
        .update(sellers)
        .set({ paystackSubaccountCode: "ACCT_test123" })
        .where(eq(sellers.id, sellerId));
    }
  });

  it("blocks requesting payment until the seller has a payout account", async () => {
    // The order was placed while the shop had an account; the account was removed after.
    const { id } = await placeOrder();
    await db.update(sellers).set({ paystackSubaccountCode: null }).where(eq(sellers.id, sellerId));
    try {
      let caught: unknown = null;
      try {
        await service.transition({
          orderId: id,
          to: "awaiting_payment",
          actor: "seller",
          sellerId,
        });
      } catch (error) {
        caught = error;
      }

      expect(caught).toBeInstanceOf(ConflictException);
      const body = (caught as ConflictException).getResponse();
      expect(body).toMatchObject({ code: "PAYOUT_ACCOUNT_REQUIRED" });
      // Nothing changed: still pending, no new history entry.
      const detail = await service.getForSeller(sellerId, id);
      expect(detail.status).toBe("pending");
      expect(detail.events.map((e) => e.toStatus)).toEqual(["pending"]);

      // Other moves still work, and the system (not a seller) isn't affected.
      const system = await service.transition({
        orderId: id,
        to: "awaiting_payment",
        actor: "system",
      });
      expect(system.status).toBe("awaiting_payment");
    } finally {
      await db
        .update(sellers)
        .set({ paystackSubaccountCode: "ACCT_test123" })
        .where(eq(sellers.id, sellerId));
    }
  });

  it("lets a seller with a payout account request payment", async () => {
    const { id } = await placeOrder();
    const moved = await service.transition({
      orderId: id,
      to: "awaiting_payment",
      actor: "seller",
      sellerId,
    });
    expect(moved.status).toBe("awaiting_payment");
  });

  it("lets exactly one of two concurrent identical transitions win", async () => {
    const { id } = await placeOrder();
    const results = await Promise.allSettled([
      service.transition({ orderId: id, to: "cancelled", actor: "seller", sellerId }),
      service.transition({ orderId: id, to: "cancelled", actor: "seller", sellerId }),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);

    const events = await db.select().from(orderEvents).where(eq(orderEvents.orderId, id));
    expect(events.filter((e) => e.toStatus === "cancelled")).toHaveLength(1);
  });

  it("hides other sellers' orders", async () => {
    const { id } = await placeOrder();
    await expect(service.getForSeller(randomUUID(), id)).rejects.toBeInstanceOf(NotFoundException);
    await expect(
      service.transition({ orderId: id, to: "cancelled", actor: "seller", sellerId: randomUUID() }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses orders for a closed shop", async () => {
    const closed = await createTestSeller(db, "closed");
    try {
      const created = await createTestProduct(db, closed.id, { name: "Zobo" });
      await db.update(sellers).set({ closedAt: new Date() }).where(eq(sellers.id, closed.id));
      await expect(
        service.createFromStorefront(closed.slug, {
          customer: { name: "Ada", phone: "2348011112222" },
          delivery: TEST_DELIVERY,
          items: [{ variantId: created.variant.id, quantity: 1 }],
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
    } finally {
      await db.delete(sellers).where(eq(sellers.id, closed.id));
    }
  });

  it("rejects variants that do not exist", async () => {
    await expect(
      service.createFromStorefront(slug, {
        customer: { name: "Ada", phone: "2348011112222" },
        delivery: TEST_DELIVERY,
        items: [{ variantId: randomUUID(), quantity: 1 }],
      }),
    ).rejects.toThrow("unavailable");
  });

  const customer = { name: "Ada", phone: "2348011112222" };

  async function expectRejected(variant: string, quantity: number, text: string) {
    await expect(
      service.createFromStorefront(slug, {
        customer,
        delivery: TEST_DELIVERY,
        items: [{ variantId: variant, quantity }],
      }),
    ).rejects.toThrow(text);
  }

  it("rejects disabled, archived, hidden-product and other-shop variants", async () => {
    const disabled = await createTestProduct(db, sellerId, { name: "Zobo" });
    await db
      .update(productVariants)
      .set({ isEnabled: false })
      .where(eq(productVariants.id, disabled.variant.id));
    await expectRejected(disabled.variant.id, 1, "Zobo is no longer available");

    const archived = await createTestProduct(db, sellerId);
    await db
      .update(productVariants)
      .set({ archivedAt: new Date() })
      .where(eq(productVariants.id, archived.variant.id));
    await expectRejected(archived.variant.id, 1, "is no longer available");

    const hidden = await createTestProduct(db, sellerId, { status: "hidden" });
    await expectRejected(hidden.variant.id, 1, "is no longer available");

    const otherSeller = await createTestSeller(db, "other");
    try {
      const theirs = await createTestProduct(db, otherSeller.id);
      await expectRejected(theirs.variant.id, 1, "unavailable");
    } finally {
      await db.delete(sellers).where(eq(sellers.id, otherSeller.id));
    }
  });

  it("names the product and variant that is no longer available", async () => {
    const dress = await createTestProduct(db, sellerId, { name: "Ankara Dress" });
    await db
      .update(productVariants)
      .set({ title: "Large", isEnabled: false })
      .where(eq(productVariants.id, dress.variant.id));
    await expectRejected(dress.variant.id, 1, "Ankara Dress – Large is no longer available");
  });

  it("rejects more than 99 of one variant, including across merged lines", async () => {
    await expectRejected(variantId, 100, "at most 99");
    await expect(
      service.createFromStorefront(slug, {
        customer,
        delivery: TEST_DELIVERY,
        items: [
          { variantId, quantity: 60 },
          { variantId, quantity: 60 },
        ],
      }),
    ).rejects.toMatchObject({ response: { field: "items" } });
    expect(
      createOrderSchema.safeParse({
        customer,
        delivery: TEST_DELIVERY,
        items: [{ variantId, quantity: 100 }],
      }).success,
    ).toBe(false);
  });

  it("waits for a product save instead of deadlocking, and keeps the variant", async () => {
    const made = await createTestProduct(db, sellerId, { name: "Locked", stock: 5 });
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => {};
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    // Pretend to be a product save: product row locked FOR UPDATE, then variants touched.
    const save = db.transaction(async (tx) => {
      await tx
        .select({ id: products.id })
        .from(products)
        .where(eq(products.id, made.product.id))
        .for("update");
      locked();
      await released;
      await tx
        .update(productVariants)
        .set({ stock: 4 })
        .where(eq(productVariants.id, made.variant.id));
    });
    await isLocked;

    const placing = service.createFromStorefront(slug, {
      customer,
      delivery: TEST_DELIVERY,
      items: [{ variantId: made.variant.id, quantity: 1 }],
    });
    await new Promise((resolve) => setTimeout(resolve, 300)); // placement is now waiting
    release();
    await save;
    const order = await placing;

    const detail = await service.getForSeller(sellerId, order.id);
    expect(detail.items[0]?.variantId).toBe(made.variant.id);
  });

  it("rejects more than the tracked stock, and says sold out at 0", async () => {
    const some = await createTestProduct(db, sellerId, { name: "Zobo", stock: 2 });
    await expectRejected(some.variant.id, 3, "Zobo has only 2 left");

    const none = await createTestProduct(db, sellerId, { name: "Chapman", stock: 0 });
    await expectRejected(none.variant.id, 1, "Chapman is sold out");
  });

  it("names the variant after an en dash when it has a title", async () => {
    const made = await createTestProduct(db, sellerId, { name: "Tee", stock: 1 });
    await db
      .update(productVariants)
      .set({ title: "Large" })
      .where(eq(productVariants.id, made.variant.id));
    await expectRejected(made.variant.id, 2, "Tee – Large has only 1 left");
  });

  it("stores the variant title and the variant's price on the item", async () => {
    const made = await createTestProduct(db, sellerId, { name: "Hat", priceKobo: 77_000 });
    await db
      .update(productVariants)
      .set({ title: "Red" })
      .where(eq(productVariants.id, made.variant.id));
    const order = await service.createFromStorefront(slug, {
      customer,
      delivery: TEST_DELIVERY,
      items: [{ variantId: made.variant.id, quantity: 2 }],
    });
    const detail = await service.getForSeller(sellerId, order.id);
    const item = detail.items[0];
    expect(item?.variantTitle).toBe("Red");
    expect(item?.unitPriceKobo).toBe(77_000);
    expect(item?.productId).toBe(made.product.id);
    expect(item?.variantId).toBe(made.variant.id);
    expect(item?.productName).toBe("Hat");
    expect(detail.stockShortfall).toBe(false);
  });
});

describe("OrdersService emails (integration)", () => {
  let moduleRef: TestingModule;
  let service: OrdersService;
  let db: Db;
  let emailQueue: Queue;
  let sellerId: string;
  let slug: string;
  let userId: string;
  let variantId: string;
  const ownerEmail = `owner-${randomUUID().slice(0, 8)}@example.com`;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, OrdersModule] }).compile();
    moduleRef.enableShutdownHooks();
    service = moduleRef.get(OrdersService);
    db = moduleRef.get(DB);
    // The BullMQ queue itself, so we can look up the jobs the service added.
    emailQueue = moduleRef.get<Queue>(getQueueToken(EMAILS_QUEUE));

    // These emails go to the shop's owner, so this shop needs a user who owns it.
    const userRows = await db
      .insert(users)
      .values({ email: ownerEmail, passwordHash: "not-a-real-hash" })
      .returning({ id: users.id });
    const user = userRows[0];
    if (!user) {
      throw new Error("Failed to create the test user");
    }
    userId = user.id;

    const seller = await createTestSeller(db, "emails");
    slug = seller.slug;
    sellerId = seller.id;
    await db
      .update(sellers)
      .set({ ownerUserId: userId, paystackSubaccountCode: "ACCT_test123" })
      .where(eq(sellers.id, sellerId));
    const created = await createTestProduct(db, sellerId, { name: "Puff-puff" });
    variantId = created.variant.id;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId)); // cascades to everything
    await db.delete(users).where(eq(users.id, userId));
    await moduleRef.close();
  });

  const placeOrder = () =>
    service.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222", email: "ada@example.com" },
      delivery: TEST_DELIVERY,
      items: [{ variantId, quantity: 1 }],
    });

  /** The id of the newest status event for an order (the emails' job ids use it). */
  async function latestEventId(orderId: string): Promise<string> {
    const rows = await db
      .select({ id: orderEvents.id })
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(desc(orderEvents.createdAt))
      .limit(1);
    const event = rows[0];
    if (!event) {
      throw new Error("Expected the order to have an event");
    }
    return event.id;
  }

  it("emails the owner about a new order", async () => {
    const order = await placeOrder();

    const job = await emailQueue.getJob(`new-order-${order.id}`);
    expect(job?.data).toMatchObject({ kind: "new_order", to: ownerEmail, code: order.code });
  });

  it("sends no new-order email when the owner turned them off", async () => {
    await db.update(sellers).set({ newOrderEmails: false }).where(eq(sellers.id, sellerId));
    try {
      const order = await placeOrder();
      const job = await emailQueue.getJob(`new-order-${order.id}`);
      expect(job).toBeUndefined();
    } finally {
      await db.update(sellers).set({ newOrderEmails: true }).where(eq(sellers.id, sellerId));
    }
  });

  it("emails both sides when an order is paid", async () => {
    const order = await placeOrder();
    await service.transition({
      orderId: order.id,
      to: "awaiting_payment",
      actor: "seller",
      sellerId,
    });
    await service.transition({ orderId: order.id, to: "paid", actor: "system" });
    const eventId = await latestEventId(order.id);

    const toSeller = await emailQueue.getJob(`paid-seller-${eventId}`);
    expect(toSeller?.data).toMatchObject({ kind: "payment_received", to: ownerEmail });
    const toCustomer = await emailQueue.getJob(`paid-customer-${eventId}`);
    expect(toCustomer?.data).toMatchObject({ kind: "payment_confirmed", to: "ada@example.com" });
  });

  it("the customer's paid email says how they paid, with the Paystack reference", async () => {
    const order = await placeOrder();
    await service.transition({
      orderId: order.id,
      to: "awaiting_payment",
      actor: "seller",
      sellerId,
    });
    // What PaymentsService.confirm() saves just before it marks the order paid.
    const reference = `gbam_${order.code}_0badf00d`;
    await db.insert(payments).values({
      orderId: order.id,
      reference,
      amountKobo: order.totalKobo,
      status: "success",
      method: "bank_transfer",
    });
    await service.transition({ orderId: order.id, to: "paid", actor: "system" });
    const eventId = await latestEventId(order.id);

    const toCustomer = await emailQueue.getJob(`paid-customer-${eventId}`);
    expect(toCustomer?.data).toMatchObject({
      kind: "payment_confirmed",
      paidWith: "Bank transfer",
      paymentReference: reference,
    });
  });

  it("emails the customer when the order is cancelled", async () => {
    const order = await placeOrder();
    await service.transition({ orderId: order.id, to: "cancelled", actor: "seller", sellerId });
    const eventId = await latestEventId(order.id);

    const job = await emailQueue.getJob(`cancelled-${eventId}`);
    expect(job?.data).toMatchObject({ kind: "order_cancelled", to: "ada@example.com" });
  });

  it("emails support when a paid order needs a refund", async () => {
    const order = await placeOrder();
    await service.emailSupportNeedsRefund(order.id, "Test reason", "gbam_test_ref");

    const job = await emailQueue.getJob("needs-refund-gbam_test_ref");
    expect(job?.data).toMatchObject({
      kind: "needs_refund",
      orderCode: order.code,
      reason: "Test reason",
    });
    // Remove it so the next run can add it again under the same id.
    await job?.remove();
  });
});

describe("Instant pay: customers can pay the moment they order (integration)", () => {
  let moduleRef: TestingModule;
  let service: OrdersService;
  let db: Db;
  let notifications: Queue;
  let sellerId: string;
  let slug: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, OrdersModule] }).compile();
    moduleRef.enableShutdownHooks();
    service = moduleRef.get(OrdersService);
    db = moduleRef.get(DB);
    notifications = moduleRef.get<Queue>(getQueueToken(NOTIFICATIONS_QUEUE));

    const seller = await createTestSeller(db, "instant");
    sellerId = seller.id;
    slug = seller.slug;
    await addTestPayoutAccount(db, sellerId);
    // The real default for new shops: no approving each order first.
    await db.update(sellers).set({ approveOrdersFirst: false }).where(eq(sellers.id, sellerId));
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId)); // cascades to everything
    await moduleRef.close();
  });

  function order(variantId: string, quantity: number) {
    return service.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      delivery: TEST_DELIVERY,
      items: [{ variantId, quantity }],
    });
  }

  /** The order's status-change events, oldest first. */
  async function eventsOf(orderId: string) {
    return db
      .select()
      .from(orderEvents)
      .where(eq(orderEvents.orderId, orderId))
      .orderBy(orderEvents.createdAt);
  }

  it("a new order is waiting for payment straight away, asked for by the system", async () => {
    const { variant } = await createTestProduct(db, sellerId, { name: "Puff puff" });
    const placed = await order(variant.id, 1);
    expect(placed.status).toBe("awaiting_payment");

    const events = await eventsOf(placed.id);
    expect(events.map((e) => e.toStatus)).toEqual(["pending", "awaiting_payment"]);
    expect(events[1]).toMatchObject({ actor: "system" });
  });

  it("sends only the payment request, not a separate 'order received' message", async () => {
    const { variant } = await createTestProduct(db, sellerId, { name: "Meat pie" });
    const placed = await order(variant.id, 1);
    const events = await eventsOf(placed.id);
    const pendingEvent = events[0];
    const awaitingEvent = events[1];
    if (!pendingEvent || !awaitingEvent) {
      throw new Error("Expected two events");
    }
    // Each status message is queued under its event's id.
    expect(await notifications.getJob(pendingEvent.id)).toBeUndefined();
    const paymentRequest = await notifications.getJob(awaitingEvent.id);
    expect(paymentRequest?.data).toMatchObject({ orderId: placed.id, to: "awaiting_payment" });
    await paymentRequest?.remove();
  });

  it("holds stock while a customer is paying, so the last one can't be sold twice", async () => {
    const { variant } = await createTestProduct(db, sellerId, { name: "Cake", stock: 1 });
    const first = await order(variant.id, 1);

    // The only cake is held for the first customer.
    await expect(order(variant.id, 1)).rejects.toThrow(/sold out/);

    // The first customer gives up: the cake is free again.
    await service.transition({ orderId: first.id, to: "cancelled", actor: "system" });
    const second = await order(variant.id, 1);
    expect(second.status).toBe("awaiting_payment");
  });

  it("a shop that approves orders first keeps new orders pending", async () => {
    await db.update(sellers).set({ approveOrdersFirst: true }).where(eq(sellers.id, sellerId));
    try {
      const { variant } = await createTestProduct(db, sellerId, { name: "Wedding cake" });
      const placed = await order(variant.id, 1);
      expect(placed.status).toBe("pending");
      const events = await eventsOf(placed.id);
      expect(events.map((e) => e.toStatus)).toEqual(["pending"]);
    } finally {
      await db.update(sellers).set({ approveOrdersFirst: false }).where(eq(sellers.id, sellerId));
    }
  });
});
