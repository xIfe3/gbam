/**
 * HTTP-level test of photo upload/delete: a real Nest app on a random port, the dev
 * Postgres and Redis db 1, a LocalPhotoStorage in a temp folder, and plain fetch().
 */
import "reflect-metadata";
import { productImages, products, sellers, users } from "@gbam/db";
import { LocalPhotoStorage } from "@gbam/integrations";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq, inArray } from "drizzle-orm";
import type { Redis } from "ioredis";
import { randomInt, randomUUID } from "node:crypto";
import { access, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import sharp from "sharp";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { AuthModule } from "../auth/auth.module.js";
import { AuthService } from "../auth/auth.service.js";
import { DomainErrorsFilter } from "../common/domain-errors.filter.js";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { IntegrationsModule, PHOTO_STORAGE } from "../integrations/integrations.module.js";
import { PhotosService } from "./photos.service.js";
import { ProductsModule } from "./products.module.js";

process.loadEnvFile?.("../../.env");
const INTERNAL_SECRET = "photos-http-test-internal-secret-0123456789";
process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;

const PUBLIC_BASE = "http://photos.test";

describe("Photo endpoints over HTTP (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let redis: Redis;
  let auth: AuthService;
  let photos: PhotosService;
  let storage: LocalPhotoStorage;
  let folder: string;
  let jpeg: Buffer;
  const createdEmails: string[] = [];
  const sellerIds: string[] = [];

  beforeAll(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "gbam-photos-"));
    storage = new LocalPhotoStorage(folder, PUBLIC_BASE);
    const fakeQueue = { send: async (_jobId: string, _job: EmailJob) => {} };
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, AuthModule, ProductsModule],
    })
      .overrideProvider(EmailQueue)
      .useValue(fakeQueue)
      .overrideProvider(PHOTO_STORAGE)
      .useValue(storage)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalFilters(new DomainErrorsFilter());
    await app.listen(0, "127.0.0.1");
    baseUrl = await app.getUrl();
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);
    auth = moduleRef.get(AuthService);
    photos = moduleRef.get(PhotosService);

    jpeg = await sharp({
      create: { width: 600, height: 400, channels: 3, background: "#3366cc" },
    })
      .jpeg()
      .toBuffer();
  });

  afterAll(async () => {
    const rows = await db.select().from(users).where(inArray(users.email, createdEmails));
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(sellers).where(inArray(sellers.ownerUserId, ids)); // cascades to images
      await db.delete(users).where(inArray(users.id, ids));
    }
    const keys: string[] = [];
    for (const id of sellerIds) {
      keys.push(`photo-upload:${id}`);
    }
    if (keys.length > 0) {
      await redis.del(...keys);
    }
    await app.close();
    await rm(folder, { recursive: true, force: true });
  });

  async function newSeller(verified: boolean) {
    const id = randomUUID().slice(0, 8);
    let phone = "298";
    for (let i = 0; i < 10; i++) {
      phone = phone + String(randomInt(10));
    }
    const email = `phototest-${id}@example.com`;
    createdEmails.push(email);
    const result = await auth.signup(
      {
        businessName: "Photo Test",
        slug: `phototest-${id}`,
        phone,
        email,
        password: "correct horse battery",
      },
      { ip: "203.0.113.11", userAgent: "vitest" },
    );
    if (verified) {
      await db
        .update(users)
        .set({ emailVerifiedAt: new Date() })
        .where(eq(users.id, result.user.id));
    }
    const seller = result.user.seller;
    if (!seller) {
      throw new Error("Signup made no shop");
    }
    sellerIds.push(seller.id);
    return { authorization: `Bearer ${result.sessionToken}`, sellerId: seller.id };
  }

  async function upload(authorization: string, file: Buffer, fileName = "photo.jpg") {
    const form = new FormData();
    form.append("photo", new Blob([new Uint8Array(file)]), fileName);
    const res = await fetch(`${baseUrl}/products/images`, {
      method: "POST",
      headers: {
        authorization,
        "x-client-ip": `test-${randomUUID()}`,
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: form,
    });
    const text = await res.text();
    let json: unknown = null;
    if (text !== "") {
      json = JSON.parse(text);
    }
    return { status: res.status, json };
  }

  async function remove(authorization: string, id: string) {
    const res = await fetch(`${baseUrl}/products/images/${id}`, {
      method: "DELETE",
      headers: {
        authorization,
        "x-client-ip": `test-${randomUUID()}`,
        "x-internal-secret": INTERNAL_SECRET,
      },
    });
    return res.status;
  }

  async function fileExists(key: string) {
    try {
      await access(path.join(folder, key));
      return true;
    } catch {
      return false;
    }
  }

  async function imageRow(id: string) {
    const rows = await db.select().from(productImages).where(eq(productImages.id, id));
    return rows[0];
  }

  it("stores both sizes and returns { id, smallUrl }", async () => {
    const seller = await newSeller(true);
    const res = await upload(seller.authorization, jpeg);
    expect(res.status).toBe(201);
    const body = res.json as { id: string; smallUrl: string };
    const row = await imageRow(body.id);
    if (!row) {
      throw new Error("Image row missing");
    }
    expect(row.productId).toBeNull();
    expect(row.sellerId).toBe(seller.sellerId);
    expect(row.largeKey.startsWith(`${seller.sellerId}/`)).toBe(true);
    expect(row.largeKey.endsWith("-l.webp")).toBe(true);
    expect(row.smallKey.endsWith("-s.webp")).toBe(true);
    expect(body.smallUrl).toBe(`${PUBLIC_BASE}/${row.smallKey}`);
    expect(await fileExists(row.largeKey)).toBe(true);
    expect(await fileExists(row.smallKey)).toBe(true);
  });

  it("answers 413 for a file over 10 MB", async () => {
    const seller = await newSeller(true);
    const big = Buffer.alloc(11 * 1024 * 1024, 1);
    const res = await upload(seller.authorization, big);
    expect(res.status).toBe(413);
    expect(res.json).toMatchObject({ message: "Photos can be up to 10 MB" });
  });

  it("answers 400 for a text file renamed to .jpg", async () => {
    const seller = await newSeller(true);
    const res = await upload(seller.authorization, Buffer.from("not a photo"), "fake.jpg");
    expect(res.status).toBe(400);
    expect(res.json).toMatchObject({ message: "We can't read this photo. Try a JPEG or PNG." });
  });

  it("answers 403 for an unverified seller", async () => {
    const seller = await newSeller(false);
    const res = await upload(seller.authorization, jpeg);
    expect(res.status).toBe(403);
  });

  it("answers 429 on the 61st upload within an hour", async () => {
    const seller = await newSeller(true);
    // Setting the counter to 60 stands in for 60 real uploads (which would be slow).
    await redis.set(`photo-upload:${seller.sellerId}`, "60", "EX", 3600);
    const res = await upload(seller.authorization, jpeg);
    expect(res.status).toBe(429);
    expect(res.json).toHaveProperty("retryAfterSeconds");
    const rows = await db
      .select()
      .from(productImages)
      .where(eq(productImages.sellerId, seller.sellerId));
    expect(rows).toHaveLength(0);
  });

  it("lets only the owner delete an unattached photo", async () => {
    const owner = await newSeller(true);
    const other = await newSeller(true);
    const uploaded = await upload(owner.authorization, jpeg);
    const id = (uploaded.json as { id: string }).id;
    const row = await imageRow(id);
    if (!row) {
      throw new Error("Image row missing");
    }

    expect(await remove(other.authorization, id)).toBe(404);
    expect(await imageRow(id)).toBeDefined();

    expect(await remove(owner.authorization, id)).toBe(204);
    expect(await imageRow(id)).toBeUndefined();
    expect(await fileExists(row.largeKey)).toBe(false);
    expect(await fileExists(row.smallKey)).toBe(false);
  });

  it("cleanupOrphans removes old unattached photos only", async () => {
    const seller = await newSeller(true);

    async function makeImage(createdAt: Date, productId: string | null) {
      const base = `${seller.sellerId}/${randomUUID()}`;
      const largeKey = `${base}-l.webp`;
      const smallKey = `${base}-s.webp`;
      await storage.put(largeKey, Buffer.from("l"), "image/webp");
      await storage.put(smallKey, Buffer.from("s"), "image/webp");
      const inserted = await db
        .insert(productImages)
        .values({
          sellerId: seller.sellerId,
          productId,
          largeKey,
          smallKey,
          width: 10,
          height: 10,
          createdAt,
        })
        .returning();
      const row = inserted[0];
      if (!row) {
        throw new Error("Insert failed");
      }
      return row;
    }

    const productRows = await db
      .insert(products)
      .values({ sellerId: seller.sellerId, name: "Cleanup product", priceKobo: 20_000 })
      .returning();
    const product = productRows[0];
    if (!product) {
      throw new Error("No product");
    }

    const dayAndAHalf = new Date(Date.now() - 36 * 60 * 60 * 1000);
    const anHour = new Date(Date.now() - 60 * 60 * 1000);
    const oldOrphan = await makeImage(dayAndAHalf, null);
    const newOrphan = await makeImage(anHour, null);
    const oldAttached = await makeImage(dayAndAHalf, product.id);

    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const count = await photos.cleanupOrphans(cutoff);
    expect(count).toBeGreaterThanOrEqual(1);

    expect(await imageRow(oldOrphan.id)).toBeUndefined();
    expect(await fileExists(oldOrphan.largeKey)).toBe(false);
    expect(await fileExists(oldOrphan.smallKey)).toBe(false);
    expect(await imageRow(newOrphan.id)).toBeDefined();
    expect(await fileExists(newOrphan.largeKey)).toBe(true);
    expect(await imageRow(oldAttached.id)).toBeDefined();
    expect(await fileExists(oldAttached.largeKey)).toBe(true);
  });

  it("deleteFiles logs instead of throwing when storage fails", async () => {
    // "../x" is refused by LocalPhotoStorage, which makes delete() throw.
    await expect(photos.deleteFiles(["../x"])).resolves.toBeUndefined();
  });

  it("urlsFor builds public addresses", () => {
    const urls = photos.urlsFor({ largeKey: "a/b-l.webp", smallKey: "a/b-s.webp" });
    expect(urls).toEqual({
      large: `${PUBLIC_BASE}/a/b-l.webp`,
      small: `${PUBLIC_BASE}/a/b-s.webp`,
    });
  });
});
