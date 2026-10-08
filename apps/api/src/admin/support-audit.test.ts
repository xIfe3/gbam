/** Integration test over HTTP against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { adminAuditLog, contactMessages, orderIssues, sellers } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailQueue } from "../email/email.queue.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { createTestProduct, createTestSeller, TEST_DELIVERY } from "../test-helpers.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminTestData, callAdmin, listen, type TestAdmin } from "./admin-test-helpers.js";
import { AdminModule } from "./admin.module.js";

process.loadEnvFile?.("../../.env");

describe("Admin support inbox and audit log (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let data: AdminTestData;
  let support: TestAdmin;
  let auditor: TestAdmin;
  const messageIds: string[] = [];
  const sellerIds: string[] = [];

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
    data = new AdminTestData(db, moduleRef.get(AdminAuthService));
    support = await data.admin({
      isSuperadmin: false,
      roleId: await data.role(["support.view", "support.handle"]),
    });
    auditor = await data.admin({ isSuperadmin: false, roleId: await data.role(["audit.view"]) });
  });

  afterAll(async () => {
    if (messageIds.length > 0) {
      await db.delete(contactMessages).where(inArray(contactMessages.id, messageIds));
    }
    if (sellerIds.length > 0) {
      await db.delete(sellers).where(inArray(sellers.id, sellerIds));
    }
    await data.cleanUp();
    await app.close();
  });

  async function message(): Promise<string> {
    const rows = await db
      .insert(contactMessages)
      .values({
        name: "Ada",
        email: `contact-${randomUUID().slice(0, 8)}@example.com`,
        message: "My shop link isn't working",
      })
      .returning({ id: contactMessages.id });
    const row = rows[0];
    if (!row) {
      throw new Error("expected a message");
    }
    messageIds.push(row.id);
    return row.id;
  }

  it("handle a message with a note", async () => {
    const id = await message();
    const result = await callAdmin(
      baseUrl,
      "POST",
      `/admin/support/messages/${id}/handle`,
      support.token,
      { reason: "Replied by email" },
    );
    expect(result.status).toBe(200);
    const rows = await db.select().from(contactMessages).where(eq(contactMessages.id, id));
    expect(rows[0]).toMatchObject({ status: "handled", handledNote: "Replied by email" });

    const list = await callAdmin(
      baseUrl,
      "GET",
      "/admin/support/messages?status=handled",
      support.token,
    );
    expect((list.json as { id: string }[]).some((row) => row.id === id)).toBe(true);
  });

  it("bulk handle", async () => {
    const first = await message();
    const second = await message();
    const result = await callAdmin(
      baseUrl,
      "POST",
      "/admin/support/messages/bulk/handle",
      support.token,
      {
        ids: [first, second],
        note: "Answered in the FAQ",
      },
    );
    expect(result.status).toBe(200);
    expect(result.json).toMatchObject({ done: [first, second], skipped: [] });
  });

  it("problem reports can be resolved by an admin", async () => {
    const seller = await createTestSeller(db, "adminissue");
    sellerIds.push(seller.id);
    const { variant } = await createTestProduct(db, seller.id);
    const order = await moduleRef.get(OrdersService).createFromStorefront(seller.slug, {
      customer: { name: "Ada", phone: "2348011112222" },
      items: [{ variantId: variant.id, quantity: 1 }],
      delivery: TEST_DELIVERY,
    });
    const issueRows = await db
      .insert(orderIssues)
      .values({ orderId: order.id, reason: "not_received" })
      .returning({ id: orderIssues.id });
    const issueId = issueRows[0]?.id;

    const open = await callAdmin(
      baseUrl,
      "GET",
      "/admin/support/issues?status=open",
      support.token,
    );
    expect((open.json as { id: string }[]).some((row) => row.id === issueId)).toBe(true);
    const resolved = await callAdmin(
      baseUrl,
      "POST",
      `/admin/support/issues/${issueId}/resolve`,
      support.token,
      { reason: "Seller confirmed delivery" },
    );
    expect(resolved.status).toBe(200);
  });

  it("audit list filters by admin and batch", async () => {
    const first = await message();
    const second = await message();
    await callAdmin(baseUrl, "POST", "/admin/support/messages/bulk/handle", support.token, {
      ids: [first, second],
      note: "Batch for the audit test",
    });

    const byAdmin = await callAdmin(
      baseUrl,
      "GET",
      `/admin/audit?adminId=${support.id}`,
      auditor.token,
    );
    expect(byAdmin.status).toBe(200);
    const rows = (
      byAdmin.json as { rows: { adminId: string; batchId: string | null; note: string }[] }
    ).rows;
    expect(rows.every((row) => row.adminId === support.id)).toBe(true);
    const batchRow = rows.find((row) => row.note === "Batch for the audit test");
    expect(batchRow?.batchId).toBeTruthy();

    const byBatch = await callAdmin(
      baseUrl,
      "GET",
      `/admin/audit?batchId=${batchRow?.batchId}`,
      auditor.token,
    );
    expect((byBatch.json as { rows: unknown[] }).rows).toHaveLength(2);
  });

  it("no endpoint updates or deletes audit entries", async () => {
    const rows = await db.select({ id: adminAuditLog.id }).from(adminAuditLog).limit(1);
    const id = rows[0]?.id ?? randomUUID();
    for (const method of ["PATCH", "PUT", "DELETE"]) {
      const result = await callAdmin(baseUrl, method, `/admin/audit/${id}`, auditor.token, {});
      expect(result.status).toBe(404);
    }
  });

  it("support can't read the audit log", async () => {
    expect((await callAdmin(baseUrl, "GET", "/admin/audit", support.token)).status).toBe(403);
  });
});
