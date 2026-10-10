/** Integration test against the dev Postgres (and Redis db 1 for the module's queues). */
import "reflect-metadata";
import {
  adminRoles,
  adminUsers,
  announcements,
  notificationCampaigns,
  sellerNotifications,
  sellers,
  supportTickets,
  ticketMessages,
} from "@gbam/db";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { createTestSeller } from "../test-helpers.js";
import { HousekeepingService } from "./housekeeping.service.js";

process.loadEnvFile?.("../../.env");

const DAY = 24 * 60 * 60 * 1000;

describe("Housekeeping (integration)", () => {
  let moduleRef: TestingModule;
  let db: Db;
  let housekeeping: HousekeepingService;
  const requesterEmail = `house-${randomUUID().slice(0, 8)}@example.com`;
  const roleIds: string[] = [];
  const adminIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule],
      providers: [HousekeepingService],
    }).compile();
    db = moduleRef.get(DB);
    housekeeping = moduleRef.get(HousekeepingService);
  });

  afterAll(async () => {
    await db.delete(supportTickets).where(eq(supportTickets.requesterEmail, requesterEmail));
    if (adminIds.length > 0) {
      await db.delete(adminUsers).where(inArray(adminUsers.id, adminIds));
    }
    if (roleIds.length > 0) {
      await db.delete(adminRoles).where(inArray(adminRoles.id, roleIds));
    }
    await moduleRef.close();
  });

  async function ticket(fields: Partial<typeof supportTickets.$inferInsert>): Promise<string> {
    const rows = await db
      .insert(supportTickets)
      .values({
        subject: "Housekeeping test",
        source: "seller",
        requesterName: "Ada",
        requesterEmail,
        ...fields,
      })
      .returning({ id: supportTickets.id });
    const row = rows[0];
    if (!row) {
      throw new Error("ticket not created");
    }
    return row.id;
  }

  async function statusOf(id: string): Promise<string | undefined> {
    const rows = await db.select().from(supportTickets).where(eq(supportTickets.id, id));
    return rows[0]?.status;
  }

  async function role(deletedDaysAgo: number): Promise<string> {
    const rows = await db
      .insert(adminRoles)
      .values({
        name: `House role ${randomUUID().slice(0, 8)}`,
        deletedAt: new Date(Date.now() - deletedDaysAgo * DAY),
      })
      .returning({ id: adminRoles.id });
    const row = rows[0];
    if (!row) {
      throw new Error("role not created");
    }
    roleIds.push(row.id);
    return row.id;
  }

  it("solved for 7 days closes, with a note in the thread", async () => {
    const old = await ticket({ status: "solved", solvedAt: new Date(Date.now() - 8 * DAY) });
    const recent = await ticket({ status: "solved", solvedAt: new Date(Date.now() - 2 * DAY) });
    await housekeeping.run(new Date());
    expect(await statusOf(old)).toBe("closed");
    expect(await statusOf(recent)).toBe("solved");
    const messages = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, old));
    expect(messages).toHaveLength(1);
    expect(messages[0]).toMatchObject({ author: "system", internal: false });
  });

  it("a reply after solving keeps it open", async () => {
    // A requester reply re-opens a solved ticket and clears solvedAt (TicketsService).
    const reopened = await ticket({ status: "open", solvedAt: null });
    await housekeeping.run(new Date(Date.now() + 30 * DAY));
    expect(await statusOf(reopened)).toBe("open");
  });

  it("running twice changes nothing more", async () => {
    const old = await ticket({ status: "solved", solvedAt: new Date(Date.now() - 9 * DAY) });
    await housekeeping.run(new Date());
    await housekeeping.run(new Date());
    const messages = await db.select().from(ticketMessages).where(eq(ticketMessages.ticketId, old));
    expect(messages).toHaveLength(1);
  });

  it("bin older than 30 days is purged, newer kept", async () => {
    const gone = await ticket({ deletedAt: new Date(Date.now() - 31 * DAY) });
    const kept = await ticket({ deletedAt: new Date(Date.now() - 5 * DAY) });
    await housekeeping.run(new Date());
    expect(await statusOf(gone)).toBeUndefined();
    expect(await statusOf(kept)).toBe("open");
  });

  it("roles in the bin purged only when unused", async () => {
    const unused = await role(31);
    const used = await role(31);
    const fresh = await role(3);
    const admins = await db
      .insert(adminUsers)
      .values({
        email: `house-admin-${randomUUID().slice(0, 8)}@example.com`,
        name: "Removed admin",
        passwordHash: "x",
        totpSecretEnc: "x",
        roleId: used,
        removedAt: new Date(),
      })
      .returning({ id: adminUsers.id });
    const admin = admins[0];
    if (!admin) {
      throw new Error("admin not created");
    }
    adminIds.push(admin.id);
    await housekeeping.run(new Date());
    const left = await db
      .select()
      .from(adminRoles)
      .where(inArray(adminRoles.id, [unused, used, fresh]));
    const leftIds: string[] = [];
    for (const row of left) {
      leftIds.push(row.id);
    }
    expect(leftIds.sort()).toEqual([used, fresh].sort());
  });
  it("announcements and notification campaigns in the bin over 30 days are purged", async () => {
    const old = new Date(Date.now() - 31 * DAY);
    const recent = new Date(Date.now() - 2 * DAY);
    const made = await db
      .insert(announcements)
      .values([
        { subject: "Old", body: "x", audience: {}, deletedAt: old },
        { subject: "Recent", body: "x", audience: {}, deletedAt: recent },
      ])
      .returning({ id: announcements.id });
    const campaigns = await db
      .insert(notificationCampaigns)
      .values([
        { type: "info", title: "Old", body: "x", audience: {}, deletedAt: old },
        { type: "info", title: "Recent", body: "x", audience: {}, deletedAt: recent },
      ])
      .returning({ id: notificationCampaigns.id });
    await housekeeping.run(new Date());
    const announcementIds: string[] = [];
    for (const row of made) {
      announcementIds.push(row.id);
    }
    const campaignIds: string[] = [];
    for (const row of campaigns) {
      campaignIds.push(row.id);
    }
    const leftAnnouncements = await db
      .select()
      .from(announcements)
      .where(inArray(announcements.id, announcementIds));
    expect(leftAnnouncements.map((row) => row.subject)).toEqual(["Recent"]);
    const leftCampaigns = await db
      .select()
      .from(notificationCampaigns)
      .where(inArray(notificationCampaigns.id, campaignIds));
    expect(leftCampaigns.map((row) => row.title)).toEqual(["Recent"]);
    await db.delete(announcements).where(inArray(announcements.id, announcementIds));
    await db.delete(notificationCampaigns).where(inArray(notificationCampaigns.id, campaignIds));
  });
  it("notifications in a seller's trash over 30 days are deleted for good", async () => {
    const seller = await createTestSeller(db, "house");
    try {
      const rows = await db
        .insert(sellerNotifications)
        .values([
          {
            sellerId: seller.id,
            type: "info",
            title: "Old",
            body: "x",
            deletedAt: new Date(Date.now() - 31 * DAY),
          },
          {
            sellerId: seller.id,
            type: "info",
            title: "Recent",
            body: "x",
            deletedAt: new Date(Date.now() - 2 * DAY),
          },
          { sellerId: seller.id, type: "info", title: "Kept", body: "x" },
        ])
        .returning({ id: sellerNotifications.id });
      await housekeeping.run(new Date());
      const ids: string[] = [];
      for (const row of rows) {
        ids.push(row.id);
      }
      const left = await db
        .select()
        .from(sellerNotifications)
        .where(inArray(sellerNotifications.id, ids));
      expect(left.map((row) => row.title).sort()).toEqual(["Kept", "Recent"]);
    } finally {
      await db.delete(sellers).where(eq(sellers.id, seller.id));
    }
  });
});
