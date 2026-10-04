/**
 * Integration test against the dev Postgres + Redis (pnpm db:up && pnpm db:migrate).
 * Each run creates its own seller, so it never collides with seed data.
 */
import "reflect-metadata";
import { orderEvents, products, sellers } from "@gbam/db";
import { InvalidOrderTransitionError } from "@gbam/shared";
import { ConflictException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { createTestSeller } from "../test-helpers.js";
import { OrdersModule } from "./orders.module.js";
import { OrdersService } from "./orders.service.js";

process.loadEnvFile?.("../../.env");

describe("OrdersService (integration)", () => {
  let moduleRef: TestingModule;
  let service: OrdersService;
  let db: Db;
  let sellerId: string;
  let slug: string;
  let productId: string;

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
    const [product] = await db
      .insert(products)
      .values({ sellerId, name: "Suya", priceKobo: 150_000 })
      .returning();
    productId = product!.id;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId)); // cascades to everything
    await moduleRef.close();
  });

  const placeOrder = () =>
    service.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      items: [
        { productId, quantity: 2 },
        { productId, quantity: 1 }, // duplicate line gets merged
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

  it("does not let a seller mark an order paid, but lets the system", async () => {
    const { id } = await placeOrder();
    await service.transition({ orderId: id, to: "awaiting_payment", actor: "seller", sellerId });

    await expect(
      service.transition({ orderId: id, to: "paid", actor: "seller", sellerId }),
    ).rejects.toBeInstanceOf(InvalidOrderTransitionError);

    const paid = await service.transition({ orderId: id, to: "paid", actor: "system" });
    expect(paid.status).toBe("paid");
  });

  it("blocks requesting payment until the seller has a payout account", async () => {
    await db.update(sellers).set({ paystackSubaccountCode: null }).where(eq(sellers.id, sellerId));
    try {
      const { id } = await placeOrder();

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

  it("rejects products from another store", async () => {
    await expect(
      service.createFromStorefront(slug, {
        customer: { name: "Ada", phone: "2348011112222" },
        items: [{ productId: randomUUID(), quantity: 1 }],
      }),
    ).rejects.toThrow("unavailable");
  });
});
