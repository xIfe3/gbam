/** Integration test against the dev Postgres + Redis (db 1), plus the unsubscribe endpoint over HTTP. */
import "reflect-metadata";
import { sellers, users } from "@gbam/db";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { createTestProduct, createTestSeller } from "../test-helpers.js";
import { AudienceService } from "./audience.service.js";
import { MessagingModule } from "./messaging.module.js";
import { checkUnsubscribeToken, unsubscribeToken } from "./unsubscribe.js";

process.loadEnvFile?.("../../.env");
const KEY = "audience-test-signing-key-0123456789abcdef";
process.env.UNSUBSCRIBE_SIGNING_KEY = KEY;

type Shop = { id: string; email: string };

describe("Audience and unsubscribe (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let audience: AudienceService;
  const userIds: string[] = [];
  const sellerIds: string[] = [];
  // Every shop in this test signs up "today", so signedUpFrom/To narrows to just them.
  const today = new Date(Date.now() + 3_600_000).toISOString().slice(0, 10);
  const mine = { signedUpFrom: today, signedUpTo: today };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, MessagingModule],
    }).compile();
    app = moduleRef.createNestApplication();
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    db = moduleRef.get(DB);
    audience = moduleRef.get(AudienceService);
  });

  afterAll(async () => {
    if (sellerIds.length > 0) {
      await db.delete(sellers).where(inArray(sellers.id, sellerIds));
    }
    if (userIds.length > 0) {
      await db.delete(users).where(inArray(users.id, userIds));
    }
    await app.close();
  });

  /** A shop with an owner. */
  async function shop(options: { verified?: boolean } = {}): Promise<Shop> {
    const seller = await createTestSeller(db, "audience");
    const email = `audience-${randomUUID().slice(0, 8)}@example.com`;
    let verifiedAt: Date | null = null;
    if (options.verified) {
      verifiedAt = new Date();
    }
    const rows = await db
      .insert(users)
      .values({ email, passwordHash: "x", emailVerifiedAt: verifiedAt })
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

  async function idsFor(filters: Record<string, unknown>, forEmail: boolean): Promise<string[]> {
    const list = await audience.sellers({ ...mine, ...filters }, forEmail);
    const ids: string[] = [];
    for (const item of list) {
      ids.push(item.sellerId);
    }
    return ids;
  }

  it("filters narrow the audience", async () => {
    const plain = await shop();
    const verified = await shop({ verified: true });
    await createTestProduct(db, verified.id, { name: "Chin chin", priceKobo: 20_000 });
    await db
      .update(sellers)
      .set({ paystackSubaccountCode: "ACCT_test" })
      .where(eq(sellers.id, verified.id));

    const everyone = await idsFor({}, false);
    expect(everyone).toEqual(expect.arrayContaining([plain.id, verified.id]));
    expect(await idsFor({ verified: true }, false)).toContain(verified.id);
    expect(await idsFor({ verified: true }, false)).not.toContain(plain.id);
    expect(await idsFor({ hasProducts: true }, false)).toEqual([verified.id]);
    expect(await idsFor({ hasBank: false }, false)).not.toContain(verified.id);
    expect(await idsFor({ shopId: plain.id }, false)).toEqual([plain.id]);
    // Neither has ever had a paid order.
    expect(await idsFor({ noOrderDays: 30 }, false)).toEqual(
      expect.arrayContaining([plain.id, verified.id]),
    );
    expect(await audience.count({ ...mine, shopId: plain.id }, false)).toBe(1);
    const list = await audience.sellers({ ...mine, shopId: verified.id }, true);
    expect(list[0]?.email).toBe(verified.email);
  });

  it("suspended and closed never included", async () => {
    const suspended = await shop();
    const closed = await shop();
    await db.update(sellers).set({ suspendedAt: new Date() }).where(eq(sellers.id, suspended.id));
    await db.update(sellers).set({ closedAt: new Date() }).where(eq(sellers.id, closed.id));
    const ids = await idsFor({}, false);
    expect(ids).not.toContain(suspended.id);
    expect(ids).not.toContain(closed.id);
    expect(await idsFor({ shopId: suspended.id }, false)).toEqual([]);
  });

  it("unsubscribed left out of email only", async () => {
    const quiet = await shop();
    await db.update(sellers).set({ newsEmails: false }).where(eq(sellers.id, quiet.id));
    expect(await idsFor({ shopId: quiet.id }, true)).toEqual([]);
    expect(await idsFor({ shopId: quiet.id }, false)).toEqual([quiet.id]);
  });

  it("valid token unsubscribes", async () => {
    const reader = await shop();
    const token = unsubscribeToken(reader.id, KEY);
    expect(checkUnsubscribeToken(reader.id, token, KEY)).toBe(true);
    const res = await fetch(`${baseUrl}/email/unsubscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ s: reader.id, t: token }),
    });
    expect(res.status).toBe(200);
    const rows = await db.select().from(sellers).where(eq(sellers.id, reader.id));
    expect(rows[0]?.newsEmails).toBe(false);
  });

  it("forged token refused", async () => {
    const reader = await shop();
    const other = await shop();
    const forged = unsubscribeToken(other.id, KEY);
    expect(checkUnsubscribeToken(reader.id, forged, KEY)).toBe(false);
    expect(checkUnsubscribeToken(reader.id, "short", KEY)).toBe(false);
    const res = await fetch(`${baseUrl}/email/unsubscribe`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ s: reader.id, t: forged }),
    });
    expect(res.status).toBe(400);
    const rows = await db.select().from(sellers).where(eq(sellers.id, reader.id));
    expect(rows[0]?.newsEmails).toBe(true);
  });
});
