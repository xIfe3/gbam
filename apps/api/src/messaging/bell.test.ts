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

  async function callJson(method: string, path: string, authorization: string, body: unknown) {
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        authorization,
        "content-type": "application/json",
        "x-client-ip": `test-${randomUUID()}`,
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: JSON.stringify(body),
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
    const inserted = await db
      .insert(sellerNotifications)
      .values({
        sellerId: me.sellerId,
        campaignId: campaign.id,
        type: "info",
        title: "Campaign",
        body: "x",
      })
      .returning({ id: sellerNotifications.id });
    const mine = inserted[0];
    if (!mine) {
      throw new Error("notification not created");
    }
    expect(((await call("GET", "/bell", me.authorization)).json as Bell).unread).toBe(1);
    expect((await call("GET", `/bell/${mine.id}`, me.authorization)).status).toBe(200);
    await db
      .update(notificationCampaigns)
      .set({ deletedAt: new Date() })
      .where(eq(notificationCampaigns.id, campaign.id));
    const bell = (await call("GET", "/bell", me.authorization)).json as Bell;
    expect(bell.unread).toBe(0);
    expect(bell.items).toEqual([]);
    // Its own page is gone too, even from an old link.
    expect((await call("GET", `/bell/${mine.id}`, me.authorization)).status).toBe(404);
    // So is one whose end date has passed.
    await db
      .update(sellerNotifications)
      .set({ campaignId: null, endsAt: new Date(Date.now() - 60_000) })
      .where(eq(sellerNotifications.id, mine.id));
    expect((await call("GET", `/bell/${mine.id}`, me.authorization)).status).toBe(404);
    await db.delete(notificationCampaigns).where(eq(notificationCampaigns.id, campaign.id));
  });
  type Page = {
    rows: { id: string; title: string; readAt: string | null; deletedAt: string | null }[];
    total: number;
    unread: number;
  };

  it("the notifications page: tabs, type filter and search", async () => {
    const me = await seller();
    await notifications.notify(me.sellerId, {
      type: "info",
      title: "Payouts are faster",
      body: "Next day",
    });
    await notifications.notify(me.sellerId, {
      type: "warning",
      title: "Shop paused",
      body: "Check email",
    });
    const all = (await call("GET", "/bell/all", me.authorization)).json as Page;
    expect(all.total).toBe(2);
    const warnings = (await call("GET", "/bell/all?type=warning", me.authorization)).json as Page;
    expect(warnings.rows.map((row) => row.title)).toEqual(["Shop paused"]);
    const found = (await call("GET", "/bell/all?q=payouts", me.authorization)).json as Page;
    expect(found.rows.map((row) => row.title)).toEqual(["Payouts are faster"]);
    const first = all.rows[0];
    if (!first) {
      throw new Error("no rows");
    }
    await call("POST", `/bell/${first.id}/read`, me.authorization);
    const unread = (await call("GET", "/bell/all?tab=unread", me.authorization)).json as Page;
    expect(unread.total).toBe(1);
    expect(unread.unread).toBe(1);
  });

  it("one notification, mark unread again", async () => {
    const me = await seller();
    await notifications.notify(me.sellerId, { type: "info", title: "Hello", body: "World" });
    const list = (await call("GET", "/bell/all", me.authorization)).json as Page;
    const id = list.rows[0]?.id ?? "";
    await call("POST", `/bell/${id}/read`, me.authorization);
    const one = await call("GET", `/bell/${id}`, me.authorization);
    expect(one.status).toBe(200);
    expect((one.json as { title: string; readAt: string | null }).readAt).not.toBeNull();
    expect((await call("POST", `/bell/${id}/unread`, me.authorization)).status).toBe(200);
    const again = (await call("GET", `/bell/${id}`, me.authorization)).json as {
      readAt: string | null;
    };
    expect(again.readAt).toBeNull();
  });

  it("trash: out of the bell, restorable, deletable for good, emptied", async () => {
    const me = await seller();
    for (const title of ["One", "Two", "Three"]) {
      await notifications.notify(me.sellerId, { type: "info", title, body: "x" });
    }
    const list = (await call("GET", "/bell/all", me.authorization)).json as Page;
    const ids = list.rows.map((row) => row.id);
    const bulk = await callJson("POST", "/bell/bulk", me.authorization, { ids, action: "trash" });
    expect(bulk.status).toBe(200);
    expect(((await call("GET", "/bell", me.authorization)).json as Bell).items).toEqual([]);
    const trash = (await call("GET", "/bell/all?tab=trash", me.authorization)).json as Page;
    expect(trash.total).toBe(3);
    await call("POST", `/bell/${ids[0]}/restore`, me.authorization);
    expect(((await call("GET", "/bell", me.authorization)).json as Bell).items).toHaveLength(1);
    expect((await call("DELETE", `/bell/${ids[1]}`, me.authorization)).status).toBe(200);
    expect((await call("GET", `/bell/${ids[1]}`, me.authorization)).status).toBe(404);
    await call("POST", "/bell/trash/empty", me.authorization);
    expect(((await call("GET", "/bell/all?tab=trash", me.authorization)).json as Page).total).toBe(
      0,
    );
    // Deleting for good only works on what's in the trash.
    expect((await call("DELETE", `/bell/${ids[0]}`, me.authorization)).status).toBe(409);
  });

  it("bulk only touches the seller's own", async () => {
    const me = await seller();
    const other = await seller();
    await notifications.notify(other.sellerId, { type: "info", title: "Theirs", body: "x" });
    const theirs = (await call("GET", "/bell/all", other.authorization)).json as Page;
    const result = await callJson("POST", "/bell/bulk", me.authorization, {
      ids: [theirs.rows[0]?.id],
      action: "trash",
    });
    expect(result.json).toEqual({ changed: 0 });
    expect(((await call("GET", "/bell/all", other.authorization)).json as Page).total).toBe(1);
  });

  // Banners and modals: notices shown on the dashboard until the seller acknowledges them.
  type Notices = {
    modals: { id: string; title: string }[];
    banners: { id: string; title: string }[];
  };

  /** Saves one notification straight into the table, as an admin campaign would. */
  async function addNotice(
    sellerId: string,
    display: "bell" | "banner" | "modal",
    title: string,
    extra: { endsAt?: Date; hiddenUntil?: Date; createdAt?: Date } = {},
  ): Promise<string> {
    const rows = await db
      .insert(sellerNotifications)
      .values({ sellerId, type: "info", display, title, body: "x", ...extra })
      .returning({ id: sellerNotifications.id });
    const row = rows[0];
    if (!row) {
      throw new Error("notification not saved");
    }
    return row.id;
  }

  async function notices(authorization: string): Promise<Notices> {
    return (await call("GET", "/bell/notices", authorization)).json as Notices;
  }

  it("notices: banners and modals to show now, oldest first", async () => {
    const me = await seller();
    const other = await seller();
    await addNotice(me.sellerId, "bell", "Bell only");
    await addNotice(me.sellerId, "modal", "Second modal", { createdAt: new Date(Date.now() - 1000) });
    await addNotice(me.sellerId, "modal", "First modal", { createdAt: new Date(Date.now() - 5000) });
    await addNotice(me.sellerId, "banner", "Banner");
    await addNotice(me.sellerId, "banner", "Ended", { endsAt: new Date(Date.now() - 60_000) });
    await addNotice(me.sellerId, "banner", "Hidden today", {
      hiddenUntil: new Date(Date.now() + 60_000),
    });
    await addNotice(me.sellerId, "banner", "Hidden yesterday", {
      hiddenUntil: new Date(Date.now() - 60_000),
    });
    await addNotice(other.sellerId, "modal", "Not mine");

    const result = await notices(me.authorization);
    expect(result.modals.map((item) => item.title)).toEqual(["First modal", "Second modal"]);
    expect(result.banners.map((item) => item.title).sort()).toEqual(["Banner", "Hidden yesterday"]);
    expect((await call("GET", "/bell/notices", "Bearer nope")).status).toBe(401);
  });

  it("acknowledge: gone for good and marked read; trashing doesn't skip a modal", async () => {
    const me = await seller();
    const modalId = await addNotice(me.sellerId, "modal", "Read this");
    // Trashing it from the bell is not the same as acknowledging it.
    await call("POST", `/bell/${modalId}/trash`, me.authorization);
    expect((await notices(me.authorization)).modals).toHaveLength(1);

    expect((await call("POST", `/bell/${modalId}/acknowledge`, me.authorization)).status).toBe(200);
    expect((await notices(me.authorization)).modals).toEqual([]);
    const rows = await db
      .select()
      .from(sellerNotifications)
      .where(eq(sellerNotifications.id, modalId));
    const saved = rows[0];
    if (!saved) {
      throw new Error("notification missing");
    }
    expect(saved.acknowledgedAt).not.toBeNull();
    expect(saved.readAt).not.toBeNull();
    // A second tap is fine.
    expect((await call("POST", `/bell/${modalId}/acknowledge`, me.authorization)).status).toBe(200);
  });

  it("hide: a banner comes back a day later; a modal can't be hidden", async () => {
    const me = await seller();
    const bannerId = await addNotice(me.sellerId, "banner", "Tip");
    const modalId = await addNotice(me.sellerId, "modal", "Important");

    const hidden = await call("POST", `/bell/${bannerId}/hide`, me.authorization);
    expect(hidden.status).toBe(200);
    expect((await notices(me.authorization)).banners).toEqual([]);
    const rows = await db
      .select()
      .from(sellerNotifications)
      .where(eq(sellerNotifications.id, bannerId));
    const hiddenUntil = rows[0]?.hiddenUntil;
    if (!hiddenUntil) {
      throw new Error("hiddenUntil not set");
    }
    const hoursAway = (hiddenUntil.getTime() - Date.now()) / (60 * 60 * 1000);
    expect(hoursAway).toBeGreaterThan(23.9);
    expect(hoursAway).toBeLessThanOrEqual(24);

    // A day later (moved back in time here) it shows again.
    await db
      .update(sellerNotifications)
      .set({ hiddenUntil: new Date(Date.now() - 1000) })
      .where(eq(sellerNotifications.id, bannerId));
    expect((await notices(me.authorization)).banners).toHaveLength(1);

    expect((await call("POST", `/bell/${modalId}/hide`, me.authorization)).status).toBe(409);
    expect((await notices(me.authorization)).modals).toHaveLength(1);
  });

  it("another seller's notice can't be acknowledged or hidden", async () => {
    const me = await seller();
    const other = await seller();
    const theirs = await addNotice(other.sellerId, "banner", "Theirs");
    expect((await call("POST", `/bell/${theirs}/acknowledge`, me.authorization)).status).toBe(404);
    expect((await call("POST", `/bell/${theirs}/hide`, me.authorization)).status).toBe(404);
    expect((await notices(other.authorization)).banners).toHaveLength(1);
  });

  it("a binned campaign's modal disappears", async () => {
    const me = await seller();
    const campaigns = await db
      .insert(notificationCampaigns)
      .values({ type: "info", display: "modal", title: "Campaign", body: "x", audience: {} })
      .returning({ id: notificationCampaigns.id });
    const campaign = campaigns[0];
    if (!campaign) {
      throw new Error("campaign not created");
    }
    await db.insert(sellerNotifications).values({
      sellerId: me.sellerId,
      campaignId: campaign.id,
      type: "info",
      display: "modal",
      title: "Campaign",
      body: "x",
    });
    expect((await notices(me.authorization)).modals).toHaveLength(1);
    await db
      .update(notificationCampaigns)
      .set({ deletedAt: new Date() })
      .where(eq(notificationCampaigns.id, campaign.id));
    expect((await notices(me.authorization)).modals).toEqual([]);
    await db.delete(notificationCampaigns).where(eq(notificationCampaigns.id, campaign.id));
  });
});
