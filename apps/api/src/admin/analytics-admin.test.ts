/**
 * Integration test over HTTP against the dev Postgres + Redis (db 1). Other test files add
 * sellers and orders at the same time, so these tests compare before/after differences.
 */
import "reflect-metadata";
import { dailyVisits, payments, sellers, users } from "@gbam/db";
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
import {
  addTestPayoutAccount,
  createTestProduct,
  createTestSeller,
  TEST_DELIVERY,
} from "../test-helpers.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminTestData, callAdmin, listen, type TestAdmin } from "./admin-test-helpers.js";
import { AdminModule } from "./admin.module.js";

process.loadEnvFile?.("../../.env");

type Analytics = {
  funnel: {
    week: string;
    signedUp: number;
    verified: number;
    firstProduct: number;
    bankAccount: number;
    firstPaidOrder: number;
  }[];
  activeShops: { last7: number; last30: number };
  orders: {
    placed: number;
    paid: number;
    expired: number;
    cancelled: number;
    paidRate: number;
    averageOrderKobo: number;
  };
  topShops: { shopId: string; shopName: string; paidOrders: number }[];
  visits: { day: string; storefront: number; product: number; checkout: number }[];
  visitFunnel: { visits: number; orders: number; paid: number };
};

function lagosToday(): string {
  return new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
}

describe("Admin analytics (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let data: AdminTestData;
  let orders: OrdersService;
  let analyst: TestAdmin;
  const sellerIds: string[] = [];
  const userIds: string[] = [];

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
    analyst = await data.admin({
      isSuperadmin: false,
      roleId: await data.role(["analytics.view"]),
    });
  });

  afterAll(async () => {
    for (const sellerId of sellerIds) {
      await db.delete(sellers).where(eq(sellers.id, sellerId));
    }
    for (const userId of userIds) {
      await db.delete(users).where(eq(users.id, userId));
    }
    await data.cleanUp();
    await app.close();
  });

  async function analytics(): Promise<Analytics> {
    const today = lagosToday();
    const result = await callAdmin(
      baseUrl,
      "GET",
      `/admin/analytics?from=${today}&to=${today}`,
      analyst.token,
    );
    expect(result.status).toBe(200);
    return result.json as Analytics;
  }

  function thisWeek(body: Analytics) {
    const last = body.funnel[body.funnel.length - 1];
    if (!last) {
      throw new Error("expected a funnel week");
    }
    return last;
  }

  /** A seller with an owner account, verified; returns the seller and a variant. */
  async function verifiedSeller() {
    const seller = await createTestSeller(db, "analytics");
    sellerIds.push(seller.id);
    const userRows = await db
      .insert(users)
      .values({
        email: `an-${randomUUID().slice(0, 8)}@example.com`,
        passwordHash: "x",
        emailVerifiedAt: new Date(),
      })
      .returning({ id: users.id });
    const userId = userRows[0]?.id ?? "";
    userIds.push(userId);
    await db.update(sellers).set({ ownerUserId: userId }).where(eq(sellers.id, seller.id));
    return seller;
  }

  it("funnel counts a new seller through each step", async () => {
    const before = thisWeek(await analytics());
    const seller = await verifiedSeller();
    const { variant } = await createTestProduct(db, seller.id);
    await db
      .update(sellers)
      .set({ paystackSubaccountCode: "ACCT_test123" })
      .where(eq(sellers.id, seller.id));
    const order = await orders.createFromStorefront(seller.slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      items: [{ variantId: variant.id, quantity: 1 }],
      delivery: TEST_DELIVERY,
    });
    await db.insert(payments).values({
      orderId: order.id,
      reference: `gbam_${order.code}_${randomUUID().slice(0, 8)}`,
      amountKobo: order.totalKobo,
      status: "success",
    });
    await orders.transition({ orderId: order.id, to: "awaiting_payment", actor: "system" });
    await orders.transition({ orderId: order.id, to: "paid", actor: "system" });

    const after = thisWeek(await analytics());
    expect(after.signedUp - before.signedUp).toBeGreaterThanOrEqual(1);
    expect(after.verified - before.verified).toBeGreaterThanOrEqual(1);
    expect(after.firstProduct - before.firstProduct).toBeGreaterThanOrEqual(1);
    expect(after.bankAccount - before.bankAccount).toBeGreaterThanOrEqual(1);
    expect(after.firstPaidOrder - before.firstPaidOrder).toBeGreaterThanOrEqual(1);
  });

  it("active shops counts paid orders in the window, and expired vs cancelled", async () => {
    const seller = await verifiedSeller();
    await addTestPayoutAccount(db, seller.id);
    const { variant } = await createTestProduct(db, seller.id);
    const place = () =>
      orders.createFromStorefront(seller.slug, {
        customer: { name: "Ada", phone: "2348011112222" },
        items: [{ variantId: variant.id, quantity: 1 }],
        delivery: TEST_DELIVERY,
      });
    const before = await analytics();
    const byShop = await place();
    await orders.transition({
      orderId: byShop.id,
      to: "cancelled",
      actor: "seller",
      sellerId: seller.id,
    });
    const bySystem = await place();
    await orders.transition({ orderId: bySystem.id, to: "awaiting_payment", actor: "system" });
    await orders.transition({ orderId: bySystem.id, to: "cancelled", actor: "system" });

    const after = await analytics();
    expect(after.orders.placed - before.orders.placed).toBeGreaterThanOrEqual(2);
    expect(after.orders.cancelled - before.orders.cancelled).toBeGreaterThanOrEqual(1);
    expect(after.orders.expired - before.orders.expired).toBeGreaterThanOrEqual(1);
    expect(after.activeShops.last30).toBeGreaterThanOrEqual(after.activeShops.last7);
  });

  it("visits read from daily_visits", async () => {
    const seller = await verifiedSeller();
    const today = lagosToday();
    const before = await analytics();
    await db.insert(dailyVisits).values([
      { day: today, sellerId: seller.id, kind: "storefront", visits: 7 },
      { day: today, sellerId: seller.id, kind: "checkout", visits: 2 },
    ]);
    const after = await analytics();
    const beforeDay = before.visits.find((day) => day.day === today);
    const afterDay = after.visits.find((day) => day.day === today);
    expect((afterDay?.storefront ?? 0) - (beforeDay?.storefront ?? 0)).toBe(7);
    expect((afterDay?.checkout ?? 0) - (beforeDay?.checkout ?? 0)).toBe(2);
  });

  it("needs analytics.view", async () => {
    const other = await data.admin({
      isSuperadmin: false,
      roleId: await data.role(["money.view"]),
    });
    expect((await callAdmin(baseUrl, "GET", "/admin/analytics", other.token)).status).toBe(403);
  });
});
