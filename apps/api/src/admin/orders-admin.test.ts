/** Integration test over HTTP against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { adminAuditLog, orders, payments, refundCases, sellers } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
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

describe("Admin orders and refunds (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let data: AdminTestData;
  let ordersService: OrdersService;
  let finance: TestAdmin;
  let sellerId: string;
  let slug: string;
  let variantId: string;

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
    ordersService = moduleRef.get(OrdersService);
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    const role = await data.role(["orders.view", "refunds.handle"]);
    finance = await data.admin({ isSuperadmin: false, roleId: role });

    const seller = await createTestSeller(db, "adminorders");
    sellerId = seller.id;
    slug = seller.slug;
    await addTestPayoutAccount(db, sellerId);
    const created = await createTestProduct(db, sellerId, { priceKobo: 200_000 });
    variantId = created.variant.id;
  });

  afterAll(async () => {
    const orderRows = await db
      .select({ id: orders.id })
      .from(orders)
      .where(eq(orders.sellerId, sellerId));
    const orderIds = orderRows.map((row) => row.id);
    if (orderIds.length > 0) {
      await db.delete(refundCases).where(inArray(refundCases.orderId, orderIds));
    }
    await data.cleanUp();
    await db.delete(sellers).where(eq(sellers.id, sellerId));
    await app.close();
  });

  async function placeOrder(phone = "2348011112222") {
    return ordersService.createFromStorefront(slug, {
      customer: { name: "Ada", phone },
      items: [{ variantId, quantity: 1 }],
      delivery: TEST_DELIVERY,
    });
  }

  /** A cancelled order that was paid anyway: the case support has to refund. */
  async function paidCancelledOrder() {
    const order = await placeOrder();
    const reference = `gbam_${order.code}_${randomUUID().slice(0, 8)}`;
    await db.insert(payments).values({
      orderId: order.id,
      reference,
      amountKobo: order.totalKobo,
      platformFeeKobo: 0,
      status: "success",
    });
    await ordersService.transition({
      orderId: order.id,
      to: "cancelled",
      actor: "seller",
      sellerId,
    });
    await ordersService.emailSupportNeedsRefund(order.id, "Paid after it was cancelled", reference);
    return { order, reference };
  }

  it("search by code and phone", async () => {
    const order = await placeOrder("2348077778888");
    for (const q of [order.code, "77778888"]) {
      const result = await callAdmin(baseUrl, "GET", `/admin/orders?q=${q}`, finance.token);
      expect(result.status).toBe(200);
      const body = result.json as { rows: { id: string }[] };
      expect(body.rows.some((row) => row.id === order.id)).toBe(true);
    }
    const detail = await callAdmin(baseUrl, "GET", `/admin/orders/${order.id}`, finance.token);
    expect(detail.json).toMatchObject({
      order: { id: order.id, code: order.code },
      shop: { slug },
    });
  });

  it("needs-refund creates one case per payment", async () => {
    const { order, reference } = await paidCancelledOrder();
    // The same payment reported again (a repeated webhook) adds nothing.
    await ordersService.emailSupportNeedsRefund(order.id, "Paid after it was cancelled", reference);
    const cases = await db.select().from(refundCases).where(eq(refundCases.orderId, order.id));
    expect(cases).toHaveLength(1);
    expect(cases[0]).toMatchObject({ paymentReference: reference, amountKobo: order.totalKobo });

    const list = await callAdmin(baseUrl, "GET", "/admin/refunds?status=open", finance.token);
    const body = list.json as { id: string; orderCode: string }[];
    expect(body.some((row) => row.orderCode === order.code)).toBe(true);
  });

  it("resolve moves the order to refunded and closes the case", async () => {
    const { order } = await paidCancelledOrder();
    const cases = await db.select().from(refundCases).where(eq(refundCases.orderId, order.id));
    const refundCase = cases[0];
    if (!refundCase) {
      throw new Error("expected a case");
    }

    const result = await callAdmin(
      baseUrl,
      "POST",
      `/admin/refunds/${refundCase.id}/resolve`,
      finance.token,
      { reason: "Refunded on Paystack" },
    );
    expect(result.status).toBe(200);

    const orderRows = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(orderRows[0]?.status).toBe("refunded");
    const after = await db.select().from(refundCases).where(eq(refundCases.id, refundCase.id));
    expect(after[0]?.resolvedAt).toBeInstanceOf(Date);
    expect(after[0]?.resolvedBy).toBe(finance.id);
    const entries = await db
      .select()
      .from(adminAuditLog)
      .where(
        and(eq(adminAuditLog.action, "refund.resolved"), eq(adminAuditLog.targetId, refundCase.id)),
      );
    expect(entries).toHaveLength(1);
  });

  it("resolving twice is refused", async () => {
    const { order } = await paidCancelledOrder();
    const cases = await db.select().from(refundCases).where(eq(refundCases.orderId, order.id));
    const url = `/admin/refunds/${cases[0]?.id}/resolve`;
    await callAdmin(baseUrl, "POST", url, finance.token, { reason: "Refunded on Paystack" });
    const again = await callAdmin(baseUrl, "POST", url, finance.token, {
      reason: "Refunded again",
    });
    expect(again.status).toBe(409);
  });
});
