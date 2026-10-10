/** Integration test against the dev Postgres (+ Redis db 1). The email client is a recorder. */
import "reflect-metadata";
import { announcementRecipients, announcements, sellers, users } from "@gbam/db";
import { EmailError, type SendEmailInput } from "@gbam/integrations";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { EMAIL, IntegrationsModule } from "../integrations/integrations.module.js";
import { createTestSeller } from "../test-helpers.js";
import { AnnouncementSenderService } from "./announcement-sender.service.js";
import { MessagingModule } from "./messaging.module.js";

process.loadEnvFile?.("../../.env");
process.env.UNSUBSCRIBE_SIGNING_KEY = "sender-test-key-0123456789abcdef0123";

describe("Announcement sender (integration)", () => {
  let moduleRef: TestingModule;
  let db: Db;
  let sender: AnnouncementSenderService;
  const delivered: SendEmailInput[] = [];
  // Addresses the fake provider refuses, to test failures.
  const refuse = new Set<string>();
  const sellerIds: string[] = [];
  const userIds: string[] = [];
  const announcementIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, MessagingModule],
      providers: [AnnouncementSenderService],
    })
      .overrideProvider(EMAIL)
      .useValue({
        send: async (input: SendEmailInput) => {
          if (refuse.has(input.to)) {
            throw new EmailError("Address rejected", 422);
          }
          delivered.push(input);
          return { id: `test-${delivered.length}` };
        },
      })
      .compile();
    db = moduleRef.get(DB);
    sender = moduleRef.get(AnnouncementSenderService);
  });

  afterAll(async () => {
    if (announcementIds.length > 0) {
      await db.delete(announcements).where(inArray(announcements.id, announcementIds));
    }
    if (sellerIds.length > 0) {
      await db.delete(sellers).where(inArray(sellers.id, sellerIds));
    }
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await moduleRef.close();
  });

  beforeEach(() => {
    delivered.length = 0;
    refuse.clear();
  });

  async function shop(): Promise<{ id: string; email: string }> {
    const seller = await createTestSeller(db, "sender");
    const email = `sender-${randomUUID().slice(0, 8)}@example.com`;
    const rows = await db
      .insert(users)
      .values({ email, passwordHash: "x" })
      .returning({ id: users.id });
    const user = rows[0];
    if (!user) {
      throw new Error("user not created");
    }
    userIds.push(user.id);
    sellerIds.push(seller.id);
    await db.update(sellers).set({ ownerUserId: user.id }).where(eq(sellers.id, seller.id));
    return { id: seller.id, email };
  }

  /** An announcement whose audience is just this test's shop. */
  async function announcementFor(shopId: string, status: "sending" | "scheduled" | "cancelled") {
    const rows = await db
      .insert(announcements)
      .values({
        subject: "Delivery zones are here",
        body: "Hello **sellers**",
        audience: { shopId },
        status,
      })
      .returning({ id: announcements.id });
    const row = rows[0];
    if (!row) {
      throw new Error("announcement not created");
    }
    announcementIds.push(row.id);
    return row.id;
  }

  async function recipients(id: string) {
    return db
      .select()
      .from(announcementRecipients)
      .where(eq(announcementRecipients.announcementId, id));
  }

  async function statusOf(id: string) {
    const rows = await db.select().from(announcements).where(eq(announcements.id, id));
    return rows[0];
  }

  it("sends to everyone in the audience with unsubscribe headers", async () => {
    const target = await shop();
    const id = await announcementFor(target.id, "sending");
    await sender.run(id);
    expect(delivered).toHaveLength(1);
    expect(delivered[0]?.to).toBe(target.email);
    expect(delivered[0]?.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(delivered[0]?.headers?.["List-Unsubscribe"]).toContain(`s=${target.id}`);
    const rows = await recipients(id);
    expect(rows.map((row) => row.status)).toEqual(["sent"]);
    const after = await statusOf(id);
    expect(after?.status).toBe("sent");
    expect(after?.sentAt).not.toBeNull();
  });

  it("resolved at send time", async () => {
    const target = await shop();
    const id = await announcementFor(target.id, "scheduled");
    // Between scheduling and sending, the seller unsubscribed.
    await db.update(sellers).set({ newsEmails: false }).where(eq(sellers.id, target.id));
    await sender.run(id);
    expect(delivered).toHaveLength(0);
    expect(await recipients(id)).toHaveLength(0);
    expect((await statusOf(id))?.status).toBe("sent");
  });

  it("rerun sends nobody twice", async () => {
    const target = await shop();
    const id = await announcementFor(target.id, "sending");
    await sender.run(id);
    // As if the job had been retried after the first run.
    await db.update(announcements).set({ status: "sending" }).where(eq(announcements.id, id));
    await sender.run(id);
    expect(delivered).toHaveLength(1);
    expect(await recipients(id)).toHaveLength(1);
  });

  it("a failed send is counted and others continue", async () => {
    const target = await shop();
    refuse.add(target.email);
    const id = await announcementFor(target.id, "sending");
    await sender.run(id);
    const rows = await recipients(id);
    expect(rows[0]?.status).toBe("failed");
    expect(rows[0]?.error).toBe("Address rejected");
    expect((await statusOf(id))?.status).toBe("sent");
  });

  it("cancelled announcement sends nothing", async () => {
    const target = await shop();
    const id = await announcementFor(target.id, "cancelled");
    await sender.run(id);
    expect(delivered).toHaveLength(0);
    expect((await statusOf(id))?.status).toBe("cancelled");
  });
});
