/**
 * HTTP-level test of the seller product endpoints: a real Nest app on a random port, the
 * dev Postgres and Redis db 1, a LocalPhotoStorage in a temp folder, and plain fetch().
 */
import { TEST_DELIVERY } from "../test-helpers.js";
import "reflect-metadata";
import {
  customers,
  orderItems,
  orders,
  productImages,
  productOptions,
  productVariants,
  products,
  sellers,
  users,
} from "@gbam/db";
import { LocalPhotoStorage } from "@gbam/integrations";
import type { ProductInput, UpdateProductInput } from "@gbam/shared";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { asc, eq, inArray } from "drizzle-orm";
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
import { OrdersModule } from "../orders/orders.module.js";
import { OrdersService } from "../orders/orders.service.js";
import { ProductsModule } from "./products.module.js";
import { ProductsService } from "./products.service.js";

process.loadEnvFile?.("../../.env");
const INTERNAL_SECRET = "products-http-test-internal-secret-0123456789";
process.env.INTERNAL_API_SECRET = INTERNAL_SECRET;

const PUBLIC_BASE = "http://photos.test";
const STALE_MESSAGE = "This product changed since you opened it. Reload to see the latest.";

type Variant = ProductInput["variants"][number];
type Detail = {
  id: string;
  slug: string;
  name: string;
  version: number;
  status: string;
  images: { id: string; position: number; largeUrl: string; smallUrl: string }[];
  options: { name: string; values: string[] }[];
  variants: {
    id: string;
    optionValues: string[];
    title: string;
    priceKobo: number;
    stock: number | null;
  }[];
};

describe("Seller product endpoints over HTTP (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let redis: Redis;
  let auth: AuthService;
  let service: ProductsService;
  let folder: string;
  let jpeg: Buffer;
  const createdEmails: string[] = [];
  const sellerIds: string[] = [];

  beforeAll(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "gbam-products-"));
    const storage = new LocalPhotoStorage(folder, PUBLIC_BASE);
    const fakeQueue = { send: async (_jobId: string, _job: EmailJob) => {} };
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, AuthModule, ProductsModule, OrdersModule],
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
    service = moduleRef.get(ProductsService);

    jpeg = await sharp({
      create: { width: 600, height: 400, channels: 3, background: "#3366cc" },
    })
      .jpeg()
      .toBuffer();
  });

  afterAll(async () => {
    const rows = await db.select().from(users).where(inArray(users.email, createdEmails));
    const ids: string[] = [];
    for (const row of rows) {
      ids.push(row.id);
    }
    if (ids.length > 0) {
      // Deleting the shop cascades to products, variants, options, images and orders.
      await db.delete(sellers).where(inArray(sellers.ownerUserId, ids));
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

  async function newSeller() {
    const id = randomUUID().slice(0, 8);
    let phone = "298";
    for (let i = 0; i < 10; i++) {
      phone = phone + String(randomInt(10));
    }
    const email = `producttest-${id}@example.com`;
    createdEmails.push(email);
    const result = await auth.signup(
      {
        businessName: "Product Test",
        slug: `producttest-${id}`,
        phone,
        email,
        password: "correct horse battery",
      },
      { ip: "203.0.113.12", userAgent: "vitest" },
    );
    await db.update(users).set({ emailVerifiedAt: new Date() }).where(eq(users.id, result.user.id));
    const seller = result.user.seller;
    if (!seller) {
      throw new Error("Signup made no shop");
    }
    sellerIds.push(seller.id);
    return { authorization: `Bearer ${result.sessionToken}`, sellerId: seller.id };
  }

  type Seller = Awaited<ReturnType<typeof newSeller>>;

  async function call(seller: Seller, method: string, url: string, body?: unknown) {
    const headers: Record<string, string> = {
      authorization: seller.authorization,
      "x-client-ip": `test-${randomUUID()}`,
      "x-internal-secret": INTERNAL_SECRET,
    };
    let payload: string | undefined;
    if (body !== undefined) {
      headers["content-type"] = "application/json";
      payload = JSON.stringify(body);
    }
    const res = await fetch(`${baseUrl}${url}`, { method, headers, body: payload });
    const text = await res.text();
    let json: unknown = null;
    if (text !== "") {
      json = JSON.parse(text);
    }
    return { status: res.status, json };
  }

  async function uploadPhoto(seller: Seller): Promise<string> {
    const form = new FormData();
    form.append("photo", new Blob([new Uint8Array(jpeg)]), "photo.jpg");
    const res = await fetch(`${baseUrl}/products/images`, {
      method: "POST",
      headers: {
        authorization: seller.authorization,
        "x-client-ip": `test-${randomUUID()}`,
        "x-internal-secret": INTERNAL_SECRET,
      },
      body: form,
    });
    const json = (await res.json()) as { id: string };
    return json.id;
  }

  async function uploadPhotos(seller: Seller, count: number): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      ids.push(await uploadPhoto(seller));
    }
    return ids;
  }

  function plainVariant(priceKobo: number): Variant {
    return { optionValues: [], priceKobo, stock: null, imageId: null, isEnabled: true };
  }

  function plainProduct(name: string, imageIds: string[]): ProductInput {
    return { name, imageIds, options: [], variants: [plainVariant(250_000)] };
  }

  function dressProduct(imageIds: string[]): ProductInput {
    return {
      name: "Ankara wrap dress",
      description: "Soft cotton",
      imageIds,
      options: [
        { name: "Size", values: ["S", "M"] },
        { name: "Colour", values: ["Red"] },
      ],
      variants: [
        {
          optionValues: ["S", "Red"],
          priceKobo: 1_000_000,
          stock: 5,
          imageId: null,
          isEnabled: true,
        },
        {
          optionValues: ["M", "Red"],
          priceKobo: 1_200_000,
          stock: null,
          imageId: null,
          isEnabled: true,
        },
      ],
    };
  }

  async function createProduct(seller: Seller, input: ProductInput): Promise<Detail> {
    const res = await call(seller, "POST", "/products", input);
    expect(res.status).toBe(201);
    return res.json as Detail;
  }

  async function fileExists(key: string) {
    try {
      await access(path.join(folder, key));
      return true;
    } catch {
      return false;
    }
  }

  // Turns a saved product into the body PUT expects (same content, current version).
  function asUpdate(detail: Detail, imageIds: string[]): UpdateProductInput {
    const variants: Variant[] = [];
    for (const v of detail.variants) {
      variants.push({
        id: v.id,
        optionValues: v.optionValues,
        priceKobo: v.priceKobo,
        stock: null,
        imageId: null,
        isEnabled: true,
      });
    }
    return {
      name: detail.name,
      imageIds,
      options: detail.options,
      variants,
      version: detail.version,
    };
  }

  async function orderOn(sellerId: string, productId: string, variantId: string) {
    const customerRows = await db
      .insert(customers)
      .values({ sellerId, name: "Buyer", phone: `0803${randomInt(1_000_000, 9_999_999)}` })
      .returning();
    const customer = customerRows[0];
    if (!customer) {
      throw new Error("No customer");
    }
    const orderRows = await db
      .insert(orders)
      .values({
        sellerId,
        customerId: customer.id,
        code: `T-${randomUUID().slice(0, 6)}`,
        totalKobo: 250_000,
        subtotalKobo: 250_000,
      })
      .returning();
    const order = orderRows[0];
    if (!order) {
      throw new Error("No order");
    }
    await db.insert(orderItems).values({
      orderId: order.id,
      productId,
      variantId,
      productName: "Ordered",
      unitPriceKobo: 250_000,
      quantity: 1,
    });
  }

  it("creates a no-option product with a slug and one untitled variant", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 1);
    const created = await createProduct(seller, plainProduct("Leather bag", images));
    expect(created.slug).toBe("leather-bag");
    expect(created.version).toBe(1);
    expect(created.status).toBe("active");
    expect(created.variants).toHaveLength(1);
    expect(created.variants[0]?.title).toBe("");
    expect(created.variants[0]?.optionValues).toEqual([]);
  });

  it("builds variant titles and gives a repeated name a numbered slug", async () => {
    const seller = await newSeller();
    const first = await createProduct(seller, dressProduct(await uploadPhotos(seller, 1)));
    expect(first.slug).toBe("ankara-wrap-dress");
    const titles: string[] = [];
    for (const v of first.variants) {
      titles.push(v.title);
    }
    expect(titles).toEqual(["S / Red", "M / Red"]);

    const second = await createProduct(seller, dressProduct(await uploadPhotos(seller, 1)));
    expect(second.slug).toBe("ankara-wrap-dress-2");
  });

  it("attaches photos in the given order and lists the first as the main photo", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 3);
    const order = [images[2], images[0], images[1]];
    const ids: string[] = [];
    for (const id of order) {
      if (!id) {
        throw new Error("Missing image");
      }
      ids.push(id);
    }
    const created = await createProduct(seller, plainProduct("Ordered photos", ids));

    const savedIds: string[] = [];
    for (const image of created.images) {
      savedIds.push(image.id);
    }
    expect(savedIds).toEqual(ids);
    expect(created.images[0]?.position).toBe(1);

    const list = await call(seller, "GET", "/products");
    const items = list.json as { id: string; mainPhotoUrl: string | null }[];
    expect(items).toHaveLength(1);
    expect(items[0]?.mainPhotoUrl).toBe(created.images[0]?.smallUrl);
    expect(items[0]?.mainPhotoUrl?.startsWith(PUBLIC_BASE)).toBe(true);
  });

  it("lists price range, variant count and total stock", async () => {
    const seller = await newSeller();
    await createProduct(seller, dressProduct(await uploadPhotos(seller, 1)));
    const list = await call(seller, "GET", "/products");
    const items = list.json as {
      minPriceKobo: number;
      maxPriceKobo: number;
      variantCount: number;
      totalStock: number | null;
    }[];
    expect(items[0]).toMatchObject({
      minPriceKobo: 1_000_000,
      maxPriceKobo: 1_200_000,
      variantCount: 2,
      totalStock: 5,
    });
  });

  it("rejects a stale version with 409 and bumps the version on a good save", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 1);
    const created = await createProduct(seller, plainProduct("Versioned", images));

    const stale = { ...asUpdate(created, images), version: 5 };
    const rejected = await call(seller, "PUT", `/products/${created.id}`, stale);
    expect(rejected.status).toBe(409);
    expect(rejected.json).toMatchObject({ message: STALE_MESSAGE });

    const saved = await call(seller, "PUT", `/products/${created.id}`, asUpdate(created, images));
    expect(saved.status).toBe(200);
    expect((saved.json as Detail).version).toBe(2);
  });

  it("refuses an editor opened before a payment, so the saved stock isn't undone", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 1);
    const input = plainProduct("Paid stock", images);
    input.variants = [{ ...plainVariant(250_000), stock: 5 }];
    const created = await createProduct(seller, input);
    const opened = created.variants[0];
    if (!opened) {
      throw new Error("No variant");
    }

    // A customer orders 2 and pays while the seller has the editor open.
    const sellerRows = await db
      .select({ slug: sellers.slug })
      .from(sellers)
      .where(eq(sellers.id, seller.sellerId));
    const slug = sellerRows[0]?.slug;
    if (!slug) {
      throw new Error("No slug");
    }
    const ordersService = moduleRef.get(OrdersService);
    const order = await ordersService.createFromStorefront(slug, {
      customer: { name: "Buyer", phone: "2348011119999" },
      delivery: TEST_DELIVERY,
      items: [{ variantId: opened.id, quantity: 2 }],
    });
    await ordersService.transition({ orderId: order.id, to: "awaiting_payment", actor: "system" });
    await ordersService.transition({ orderId: order.id, to: "paid", actor: "system" });

    const res = await call(seller, "PUT", `/products/${created.id}`, asUpdate(created, images));
    expect(res.status).toBe(409);
    expect(res.json).toMatchObject({ message: STALE_MESSAGE });
    const row = await variantRow(opened.id);
    expect(row?.stock).toBe(3);
  });

  it("deletes a dropped variant that was never ordered", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 1);
    const created = await createProduct(seller, dressProduct(images));
    const dropped = created.variants[1];
    if (!dropped) {
      throw new Error("No second variant");
    }
    const body = asUpdate(created, images);
    body.options = [
      { name: "Size", values: ["S"] },
      { name: "Colour", values: ["Red"] },
    ];
    body.variants = body.variants.slice(0, 1);

    const res = await call(seller, "PUT", `/products/${created.id}`, body);
    expect(res.status).toBe(200);
    const rows = await db.select().from(productVariants).where(eq(productVariants.id, dropped.id));
    expect(rows).toHaveLength(0);
  });

  it("archives a dropped variant that is on an order", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 1);
    const created = await createProduct(seller, dressProduct(images));
    const dropped = created.variants[1];
    if (!dropped) {
      throw new Error("No second variant");
    }
    await orderOn(seller.sellerId, created.id, dropped.id);

    const body = asUpdate(created, images);
    body.options = [
      { name: "Size", values: ["S"] },
      { name: "Colour", values: ["Red"] },
    ];
    body.variants = body.variants.slice(0, 1);
    const res = await call(seller, "PUT", `/products/${created.id}`, body);
    expect(res.status).toBe(200);

    const rows = await db.select().from(productVariants).where(eq(productVariants.id, dropped.id));
    expect(rows).toHaveLength(1);
    expect(rows[0]?.archivedAt).not.toBeNull();
    expect(rows[0]?.isEnabled).toBe(false);

    const detail = (await call(seller, "GET", `/products/${created.id}`)).json as Detail;
    expect(detail.variants).toHaveLength(1);
  });

  it("deletes a removed photo's row and both files after the save", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 2);
    const created = await createProduct(seller, plainProduct("Two photos", images));
    const removedId = images[1];
    const keptId = images[0];
    if (!removedId || !keptId) {
      throw new Error("Missing images");
    }
    const before = await db.select().from(productImages).where(eq(productImages.id, removedId));
    const removedRow = before[0];
    if (!removedRow) {
      throw new Error("Image row missing");
    }
    expect(await fileExists(removedRow.largeKey)).toBe(true);

    const res = await call(seller, "PUT", `/products/${created.id}`, asUpdate(created, [keptId]));
    expect(res.status).toBe(200);

    const after = await db.select().from(productImages).where(eq(productImages.id, removedId));
    expect(after).toHaveLength(0);
    expect(await fileExists(removedRow.largeKey)).toBe(false);
    expect(await fileExists(removedRow.smallKey)).toBe(false);
  });

  it("keeps the slug when the product is renamed", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 1);
    const created = await createProduct(seller, plainProduct("Old name", images));
    const body = asUpdate(created, images);
    body.name = "Brand new name";
    const res = await call(seller, "PUT", `/products/${created.id}`, body);
    expect(res.status).toBe(200);
    const saved = res.json as Detail;
    expect(saved.name).toBe("Brand new name");
    expect(saved.slug).toBe("old-name");
  });

  it("changes the status with PATCH", async () => {
    const seller = await newSeller();
    const created = await createProduct(
      seller,
      plainProduct("Hide me", await uploadPhotos(seller, 1)),
    );
    const res = await call(seller, "PATCH", `/products/${created.id}/status`, { status: "hidden" });
    expect(res.status).toBe(204);
    const detail = (await call(seller, "GET", `/products/${created.id}`)).json as Detail;
    expect(detail.status).toBe("hidden");
  });

  it("deletes a never-ordered product and its photos", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 1);
    const created = await createProduct(seller, plainProduct("Delete me", images));
    const imageId = images[0];
    if (!imageId) {
      throw new Error("Missing image");
    }
    const imageRows = await db.select().from(productImages).where(eq(productImages.id, imageId));
    const imageRow = imageRows[0];
    if (!imageRow) {
      throw new Error("Image row missing");
    }

    const res = await call(seller, "DELETE", `/products/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ archived: false });
    const rows = await db.select().from(products).where(eq(products.id, created.id));
    expect(rows).toHaveLength(0);
    expect(await fileExists(imageRow.largeKey)).toBe(false);
    expect(await fileExists(imageRow.smallKey)).toBe(false);
  });

  it("archives an ordered product instead of deleting it", async () => {
    const seller = await newSeller();
    const created = await createProduct(
      seller,
      plainProduct("Ordered one", await uploadPhotos(seller, 1)),
    );
    const variant = created.variants[0];
    if (!variant) {
      throw new Error("No variant");
    }
    await orderOn(seller.sellerId, created.id, variant.id);

    const res = await call(seller, "DELETE", `/products/${created.id}`);
    expect(res.status).toBe(200);
    expect(res.json).toEqual({ archived: true });
    const rows = await db.select().from(products).where(eq(products.id, created.id));
    expect(rows[0]?.status).toBe("archived");
    const list = (await call(seller, "GET", "/products")).json as { id: string }[];
    expect(list).toHaveLength(0);
  });

  it("answers 404 when another seller touches the product", async () => {
    const owner = await newSeller();
    const other = await newSeller();
    const images = await uploadPhotos(owner, 1);
    const created = await createProduct(owner, plainProduct("Mine", images));

    const otherImages = await uploadPhotos(other, 1);
    const url = `/products/${created.id}`;
    expect((await call(other, "GET", url)).status).toBe(404);
    const body = asUpdate(created, otherImages);
    expect((await call(other, "PUT", url, body)).status).toBe(404);
    expect((await call(other, "PATCH", `${url}/status`, { status: "hidden" })).status).toBe(404);
    expect((await call(other, "DELETE", url)).status).toBe(404);
  });

  it("answers 400 on imageIds for another seller's photo or a vanished one", async () => {
    const owner = await newSeller();
    const other = await newSeller();
    const ownersImages = await uploadPhotos(owner, 1);

    const stolen = await call(other, "POST", "/products", plainProduct("Stolen", ownersImages));
    expect(stolen.status).toBe(400);
    expect(JSON.stringify(stolen.json)).toContain("imageIds");

    const gone = await call(other, "POST", "/products", plainProduct("Gone", [randomUUID()]));
    expect(gone.status).toBe(400);
    expect(JSON.stringify(gone.json)).toContain("imageIds");

    // A photo already on another of the owner's products can't be reused either.
    const first = await createProduct(owner, plainProduct("First", ownersImages));
    const reuse = await call(owner, "POST", "/products", plainProduct("Second", ownersImages));
    expect(reuse.status).toBe(400);
    expect(first.images).toHaveLength(1);
  });

  it("leaves the product unchanged when a write inside update fails", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 1);
    const created = await createProduct(seller, dressProduct(images));

    // Zod would refuse this (two variants with the same combination), so it is sent
    // straight to the service. The name changes first; the duplicate then fails.
    const crafted: UpdateProductInput = {
      name: "Should not stick",
      imageIds: images,
      options: created.options,
      variants: [
        {
          optionValues: ["S", "Red"],
          priceKobo: 1_000_000,
          stock: null,
          imageId: null,
          isEnabled: true,
        },
        {
          optionValues: ["S", "Red"],
          priceKobo: 1_000_000,
          stock: null,
          imageId: null,
          isEnabled: true,
        },
      ],
      version: created.version,
    };
    await expect(service.update(seller.sellerId, created.id, crafted)).rejects.toThrow();

    const rows = await db.select().from(products).where(eq(products.id, created.id));
    expect(rows[0]?.name).toBe("Ankara wrap dress");
    expect(rows[0]?.version).toBe(1);
    const variantRows = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, created.id))
      .orderBy(asc(productVariants.position));
    expect(variantRows).toHaveLength(2);
    const optionRows = await db
      .select()
      .from(productOptions)
      .where(eq(productOptions.productId, created.id));
    expect(optionRows).toHaveLength(2);
  });

  // A one-option product (Size S, M) with different price and stock on each variant.
  async function sizeProduct(seller: Seller, name: string) {
    const images = await uploadPhotos(seller, 1);
    const created = await createProduct(seller, {
      name,
      imageIds: images,
      options: [{ name: "Size", values: ["S", "M"] }],
      variants: [
        { optionValues: ["S"], priceKobo: 1_000_000, stock: 3, imageId: null, isEnabled: true },
        { optionValues: ["M"], priceKobo: 1_200_000, stock: 4, imageId: null, isEnabled: true },
      ],
    });
    return { images, created };
  }

  // Same variant as saved (id, price, stock kept), with new option values.
  function renamed(saved: Detail["variants"][number], optionValues: string[]): Variant {
    return {
      id: saved.id,
      optionValues,
      priceKobo: saved.priceKobo,
      stock: saved.stock,
      imageId: null,
      isEnabled: true,
    };
  }

  async function variantRow(id: string) {
    const rows = await db.select().from(productVariants).where(eq(productVariants.id, id));
    return rows[0];
  }

  it("renames values so combinations shift, keeping each variant's id, price and stock", async () => {
    const seller = await newSeller();
    const { images, created } = await sizeProduct(seller, "Shift");
    const a = created.variants[0];
    const b = created.variants[1];
    if (!a || !b) {
      throw new Error("Missing variants");
    }
    // S -> M while the other row still holds M, then M -> L.
    const body = asUpdate(created, images);
    body.options = [{ name: "Size", values: ["M", "L"] }];
    body.variants = [renamed(a, ["M"]), renamed(b, ["L"])];

    const res = await call(seller, "PUT", `/products/${created.id}`, body);
    expect(res.status).toBe(200);
    const rowA = await variantRow(a.id);
    const rowB = await variantRow(b.id);
    expect(rowA).toMatchObject({ optionValues: ["M"], title: "M", priceKobo: 1_000_000, stock: 3 });
    expect(rowB).toMatchObject({ optionValues: ["L"], title: "L", priceKobo: 1_200_000, stock: 4 });
  });

  it("swaps two combinations on the same ids", async () => {
    const seller = await newSeller();
    const { images, created } = await sizeProduct(seller, "Swap");
    const a = created.variants[0];
    const b = created.variants[1];
    if (!a || !b) {
      throw new Error("Missing variants");
    }
    const body = asUpdate(created, images);
    body.options = [{ name: "Size", values: ["M", "S"] }];
    body.variants = [renamed(a, ["M"]), renamed(b, ["S"])];

    const res = await call(seller, "PUT", `/products/${created.id}`, body);
    expect(res.status).toBe(200);
    const rowA = await variantRow(a.id);
    const rowB = await variantRow(b.id);
    expect(rowA).toMatchObject({ optionValues: ["M"], priceKobo: 1_000_000, stock: 3 });
    expect(rowB).toMatchObject({ optionValues: ["S"], priceKobo: 1_200_000, stock: 4 });
  });

  it("lets an archived combination be added again later", async () => {
    const seller = await newSeller();
    const { images, created } = await sizeProduct(seller, "Readd");
    const a = created.variants[0];
    const b = created.variants[1];
    if (!a || !b) {
      throw new Error("Missing variants");
    }
    await orderOn(seller.sellerId, created.id, b.id);

    // Drop M (it is on an order, so it is archived).
    const drop = asUpdate(created, images);
    drop.options = [{ name: "Size", values: ["S"] }];
    drop.variants = [renamed(a, ["S"])];
    const first = await call(seller, "PUT", `/products/${created.id}`, drop);
    expect(first.status).toBe(200);
    const archived = await variantRow(b.id);
    expect(archived?.archivedAt).not.toBeNull();
    expect(archived?.optionValues).toEqual(["M"]);

    // Add M back with no id: a brand new row.
    const saved = first.json as Detail;
    const add = asUpdate(saved, images);
    add.options = [{ name: "Size", values: ["S", "M"] }];
    const savedA = saved.variants[0];
    if (!savedA) {
      throw new Error("Missing variant");
    }
    add.variants = [
      renamed(savedA, ["S"]),
      { optionValues: ["M"], priceKobo: 1_500_000, stock: null, imageId: null, isEnabled: true },
    ];
    const second = await call(seller, "PUT", `/products/${created.id}`, add);
    expect(second.status).toBe(200);
    const detail = second.json as Detail;
    expect(detail.variants).toHaveLength(2);
    expect(detail.variants[1]?.id).not.toBe(b.id);
  });

  it("gives an id-less variant only rows that no other variant claims by id", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 1);
    const created = await createProduct(seller, {
      name: "Claims",
      imageIds: images,
      options: [{ name: "Size", values: ["S"] }],
      variants: [
        { optionValues: ["S"], priceKobo: 1_000_000, stock: 3, imageId: null, isEnabled: true },
      ],
    });
    const x = created.variants[0];
    if (!x) {
      throw new Error("Missing variant");
    }
    const body = asUpdate(created, images);
    body.options = [{ name: "Size", values: ["S", "Small"] }];
    body.variants = [
      { optionValues: ["S"], priceKobo: 2_000_000, stock: null, imageId: null, isEnabled: true },
      renamed(x, ["Small"]),
    ];

    const res = await call(seller, "PUT", `/products/${created.id}`, body);
    expect(res.status).toBe(200);
    const kept = await variantRow(x.id);
    expect(kept).toMatchObject({ optionValues: ["Small"], priceKobo: 1_000_000, stock: 3 });
    const detail = res.json as Detail;
    expect(detail.variants).toHaveLength(2);
    const fresh = detail.variants[0];
    expect(fresh?.optionValues).toEqual(["S"]);
    expect(fresh?.id).not.toBe(x.id);
  });

  it("allows only active and hidden on PATCH status, and treats archived products as gone", async () => {
    const seller = await newSeller();
    const images = await uploadPhotos(seller, 1);
    const created = await createProduct(seller, plainProduct("Status", images));
    const url = `/products/${created.id}`;

    const bad = await call(seller, "PATCH", `${url}/status`, { status: "archived" });
    expect(bad.status).toBe(400);

    const variant = created.variants[0];
    if (!variant) {
      throw new Error("No variant");
    }
    await orderOn(seller.sellerId, created.id, variant.id);
    const removed = await call(seller, "DELETE", url);
    expect(removed.json).toEqual({ archived: true });

    expect((await call(seller, "GET", url)).status).toBe(404);
    expect((await call(seller, "PUT", url, asUpdate(created, images))).status).toBe(404);
    expect((await call(seller, "PATCH", `${url}/status`, { status: "active" })).status).toBe(404);
  });

  it("answers 400 on variants for a variant id from another product or seller", async () => {
    const seller = await newSeller();
    const other = await newSeller();
    const first = await sizeProduct(seller, "First product");
    const second = await sizeProduct(seller, "Second product");
    const foreign = await sizeProduct(other, "Foreign product");

    const ids = [first.created.variants[0], foreign.created.variants[0]];
    for (const stolen of ids) {
      if (!stolen) {
        throw new Error("Missing variant");
      }
      const body = asUpdate(second.created, second.images);
      body.name = "Should not stick";
      body.variants = [{ ...renamed(stolen, ["S"]) }, ...body.variants.slice(1)];
      const res = await call(seller, "PUT", `/products/${second.created.id}`, body);
      expect(res.status).toBe(400);
      expect(JSON.stringify(res.json)).toContain("variants");

      const rows = await db.select().from(products).where(eq(products.id, second.created.id));
      expect(rows[0]?.name).toBe("Second product");
      expect(rows[0]?.version).toBe(1);
      const stolenRow = await variantRow(stolen.id);
      expect(stolenRow?.productId).not.toBe(second.created.id);
    }
  });

  it("gives two concurrent creates with the same name different slugs", async () => {
    const seller = await newSeller();
    const imagesA = await uploadPhotos(seller, 1);
    const imagesB = await uploadPhotos(seller, 1);
    const results = await Promise.all([
      call(seller, "POST", "/products", plainProduct("Twin", imagesA)),
      call(seller, "POST", "/products", plainProduct("Twin", imagesB)),
    ]);
    expect(results[0]?.status).toBe(201);
    expect(results[1]?.status).toBe(201);
    const slugs = [(results[0]?.json as Detail).slug, (results[1]?.json as Detail).slug];
    expect(slugs[0]).not.toBe(slugs[1]);
  });
});
