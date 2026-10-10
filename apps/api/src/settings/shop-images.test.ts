/** Integration test against the dev Postgres (+ Redis db 1): shop logo and banner. */
import "reflect-metadata";
import { sellers } from "@gbam/db";
import { BadRequestException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { EmailQueue } from "../email/email.queue.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { IntegrationsModule, PHOTO_STORAGE } from "../integrations/integrations.module.js";
import { ProductsModule } from "../products/products.module.js";
import { StorefrontService } from "../products/storefront.service.js";
import { createTestSeller } from "../test-helpers.js";
import { SettingsModule } from "./settings.module.js";
import { SettingsService } from "./settings.service.js";
import { ShopImagesService } from "./shop-images.service.js";

process.loadEnvFile?.("../../.env");

describe("shop logo and banner (integration)", () => {
  let moduleRef: TestingModule;
  let images: ShopImagesService;
  let settings: SettingsService;
  let storefront: StorefrontService;
  let db: Db;
  const stored = new Map<string, Buffer>();
  const deleted: string[] = [];
  const sellerIds: string[] = [];
  let photo: Buffer;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, SettingsModule, ProductsModule],
    })
      .overrideProvider(EmailQueue)
      .useValue({ send: async () => undefined })
      .overrideProvider(PHOTO_STORAGE)
      .useValue({
        put: async (key: string, body: Buffer) => {
          stored.set(key, body);
        },
        delete: async (key: string) => {
          deleted.push(key);
        },
        publicUrl: (key: string) => `https://photos.test/${key}`,
      })
      .compile();
    images = moduleRef.get(ShopImagesService);
    settings = moduleRef.get(SettingsService);
    storefront = moduleRef.get(StorefrontService);
    db = moduleRef.get(DB);
    // A real 900 x 600 photo, so the cropping has something to work on.
    photo = await sharp({
      create: { width: 900, height: 600, channels: 3, background: { r: 19, g: 128, b: 79 } },
    })
      .png()
      .toBuffer();
  });

  afterAll(async () => {
    if (sellerIds.length > 0) {
      await db.delete(sellers).where(inArray(sellers.id, sellerIds));
    }
    await moduleRef.close();
  });

  async function shop() {
    const seller = await createTestSeller(db, "images");
    sellerIds.push(seller.id);
    return seller;
  }

  it("a logo is cropped square, a banner wide, and both show on the shop", async () => {
    const seller = await shop();
    const logo = await images.upload(seller.id, "logo", { buffer: photo, size: photo.length });
    const banner = await images.upload(seller.id, "banner", { buffer: photo, size: photo.length });
    expect(logo.url).toMatch(/^https:\/\/photos\.test\/shops\/.+\/logo-.+\.webp$/);
    const logoKey = logo.url.replace("https://photos.test/", "");
    const bannerKey = banner.url.replace("https://photos.test/", "");
    const logoSize = await sharp(stored.get(logoKey)).metadata();
    expect([logoSize.width, logoSize.height]).toEqual([400, 400]);
    const bannerSize = await sharp(stored.get(bannerKey)).metadata();
    expect([bannerSize.width, bannerSize.height]).toEqual([1500, 500]);

    const mine = await settings.get(seller.id);
    expect(mine.logoUrl).toBe(logo.url);
    expect(mine.bannerUrl).toBe(banner.url);
    const page = await storefront.list(seller.slug);
    expect(page.store).toMatchObject({ logoUrl: logo.url, bannerUrl: banner.url });
  });

  it("replacing removes the old file, and removing clears it", async () => {
    const seller = await shop();
    const first = await images.upload(seller.id, "logo", { buffer: photo, size: photo.length });
    await images.upload(seller.id, "logo", { buffer: photo, size: photo.length });
    expect(deleted).toContain(first.url.replace("https://photos.test/", ""));
    await images.remove(seller.id, "logo");
    const rows = await db.select().from(sellers).where(eq(sellers.id, seller.id));
    expect(rows[0]?.logoKey).toBeNull();
    expect((await settings.get(seller.id)).logoUrl).toBeNull();
  });

  it("a file that isn't a photo is refused", async () => {
    const seller = await shop();
    const notPhoto = Buffer.from("hello, not a picture");
    await expect(
      images.upload(seller.id, "banner", { buffer: notPhoto, size: notPhoto.length }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
