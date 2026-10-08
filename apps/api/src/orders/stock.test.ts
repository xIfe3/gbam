/**
 * Integration test against the dev Postgres + Redis. Checks that stock goes down when an
 * order is paid, and never below zero.
 */
import "reflect-metadata";
import { orders, productVariants, products, sellers } from "@gbam/db";
import { InvalidOrderTransitionError } from "@gbam/shared";
import { Logger } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { createTestProduct, createTestSeller, TEST_DELIVERY } from "../test-helpers.js";
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
      delivery: TEST_DELIVERY,
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

    // Hold the variant row locked in a separate transaction so both payments are really
    // in flight (and waiting) at the same moment, then let them go.
    let release: () => void = () => {};
    const released = new Promise<void>((resolve) => {
      release = resolve;
    });
    let locked: () => void = () => {};
    const isLocked = new Promise<void>((resolve) => {
      locked = resolve;
    });
    const holder = db.transaction(async (tx) => {
      await tx
        .select({ id: productVariants.id })
        .from(productVariants)
        .where(eq(productVariants.id, variant.id))
        .for("update");
      locked();
      await released;
    });
    await isLocked;

    const logSpy = vi.spyOn(Logger.prototype, "error").mockImplementation(() => {});
    try {
      const payments = Promise.all([
        service.transition({ orderId: first.id, to: "paid", actor: "system" }),
        service.transition({ orderId: second.id, to: "paid", actor: "system" }),
      ]);
      await new Promise((resolve) => setTimeout(resolve, 500)); // let both reach the lock
      release();
      await holder;
      await payments;

      const messages = logSpy.mock.calls.map((call) => String(call[0]));
      const shortfallLogs = messages.filter((m) => m.includes("STOCK SHORTFALL"));
      expect(shortfallLogs).toHaveLength(1);
      expect(shortfallLogs[0]).toContain("NEEDS REFUND");
    } finally {
      logSpy.mockRestore();
    }

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

  it("bumps the product version when stock changes, but not for untracked stock", async () => {
    const tracked = await createTestProduct(db, sellerId, { stock: 5 });
    const untracked = await createTestProduct(db, sellerId, { stock: null });
    const trackedOrder = await placeOrder(tracked.variant.id, 1, "2348011110007");
    const untrackedOrder = await placeOrder(untracked.variant.id, 1, "2348011110008");
    await pay(trackedOrder.id);
    await pay(untrackedOrder.id);

    const trackedRows = await db
      .select({ version: products.version })
      .from(products)
      .where(eq(products.id, tracked.product.id));
    const untrackedRows = await db
      .select({ version: products.version })
      .from(products)
      .where(eq(products.id, untracked.product.id));
    expect(trackedRows[0]?.version).toBe(tracked.product.version + 1);
    expect(untrackedRows[0]?.version).toBe(untracked.product.version);
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
