/** Integration test over HTTP against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { deliveryZones, payments, sellers } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailQueue } from "../email/email.queue.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { createTestProduct, createTestSeller } from "../test-helpers.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminTestData, callAdmin, listen, type TestAdmin } from "./admin-test-helpers.js";
import { AdminModule } from "./admin.module.js";

process.loadEnvFile?.("../../.env");

type Money = {
  totals: {
    salesKobo: number;
    itemsKobo: number;
    deliveryKobo: number;
    gbamFeesKobo: number;
    paystackFeesKobo: number;
    refundsKobo: number;
    paidOrders: number;
  };
  byDay: { day: string; salesKobo: number; paidOrders: number }[];
  byShop: {
    shopId: string;
    shopName: string;
    salesKobo: number;
    paidOrders: number;
    gbamFeesKobo: number;
  }[];
};

/** Today in Lagos as "YYYY-MM-DD". */
function lagosToday(): string {
  return new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
}

describe("Admin money (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let data: AdminTestData;
  let orders: OrdersService;
  let finance: TestAdmin;
  let support: TestAdmin;
  let sellerId: string;
  let slug: string;
  let variantId: string;
  let zoneId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, AdminModule, OrdersModule],
    })
      .overrideProvider(EmailQueue)
      .useValue({ send: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    baseUrl = await listen(app);
    db = moduleRef.get(DB);
    orders = moduleRef.get(OrdersService);
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    finance = await data.admin({ isSuperadmin: false, roleId: await data.role(["money.view"]) });
    support = await data.admin({ isSuperadmin: false, roleId: await data.role(["orders.view"]) });

    const seller = await createTestSeller(db, "money");
    sellerId = seller.id;
    slug = seller.slug;
    const created = await createTestProduct(db, sellerId, { priceKobo: 1_000_000 });
    variantId = created.variant.id;
    const zones = await db
      .insert(deliveryZones)
      .values({ sellerId, name: "Lekki", feeKobo: 200_000 })
      .returning({ id: deliveryZones.id });
    zoneId = zones[0]?.id ?? "";
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId));
    await data.cleanUp();
    await app.close();
  });

  /** A paid ₦10,000 order with ₦2,000 delivery: Gbam fee ₦150, Paystack fee ₦300. */
  async function paidOrder() {
    const order = await orders.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      items: [{ variantId, quantity: 1 }],
      delivery: { zoneId, expectedFeeKobo: 200_000, address: "1 Test Road", landmark: null },
    });
    await db.insert(payments).values({
      orderId: order.id,
      reference: `gbam_${order.code}_${randomUUID().slice(0, 8)}`,
      amountKobo: order.totalKobo,
      platformFeeKobo: 15_000,
      paystackFeeKobo: 30_000,
      status: "success",
    });
    await orders
      .transition({ orderId: order.id, to: "awaiting_payment", actor: "system" })
      .catch(() => undefined);
    await orders.transition({ orderId: order.id, to: "paid", actor: "system" });
    return order;
  }

  function money(query: string, token = finance.token) {
    return callAdmin(baseUrl, "GET", `/admin/money${query}`, token);
  }

  it("totals and per-shop for paid orders", async () => {
    await paidOrder();
    await paidOrder();
    const today = lagosToday();
    const result = await money(`?from=${today}&to=${today}`);
    expect(result.status).toBe(200);
    const body = result.json as Money;
    const shop = body.byShop.find((row) => row.shopId === sellerId);
    expect(shop).toMatchObject({ salesKobo: 2_400_000, paidOrders: 2, gbamFeesKobo: 30_000 });
    // Everyone's totals include ours (other tests may add more at the same time).
    expect(body.totals.salesKobo).toBeGreaterThanOrEqual(2_400_000);
    expect(body.totals.deliveryKobo).toBeGreaterThanOrEqual(400_000);
    expect(body.byDay).toHaveLength(1);
    expect(body.byDay[0]?.day).toBe(today);
  });

  it("refunds counted on the refund day", async () => {
    const order = await paidOrder();
    const today = lagosToday();
    const before = (await money(`?from=${today}&to=${today}`)).json as Money;
    await orders.transition({ orderId: order.id, to: "refunded", actor: "system" });
    const after = (await money(`?from=${today}&to=${today}`)).json as Money;
    expect(after.totals.refundsKobo - before.totals.refundsKobo).toBeGreaterThanOrEqual(1_200_000);
  });

  it("empty range gives zeros", async () => {
    const body = (await money("?from=2001-01-01&to=2001-01-07")).json as Money;
    expect(body.totals).toEqual({
      salesKobo: 0,
      itemsKobo: 0,
      deliveryKobo: 0,
      gbamFeesKobo: 0,
      paystackFeesKobo: 0,
      refundsKobo: 0,
      paidOrders: 0,
    });
    expect(body.byDay).toHaveLength(7);
    expect(body.byDay.every((day) => day.salesKobo === 0)).toBe(true);
    expect(body.byShop).toEqual([]);
  });

  it("needs money.view", async () => {
    expect((await money("", support.token)).status).toBe(403);
  });
});
