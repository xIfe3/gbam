/**
 * Integration test against the dev Postgres + Redis (pnpm db:up && pnpm db:migrate).
 * Each run creates its own seller, so it never collides with seed data.
 */
import "reflect-metadata";
import { orderEvents, products, sellers } from "@gbam/db";
import { InvalidOrderTransitionError } from "@gbam/shared";
import { NotFoundException } from "@nestjs/common";
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
