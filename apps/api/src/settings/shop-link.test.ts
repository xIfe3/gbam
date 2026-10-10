/** Integration test against the dev Postgres: changing a shop's link (slug). */
import "reflect-metadata";
import { sellers } from "@gbam/db";
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthService } from "../auth/auth.service.js";
import { EmailQueue } from "../email/email.queue.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { ProductsModule } from "../products/products.module.js";
import { StorefrontService } from "../products/storefront.service.js";
import { createTestSeller } from "../test-helpers.js";
import { SettingsModule } from "./settings.module.js";
import { SettingsService } from "./settings.service.js";

process.loadEnvFile?.("../../.env");

describe("changing the shop link (integration)", () => {
  let moduleRef: TestingModule;
  let settings: SettingsService;
  let storefront: StorefrontService;
  let auth: AuthService;
  let db: Db;
  const sellerIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, SettingsModule, ProductsModule],
    })
      .overrideProvider(EmailQueue)
      .useValue({ send: async () => undefined })
      .compile();
    settings = moduleRef.get(SettingsService);
    storefront = moduleRef.get(StorefrontService);
    auth = moduleRef.get(AuthService);
    db = moduleRef.get(DB);
  });

  afterAll(async () => {
    if (sellerIds.length > 0) {
      await db.delete(sellers).where(inArray(sellers.id, sellerIds));
    }
    await moduleRef.close();
  });

  async function shop() {
    const seller = await createTestSeller(db, "slug");
    sellerIds.push(seller.id);
    return seller;
  }

  const fresh = () => `newlink-${randomUUID().slice(0, 8)}`;

  it("changes the link, and the old one points to the new one", async () => {
    const seller = await shop();
    const next = fresh();
    const result = await settings.changeSlug(seller.id, next);
    expect(result.slug).toBe(next);
    const rows = await db.select().from(sellers).where(eq(sellers.id, seller.id));
    expect(rows[0]?.slug).toBe(next);
    // The old link now says where the shop moved.
    let caught: unknown = null;
    try {
      await storefront.list(seller.slug);
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(NotFoundException);
    expect((caught as NotFoundException).getResponse()).toMatchObject({
      code: "SHOP_MOVED",
      slug: next,
    });
  });

  it("nobody else can take an old link", async () => {
    const seller = await shop();
    await settings.changeSlug(seller.id, fresh());
    expect(await auth.slugAvailable(seller.slug)).toEqual({ available: false, reason: "taken" });
    const other = await shop();
    await expect(settings.changeSlug(other.id, seller.slug)).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it("at most once every 30 days", async () => {
    const seller = await shop();
    await settings.changeSlug(seller.id, fresh());
    await expect(settings.changeSlug(seller.id, fresh())).rejects.toThrow(/next change/i);
  });

  it("a shop can go back to its own old link (after the wait)", async () => {
    const seller = await shop();
    const next = fresh();
    await settings.changeSlug(seller.id, next);
    // As if 31 days have passed.
    await db
      .update(sellers)
      .set({ slugChangedAt: new Date(Date.now() - 31 * 24 * 60 * 60 * 1000) })
      .where(eq(sellers.id, seller.id));
    expect(await settings.slugAvailableFor(seller.id, seller.slug)).toEqual({ available: true });
    const back = await settings.changeSlug(seller.id, seller.slug);
    expect(back.slug).toBe(seller.slug);
    // And the link it left now points back here.
    await expect(storefront.list(next)).rejects.toBeInstanceOf(NotFoundException);
    expect((await storefront.list(seller.slug)).store.slug).toBe(seller.slug);
  });

  it("taken, reserved, invalid or unchanged links are refused", async () => {
    const seller = await shop();
    const other = await shop();
    await expect(settings.changeSlug(seller.id, other.slug)).rejects.toBeInstanceOf(
      ConflictException,
    );
    await expect(settings.changeSlug(seller.id, "admin")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(settings.changeSlug(seller.id, "Bad Link")).rejects.toBeInstanceOf(
      BadRequestException,
    );
    await expect(settings.changeSlug(seller.id, seller.slug)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(await settings.slugAvailableFor(seller.id, other.slug)).toEqual({
      available: false,
      reason: "taken",
    });
  });
});
