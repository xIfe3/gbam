/**
 * Integration test against the dev Postgres + Redis. Checks that stock goes down when an
 * order is paid, and never below zero.
 */
import "reflect-metadata";
import { orders, productVariants, sellers } from "@gbam/db";
import { InvalidOrderTransitionError } from "@gbam/shared";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { createTestProduct, createTestSeller } from "../test-helpers.js";
import { OrdersModule } from "./orders.module.js";
import { OrdersService } from "./orders.service.js";

process.loadEnvFile?.("../../.env");

describe("stock reduction on payment (integration)", () => {
  let moduleRef: TestingModule;
  let service: OrdersService;
  let db: Db;
  let sellerId: string;
  let slug: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, OrdersModule] }).compile();
    moduleRef.enableShutdownHooks();
    service = moduleRef.get(OrdersService);
    db = moduleRef.get(DB);
    const seller = await createTestSeller(db, "stock");
    sellerId = seller.id;
    slug = seller.slug;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId));
    await moduleRef.close();
  });

  async function placeOrder(variantId: string, quantity: number, phone: string) {
    return service.createFromStorefront(slug, {
      customer: { name: "Ada", phone },
      items: [{ variantId, quantity }],
    });
  }

  /** Moves a pending order to paid the way the webhook does (system actor). */
  async function pay(orderId: string) {
    await service.transition({ orderId, to: "awaiting_payment", actor: "system" });
    return service.transition({ orderId, to: "paid", actor: "system" });
  }

  async function stockOf(variantId: string) {
    const rows = await db
      .select({ stock: productVariants.stock })
      .from(productVariants)
      .where(eq(productVariants.id, variantId));
    const row = rows[0];
    if (!row) {
      throw new Error("variant missing");
    }
    return row.stock;
  }

  async function shortfallOf(orderId: string) {
    const rows = await db
      .select({ flag: orders.stockShortfall })
      .from(orders)
      .where(eq(orders.id, orderId));
    const row = rows[0];
    if (!row) {
      throw new Error("order missing");
    }
    return row.flag;
  }

  it("reduces tracked stock when the order is paid", async () => {
    const { variant } = await createTestProduct(db, sellerId, { stock: 5 });
    const order = await placeOrder(variant.id, 2, "2348011110001");
    expect(await stockOf(variant.id)).toBe(5); // not reduced until payment
    await pay(order.id);
    expect(await stockOf(variant.id)).toBe(3);
    expect(await shortfallOf(order.id)).toBe(false);
  });

  it("leaves untracked stock as null", async () => {
    const { variant } = await createTestProduct(db, sellerId, { stock: null });
    const order = await placeOrder(variant.id, 2, "2348011110002");
    await pay(order.id);
    expect(await stockOf(variant.id)).toBeNull();
    expect(await shortfallOf(order.id)).toBe(false);
  });

  it("sets stock to 0 and flags a shortfall when the order is bigger than the stock", async () => {
    const { variant } = await createTestProduct(db, sellerId, { stock: 3 });
    const order = await placeOrder(variant.id, 3, "2348011110003");
    // Stock dropped between ordering and paying (e.g. another payment took some).
    await db.update(productVariants).set({ stock: 2 }).where(eq(productVariants.id, variant.id));
    await pay(order.id);
    expect(await stockOf(variant.id)).toBe(0);
    expect(await shortfallOf(order.id)).toBe(true);
  });

  it("two customers for the last unit: one gets it, the other is flagged, stock stays 0", async () => {
    const { variant } = await createTestProduct(db, sellerId, { stock: 1 });
    const first = await placeOrder(variant.id, 1, "2348011110004");
    const second = await placeOrder(variant.id, 1, "2348011110005");
    await service.transition({ orderId: first.id, to: "awaiting_payment", actor: "system" });
    await service.transition({ orderId: second.id, to: "awaiting_payment", actor: "system" });

    // Both payments arrive at the same moment.
    await Promise.all([
      service.transition({ orderId: first.id, to: "paid", actor: "system" }),
      service.transition({ orderId: second.id, to: "paid", actor: "system" }),
    ]);

    expect(await stockOf(variant.id)).toBe(0);
    const flags = [await shortfallOf(first.id), await shortfallOf(second.id)];
    const flagged = [];
    for (const flag of flags) {
      if (flag === true) {
        flagged.push(flag);
      }
    }
    expect(flagged).toHaveLength(1);
  });

  it("a duplicate paid webhook does not reduce stock twice", async () => {
    const { variant } = await createTestProduct(db, sellerId, { stock: 5 });
    const order = await placeOrder(variant.id, 2, "2348011110006");
    await pay(order.id);
    await expect(
      service.transition({ orderId: order.id, to: "paid", actor: "system" }),
    ).rejects.toBeInstanceOf(InvalidOrderTransitionError);
    expect(await stockOf(variant.id)).toBe(3);
  });
});
