/** Integration test against the dev Postgres. */
import "reflect-metadata";
import { sellers } from "@gbam/db";
import { ConflictException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { createTestSeller } from "../test-helpers.js";
import { SettingsModule } from "./settings.module.js";
import { SettingsService } from "./settings.service.js";

process.loadEnvFile?.("../../.env");

describe("SettingsService (integration)", () => {
  let moduleRef: TestingModule;
  let service: SettingsService;
  let db: Db;
  const sellerIds: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, SettingsModule],
    }).compile();
    moduleRef.enableShutdownHooks();
    service = moduleRef.get(SettingsService);
    db = moduleRef.get(DB);
  });

  afterAll(async () => {
    if (sellerIds.length > 0) {
      await db.delete(sellers).where(inArray(sellers.id, sellerIds));
    }
    await moduleRef.close();
  });

  async function newSeller() {
    const seller = await createTestSeller(db, "settings");
    sellerIds.push(seller.id);
    return seller;
  }

  it("returns the shop's details and payout account (last 4 digits only)", async () => {
    const seller = await newSeller();
    await db
      .update(sellers)
      .set({ bankName: "Access Bank", accountLast4: "6789", bankAccountName: "ADA OBI" })
      .where(eq(sellers.id, seller.id));

    const settings = await service.get(seller.id);

    expect(settings).toEqual({
      slug: seller.slug,
      businessName: seller.businessName,
      phone: seller.whatsappPhone,
      payoutAccount: { bankName: "Access Bank", accountLast4: "6789", bankAccountName: "ADA OBI" },
      newOrderEmails: true,
      newsEmails: true,
    });
  });

  it("turns new-order emails off and back on", async () => {
    const seller = await newSeller();

    const off = await service.updateEmails(seller.id, { newOrderEmails: false });
    expect(off.newOrderEmails).toBe(false);

    const on = await service.updateEmails(seller.id, { newOrderEmails: true });
    expect(on.newOrderEmails).toBe(true);
  });

  it("email settings save newsEmails, and leave it alone when not sent", async () => {
    const seller = await newSeller();
    const off = await service.updateEmails(seller.id, { newOrderEmails: true, newsEmails: false });
    expect(off.newsEmails).toBe(false);
    // An older page sends only newOrderEmails: news stays as it was.
    const same = await service.updateEmails(seller.id, { newOrderEmails: false });
    expect(same.newsEmails).toBe(false);
    expect(same.newOrderEmails).toBe(false);
  });

  it("has no payout account when none is set up", async () => {
    const seller = await newSeller();
    const settings = await service.get(seller.id);
    expect(settings.payoutAccount).toBeNull();
  });

  it("changes the shop name and WhatsApp number, never the link", async () => {
    const seller = await newSeller();

    const updated = await service.updateShop(seller.id, {
      businessName: "Ada's Kitchen",
      phone: "2990000000001",
    });

    expect(updated.businessName).toBe("Ada's Kitchen");
    expect(updated.phone).toBe("2990000000001");
    expect(updated.slug).toBe(seller.slug);
    const [row] = await db.select().from(sellers).where(eq(sellers.id, seller.id));
    expect(row?.whatsappPhone).toBe("2990000000001");
    // Delete it now, so the fixed number is free again for the next run.
    await db.delete(sellers).where(eq(sellers.id, seller.id));
  });

  it("refuses a WhatsApp number another shop uses, with a phone field error", async () => {
    const first = await newSeller();
    const second = await newSeller();

    const error = await service
      .updateShop(second.id, { businessName: "Second", phone: first.whatsappPhone })
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ConflictException);
    expect((error as ConflictException).getResponse()).toMatchObject({ field: "phone" });
    const [row] = await db.select().from(sellers).where(eq(sellers.id, second.id));
    expect(row?.businessName).toBe(second.businessName);
  });
});
