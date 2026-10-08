/**
 * Integration test: the places that read Admin → Settings use the live values. A stub
 * settings service is used, so no shared settings row changes under other tests.
 */
import "reflect-metadata";
import { orderEvents, orders, payments, sellers } from "@gbam/db";
import { FakePaystackClient } from "@gbam/integrations";
import { DEFAULT_PLATFORM_SETTINGS, MAINTENANCE_OFF, type PlatformSettings } from "@gbam/shared";
import { ForbiddenException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthModule } from "../auth/auth.module.js";
import { AuthService } from "../auth/auth.service.js";
import { EmailQueue } from "../email/email.queue.js";
import { renderEmail } from "../email/templates.js";
import { IntegrationsModule, PAYSTACK } from "../integrations/integrations.module.js";
import { OrderExpiryService } from "../orders/order-expiry.service.js";
import { OrdersService } from "../orders/orders.service.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PaymentsService } from "../payments/payments.service.js";
import { createTestProduct, createTestSeller, TEST_DELIVERY } from "../test-helpers.js";
import { DB, InfraModule, type Db } from "./infra.module.js";
import { PlatformSettingsService } from "./platform-settings.service.js";

process.loadEnvFile?.("../../.env");

const SETTINGS: PlatformSettings = {
  ...DEFAULT_PLATFORM_SETTINGS,
  feePercentBasisPoints: 200,
  feeCapKobo: 500_000,
  reminderAfterHours: 2,
  cancelAfterHours: 4,
  signupsOpen: false,
};

describe("settings are used where they matter (integration)", () => {
  let moduleRef: TestingModule;
  let db: Db;
  let sellerId: string;
  let slug: string;
  let variantId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, PaymentsModule, AuthModule],
    })
      .overrideProvider(PlatformSettingsService)
      .useValue({
        get: async () => SETTINGS,
        maintenance: async () => MAINTENANCE_OFF,
        clearCache: () => undefined,
      })
      .overrideProvider(EmailQueue)
      .useValue({ send: async () => undefined })
      // The fake Paystack: no real account is called from tests.
      .overrideProvider(PAYSTACK)
      .useValue(new FakePaystackClient(async () => undefined, () => undefined))
      .compile();
    moduleRef.enableShutdownHooks();
    db = moduleRef.get(DB);
    const seller = await createTestSeller(db, "settingsuse");
    sellerId = seller.id;
    slug = seller.slug;
    await db.update(sellers).set({ paystackSubaccountCode: "ACCT_test123" }).where(eq(sellers.id, sellerId));
    const created = await createTestProduct(db, sellerId, { priceKobo: 1_000_000 });
    variantId = created.variant.id;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId));
    await moduleRef.close();
  });

  async function orderAwaitingPayment() {
    const ordersService = moduleRef.get(OrdersService);
    const order = await ordersService.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      items: [{ variantId, quantity: 1 }],
      delivery: TEST_DELIVERY,
    });
    await ordersService.transition({ orderId: order.id, to: "awaiting_payment", actor: "seller", sellerId });
    return order;
  }

  it("fee change applies to the next payment link", async () => {
    const order = await orderAwaitingPayment();
    await moduleRef.get(PaymentsService).ensurePaymentLink(order.id);
    const rows = await db.select().from(payments).where(eq(payments.orderId, order.id));
    // 2% of ₦10,000 = ₦200 (the default 1.5% would be ₦150).
    expect(rows[0]?.platformFeeKobo).toBe(20_000);
  });

  it("expiry uses the stored hours", async () => {
    const order = await orderAwaitingPayment();
    const threeHoursAgo = new Date(Date.now() - 3 * 3_600_000);
    await db
      .update(orderEvents)
      .set({ createdAt: threeHoursAgo })
      .where(and(eq(orderEvents.orderId, order.id), eq(orderEvents.toStatus, "awaiting_payment")));
    const expiry = moduleRef.get(OrderExpiryService);

    // 3 hours: past the 2-hour reminder, before the 4-hour cancel.
    expect(await expiry.sendDueReminders(new Date())).toContain(order.id);
    expect(await expiry.expireOverdue(new Date())).not.toContain(order.id);
    // 5 hours later than that: cancelled.
    const later = new Date(Date.now() + 2 * 3_600_000);
    expect(await expiry.expireOverdue(later)).toContain(order.id);
    const rows = await db.select().from(orders).where(eq(orders.id, order.id));
    expect(rows[0]?.status).toBe("cancelled");
  });

  it("signups closed refuses signup", async () => {
    const id = randomUUID().slice(0, 8);
    const error = await moduleRef
      .get(AuthService)
      .signup(
        {
          businessName: "Closed Shop",
          slug: `closed-${id}`,
          phone: "2990000000999",
          email: `closed-${id}@example.com`,
          password: "correct horse battery",
        },
        { ip: "test", userAgent: "vitest" },
      )
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ForbiddenException);
    expect((error as ForbiddenException).getResponse()).toMatchObject({ code: "SIGNUPS_CLOSED" });
  });

  it("inbox change routes the contact email", () => {
    const email = renderEmail(
      { kind: "contact_message", name: "Ada", email: "ada@example.com", phone: null, message: "Hi" },
      { support: "help@gbam.example", contact: "team@gbam.example", privacy: "dpo@gbam.example" },
    );
    expect(email.to).toBe("team@gbam.example");
  });
});
