/** HTTP-level test of the seller's notification bell, against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { notificationCampaigns, sellerNotifications, sellers, users } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { randomInt, randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthService } from "../auth/auth.service.js";
import { EmailQueue } from "../email/email.queue.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { MessagingModule } from "./messaging.module.js";
import { SellerNotificationsService } from "./seller-notifications.service.js";

process.loadEnvFile?.("../../.env");
const INTERNAL_SECRET = "bell-http-test-internal-secret-0123456789abcd";
process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;

type Bell = {
  unread: number;
  items: { id: string; title: string; readAt: string | null; link: string | null }[];
};

describe("Notification bell over HTTP (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let auth: AuthService;
  let notifications: SellerNotificationsService;
  const emails: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, MessagingModule] })
      .overrideProvider(EmailQueue)
      .useValue({ send: async () => undefined })
      .compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    db = moduleRef.get(DB);
    auth = moduleRef.get(AuthService);
    notifications = moduleRef.get(SellerNotificationsService);
  });

  afterAll(async () => {
    const rows = await db.select().from(users).where(inArray(users.email, emails));
    const ids: string[] = [];
    for (const row of rows) {
      ids.push(row.id);
    }
    if (ids.length > 0) {
      await db.delete(sellers).where(inArray(sellers.ownerUserId, ids));
      await db.delete(users).where(inArray(users.id, ids));
    }
    await app.close();
  });

  async function seller(): Promise<{ authorization: string; sellerId: string }> {
    const id = randomUUID().slice(0, 8);
    let phone = "299";
    for (let i = 0; i < 10; i++) {
      phone = phone + String(randomInt(10));
    }
    const email = `bell-${id}@example.com`;
    emails.push(email);
    const result = await auth.signup(
      {
        businessName: "Bell Test",
        slug: `belltest-${id}`,
        phone,
        email,
        password: "correct horse battery",
      },
      { ip: "203.0.113.30", userAgent: "vitest" },
    );
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, result.user.id));
    const shop = result.user.seller;
    if (!shop) {
      throw new Error("Signup made no shop");
    }
    return { authorization: `Bearer ${result.sessionToken}`, sellerId: shop.id };
  }

  async function call(method: string, path: string, authorization: string) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization,
        "x-client-ip": `test-${randomUUID()}`,
        "x-internal-secret": INTERNAL_SECRET,
      },
    });
    const text = await res.text();
    let json: unknown = null;
    if (text !== "") {
      json = JSON.parse(text);
    }
    return { status: res.status, json };
  }

  it("seller sees only their own, newest first, ended ones hidden", async () => {
    const me = await seller();
    const other = await seller();
    await notifications.notify(me.sellerId, { type: "info", title: "First", body: "One" });
    await notifications.notify(me.sellerId, {
      type: "warning",
      title: "Second",
      body: "Two",
      link: "/dashboard/settings",
    });
    await notifications.notify(me.sellerId, {
      type: "info",
      title: "Old news",
      body: "Ended",
      endsAt: new Date(Date.now() - 60_000),
    });
    await notifications.notify(other.sellerId, { type: "info", title: "Not mine", body: "x" });
    const bell = (await call("GET", "/bell", me.authorization)).json as Bell;
    expect(bell.unread).toBe(2);
    expect(bell.items.map((item) => item.title)).toEqual(["Second", "First"]);
    expect(bell.items[0]?.link).toBe("/dashboard/settings");
    expect((await call("GET", "/bell", "Bearer nope")).status).toBe(401);
  });

  it("mark read and mark all read", async () => {
    const me = await seller();
    await notifications.notify(me.sellerId, { type: "info", title: "A", body: "a" });
    await notifications.notify(me.sellerId, { type: "info", title: "B", body: "b" });
    const before = (await call("GET", "/bell", me.authorization)).json as Bell;
    const first = before.items[0];
    if (!first) {
      throw new Error("no notification");
    }
    expect((await call("POST", `/bell/${first.id}/read`, me.authorization)).status).toBe(200);
    expect(((await call("GET", "/bell", me.authorization)).json as Bell).unread).toBe(1);
    expect((await call("POST", "/bell/read-all", me.authorization)).status).toBe(200);
    expect(((await call("GET", "/bell", me.authorization)).json as Bell).unread).toBe(0);
  });

  it("another seller's notification is 404", async () => {
    const me = await seller();
    const other = await seller();
    await notifications.notify(other.sellerId, { type: "info", title: "Theirs", body: "x" });
    const rows = await db
      .select()
      .from(sellerNotifications)
      .where(eq(sellerNotifications.sellerId, other.sellerId));
    const theirs = rows[0];
    if (!theirs) {
      throw new Error("no notification");
    }
    expect((await call("POST", `/bell/${theirs.id}/read`, me.authorization)).status).toBe(404);
    const after = await db
      .select()
      .from(sellerNotifications)
      .where(eq(sellerNotifications.id, theirs.id));
    expect(after[0]?.readAt).toBeNull();
  });

  it("binned campaign disappears from bells", async () => {
    const me = await seller();
    const campaigns = await db
      .insert(notificationCampaigns)
      .values({ type: "info", title: "Campaign", body: "x", audience: {} })
      .returning({ id: notificationCampaigns.id });
    const campaign = campaigns[0];
    if (!campaign) {
      throw new Error("campaign not created");
    }
    await db.insert(sellerNotifications).values({
      sellerId: me.sellerId,
      campaignId: campaign.id,
      type: "info",
      title: "Campaign",
      body: "x",
    });
    expect(((await call("GET", "/bell", me.authorization)).json as Bell).unread).toBe(1);
    await db
      .update(notificationCampaigns)
      .set({ deletedAt: new Date() })
      .where(eq(notificationCampaigns.id, campaign.id));
    const bell = (await call("GET", "/bell", me.authorization)).json as Bell;
    expect(bell.unread).toBe(0);
    expect(bell.items).toEqual([]);
    await db.delete(notificationCampaigns).where(eq(notificationCampaigns.id, campaign.id));
  });
});
