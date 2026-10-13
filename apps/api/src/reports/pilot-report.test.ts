/** Integration test against the dev Postgres (db 1 for Redis): the pilot report's numbers. */
import "reflect-metadata";
import { dailyVisits, orderEvents, orders, payments, sellers } from "@gbam/db";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { lagosDay } from "../platform/visits.service.js";
import {
  addTestPayoutAccount,
  createTestProduct,
  createTestSeller,
  TEST_DELIVERY,
} from "../test-helpers.js";
import { pilotReport } from "./pilot-report.js";

process.loadEnvFile?.("../../.env");

describe("pilot report (integration)", () => {
  let moduleRef: TestingModule;
  let db: Db;
  let ordersService: OrdersService;
  let seller: Awaited<ReturnType<typeof createTestSeller>>;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, OrdersModule] }).compile();
    db = moduleRef.get(DB);
    ordersService = moduleRef.get(OrdersService);

    seller = await createTestSeller(db, "pilotreport");
    await addTestPayoutAccount(db, seller.id);
    await db
      .update(sellers)
      .set({ approveOrdersFirst: false, signupSource: "shop-mama-ngozi" })
      .where(eq(sellers.id, seller.id));
    const { variant } = await createTestProduct(db, seller.id, { priceKobo: 500_000 });

    // 12 shop visits today.
    await db.insert(dailyVisits).values({
      day: lagosDay(new Date()),
      sellerId: seller.id,
      kind: "storefront",
      visits: 12,
    });

    // Three orders: Ada pays twice, Bisi never pays.
    const place = (name: string, phone: string) =>
      ordersService.createFromStorefront(seller.slug, {
        customer: { name, phone },
        delivery: TEST_DELIVERY,
        items: [{ variantId: variant.id, quantity: 1 }],
      });
    const adaFirst = await place("Ada", "2348011110001");
    const adaSecond = await place("Ada", "2348011110001");
    await place("Bisi", "2348011110002");
    // The seller trying their own shop: not a real customer, so the report leaves it out.
    await place("Me testing", seller.whatsappPhone);

    for (const order of [adaFirst, adaSecond]) {
      await db.insert(payments).values({
        orderId: order.id,
        reference: `gbam_${order.code}_${randomUUID().slice(0, 8)}`,
        amountKobo: order.totalKobo,
        platformFeeKobo: 7_500,
        status: "success",
      });
      await ordersService.transition({ orderId: order.id, to: "paid", actor: "system" });
    }
    // The first order was paid 10 minutes after it was placed, the second after 20.
    await paidMinutesAfterPlacing(adaFirst.id, 10);
    await paidMinutesAfterPlacing(adaSecond.id, 20);
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, seller.id)); // cascades to everything
    await moduleRef.close();
  });

  /** Moves the "paid" event so it lands `minutes` after the order was placed. */
  async function paidMinutesAfterPlacing(orderId: string, minutes: number) {
    const rows = await db
      .select({ createdAt: orders.createdAt })
      .from(orders)
      .where(eq(orders.id, orderId));
    const placedAt = rows[0]?.createdAt;
    if (!placedAt) {
      throw new Error("order not found");
    }
    await db
      .update(orderEvents)
      .set({ createdAt: new Date(placedAt.getTime() + minutes * 60 * 1000) })
      .where(and(eq(orderEvents.orderId, orderId), eq(orderEvents.toStatus, "paid")));
  }

  it("counts one shop's funnel since the start date", async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const report = await pilotReport(db, since);
    const row = report.shops.find((shop) => shop.slug === seller.slug);
    expect(row).toEqual({
      slug: seller.slug,
      signupSource: "shop-mama-ngozi",
      shopVisits: 12,
      ordersPlaced: 3,
      paymentRequested: 3,
      ordersPaid: 2,
      paidPercent: 67,
      medianMinutesToPay: 15,
      repeatCustomers: 1,
      gbamFeeKobo: 15_000,
    });
  });

  it("counts the day-30 gate: shops with 2 or more paid orders", async () => {
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const report = await pilotReport(db, since);
    // Other test files may add shops at the same time, so only check this one is counted.
    expect(report.shopsWithRepeatPaidOrders).toBeGreaterThanOrEqual(1);
    expect(report.shopsWithRepeatPaidOrders).toBeLessThanOrEqual(report.shops.length);
  });
});
