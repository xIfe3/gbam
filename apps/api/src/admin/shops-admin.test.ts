/** Integration test over HTTP against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { adminAuditLog, sellerNotifications, sellers, users } from "@gbam/db";
import { ConflictException, type INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { OrderNotAwaitingPaymentError, PaymentsService } from "../payments/payments.service.js";
import { createTestProduct, createTestSeller, TEST_DELIVERY } from "../test-helpers.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminTestData, callAdmin, listen, type TestAdmin } from "./admin-test-helpers.js";
import { AdminModule } from "./admin.module.js";

process.loadEnvFile?.("../../.env");

describe("Admin shops (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let data: AdminTestData;
  let orders: OrdersService;
  let payments: PaymentsService;
  let ops: TestAdmin;
  let viewer: TestAdmin;
  const sent: EmailJob[] = [];
  const sellerIds: string[] = [];
  const userIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, AdminModule, OrdersModule, PaymentsModule],
    })
      .overrideProvider(EmailQueue)
      .useValue({
        send: async (_jobId: string, job: EmailJob) => {
          sent.push(job);
        },
      })
      .compile();
    app = moduleRef.createNestApplication();
    baseUrl = await listen(app);
    db = moduleRef.get(DB);
    orders = moduleRef.get(OrdersService);
    payments = moduleRef.get(PaymentsService);
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    const opsRole = await data.role(["shops.view", "shops.suspend", "sellers.help", "fees.manage"]);
    const viewRole = await data.role(["shops.view"]);
    ops = await data.admin({ isSuperadmin: false, roleId: opsRole });
    viewer = await data.admin({ isSuperadmin: false, roleId: viewRole });
  });

  afterAll(async () => {
    await data.cleanUp();
    if (sellerIds.length > 0) {
      await db.delete(sellers).where(inArray(sellers.id, sellerIds));
    }
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await app.close();
  });

  /** A shop with an owner account and one product. */
  async function shop() {
    const seller = await createTestSeller(db, "adminshop");
    sellerIds.push(seller.id);
    const email = `owner-${randomUUID().slice(0, 8)}@example.com`;
    const userRows = await db
      .insert(users)
      .values({ email, passwordHash: "x" })
      .returning({ id: users.id });
    const user = userRows[0];
    if (!user) {
      throw new Error("expected a user");
    }
    userIds.push(user.id);
    await db
      .update(sellers)
      .set({ ownerUserId: user.id, paystackSubaccountCode: "ACCT_test123" })
      .where(eq(sellers.id, seller.id));
    const { variant } = await createTestProduct(db, seller.id);
    return { ...seller, email, userId: user.id, variantId: variant.id };
  }

  function placeOrder(slug: string, variantId: string) {
    return orders.createFromStorefront(slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      items: [{ variantId, quantity: 1 }],
      delivery: TEST_DELIVERY,
    });
  }

  it("search by name, slug and email", async () => {
    const found = await shop();
    for (const q of [found.slug, found.email, found.businessName.slice(0, 12)]) {
      const result = await callAdmin(
        baseUrl,
        "GET",
        `/admin/shops?q=${encodeURIComponent(q)}`,
        viewer.token,
      );
      expect(result.status).toBe(200);
      const body = result.json as { rows: { id: string }[] };
      expect(body.rows.some((row) => row.id === found.id)).toBe(true);
    }
  });

  it("viewing doesn't allow suspending", async () => {
    const target = await shop();
    const result = await callAdmin(
      baseUrl,
      "POST",
      `/admin/shops/${target.id}/suspend`,
      viewer.token,
      { reason: "Reported for fraud" },
    );
    expect(result.status).toBe(403);
  });

  it("suspend blocks orders and payment links, writes one audit entry and emails the owner", async () => {
    const target = await shop();
    const waiting = await placeOrder(target.slug, target.variantId);
    await orders.transition({
      orderId: waiting.id,
      to: "awaiting_payment",
      actor: "seller",
      sellerId: target.id,
    });

    const result = await callAdmin(
      baseUrl,
      "POST",
      `/admin/shops/${target.id}/suspend`,
      ops.token,
      { reason: "Reported for fraud" },
    );
    expect(result.status).toBe(200);

    await expect(placeOrder(target.slug, target.variantId)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(payments.ensurePaymentLink(waiting.id)).rejects.toBeInstanceOf(
      OrderNotAwaitingPaymentError,
    );

    const entries = await db
      .select()
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.action, "shop.suspend"), eq(adminAuditLog.targetId, target.id)));
    expect(entries).toHaveLength(1);
    expect(entries[0]?.note).toBe("Reported for fraud");
    expect(sent.some((job) => job.kind === "shop_suspended" && job.to === target.email)).toBe(true);
    const bell = await db
      .select()
      .from(sellerNotifications)
      .where(eq(sellerNotifications.sellerId, target.id));
    expect(bell.map((item) => item.title)).toContain("Your shop is paused");
  });

  it("reopen restores ordering", async () => {
    const target = await shop();
    await callAdmin(baseUrl, "POST", `/admin/shops/${target.id}/suspend`, ops.token, {
      reason: "Checking documents",
    });
    const reopened = await callAdmin(
      baseUrl,
      "POST",
      `/admin/shops/${target.id}/reopen`,
      ops.token,
      {
        reason: "Documents checked",
      },
    );
    expect(reopened.status).toBe(200);
    const order = await placeOrder(target.slug, target.variantId);
    expect(order.status).toBe("pending");
    const bell = await db
      .select()
      .from(sellerNotifications)
      .where(eq(sellerNotifications.sellerId, target.id));
    expect(bell.map((item) => item.title)).toContain("Your shop is open again");
  });

  it("bulk suspend skips already suspended", async () => {
    const first = await shop();
    const second = await shop();
    await callAdmin(baseUrl, "POST", `/admin/shops/${first.id}/suspend`, ops.token, {
      reason: "Suspended earlier",
    });

    const result = await callAdmin(baseUrl, "POST", "/admin/shops/bulk/suspend", ops.token, {
      ids: [first.id, second.id],
      note: "Spam wave cleanup",
    });
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({
      done: [second.id],
      skipped: [{ id: first.id, why: "Already suspended" }],
    });
    const entries = await db
      .select()
      .from(adminAuditLog)
      .where(and(eq(adminAuditLog.action, "shop.suspend"), eq(adminAuditLog.targetId, first.id)));
    // Only the first, single suspension: the skipped one added nothing.
    expect(entries).toHaveLength(1);
  });

  it("unlock clears the lockout", async () => {
    const target = await shop();
    await db
      .update(users)
      .set({ failedLoginCount: 5, lockedUntil: new Date(Date.now() + 600_000) })
      .where(eq(users.id, target.userId));
    const result = await callAdmin(
      baseUrl,
      "POST",
      `/admin/shops/${target.id}/unlock-seller`,
      ops.token,
    );
    expect(result.status).toBe(200);
    const rows = await db.select().from(users).where(eq(users.id, target.userId));
    expect(rows[0]?.lockedUntil).toBeNull();
    expect(rows[0]?.failedLoginCount).toBe(0);
  });

  it("fee waiver set and cleared", async () => {
    const target = await shop();
    const url = `/admin/shops/${target.id}/fee-waiver`;
    const set = await callAdmin(baseUrl, "PUT", url, ops.token, { until: "2027-01-31" });
    expect(set.status).toBe(200);
    let rows = await db.select().from(sellers).where(eq(sellers.id, target.id));
    expect(rows[0]?.feeWaivedUntil?.toISOString().slice(0, 10)).toBe("2027-01-31");

    await callAdmin(baseUrl, "PUT", url, ops.token, { until: null });
    rows = await db.select().from(sellers).where(eq(sellers.id, target.id));
    expect(rows[0]?.feeWaivedUntil).toBeNull();
  });

  it("shop detail shows the owner and payout account without full numbers", async () => {
    const target = await shop();
    await db
      .update(sellers)
      .set({ bankName: "Access Bank", accountLast4: "6789", bankAccountName: "ADA OBI" })
      .where(eq(sellers.id, target.id));
    const result = await callAdmin(baseUrl, "GET", `/admin/shops/${target.id}`, viewer.token);
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({
      shop: { id: target.id, slug: target.slug, status: "active" },
      owner: { email: target.email },
      payoutAccount: { bankName: "Access Bank", accountLast4: "6789" },
    });
  });
});
