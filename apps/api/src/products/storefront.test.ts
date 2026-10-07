/**
 * HTTP-level test of the public storefront endpoints: a real Nest app on a random port,
 * the dev Postgres and Redis db 1, and plain fetch(). No login is needed.
 */
import "reflect-metadata";
import { productImages, productOptions, productVariants, products, sellers } from "@gbam/db";
import { LocalPhotoStorage } from "@gbam/integrations";
import type { INestApplication } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DomainErrorsFilter } from "../common/domain-errors.filter.js";
import { EmailQueue } from "../email/email.queue.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { IntegrationsModule, PHOTO_STORAGE } from "../integrations/integrations.module.js";
import { createTestProduct, createTestSeller } from "../test-helpers.js";
import { ProductsModule } from "./products.module.js";

process.loadEnvFile?.("../../.env");
process.env.INTERNAL_API_SECRET = "storefront-test-internal-secret-0123456789";

const PUBLIC_BASE = "http://photos.test";

type Card = {
  slug: string;
  name: string;
  photoUrl: string | null;
  minPriceKobo: number;
  maxPriceKobo: number;
  soldOut: boolean;
};

describe("Storefront endpoints over HTTP (integration)", () => {
  let moduleRef: TestingModule;
  let app: INestApplication;
  let baseUrl: string;
  let db: Db;
  let folder: string;
  const sellerIds: string[] = [];

  beforeAll(async () => {
    folder = await mkdtemp(path.join(tmpdir(), "gbam-storefront-"));
    const storage = new LocalPhotoStorage(folder, PUBLIC_BASE);
    const fakeQueue = { send: async () => {} };
    moduleRef = await Test.createTestingModule({
      imports: [InfraModule, IntegrationsModule, ProductsModule],
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
  });

  afterAll(async () => {
    for (const id of sellerIds) {
      // Deleting the shop cascades to its products, variants, options and images.
      await db.delete(sellers).where(eq(sellers.id, id));
    }
    await app.close();
    await rm(folder, { recursive: true, force: true });
  });

  async function newSeller() {
    const seller = await createTestSeller(db, "storefronttest");
    sellerIds.push(seller.id);
    return seller;
  }

  async function getList(slug: string) {
    const res = await fetch(`${baseUrl}/storefront/${slug}`);
    const body = (await res.json()) as {
      store: { slug: string; businessName: string };
      products: Card[];
    };
    return { status: res.status, body };
  }

  async function addVariant(
    productId: string,
    values: {
      priceKobo: number;
      stock: number | null;
      isEnabled?: boolean;
      archived?: boolean;
      optionValues?: string[];
    },
  ) {
    let archivedAt: Date | null = null;
    if (values.archived) {
      archivedAt = new Date();
    }
    let isEnabled = true;
    if (values.isEnabled === false) {
      isEnabled = false;
    }
    let optionValues = ["x" + randomUUID().slice(0, 6)];
    if (values.optionValues) {
      optionValues = values.optionValues;
    }
    const rows = await db
      .insert(productVariants)
      .values({
        productId,
        priceKobo: values.priceKobo,
        stock: values.stock,
        isEnabled,
        archivedAt,
        optionValues,
      })
      .returning();
    const row = rows[0];
    if (!row) {
      throw new Error("Failed to insert the test variant");
    }
    return row;
  }

  it("lists only active products that have an enabled variant, with a price range", async () => {
    const seller = await newSeller();
    const shown = await createTestProduct(db, seller.id, { name: "A shown", priceKobo: 20_000 });
    await addVariant(shown.product.id, { priceKobo: 50_000, stock: 5 });
    await addVariant(shown.product.id, { priceKobo: 5_000_000, stock: 5, isEnabled: false });
    await addVariant(shown.product.id, { priceKobo: 9_000_000, stock: 5, archived: true });
    await createTestProduct(db, seller.id, { name: "B hidden", status: "hidden" });
    await createTestProduct(db, seller.id, { name: "C archived", status: "archived" });
    // Active, but its only variant is disabled: nothing to buy, so it is not listed.
    const empty = await createTestProduct(db, seller.id, { name: "D no variants" });
    await db
      .update(productVariants)
      .set({ isEnabled: false })
      .where(eq(productVariants.id, empty.variant.id));

    const { status, body } = await getList(seller.slug);
    expect(status).toBe(200);
    expect(body.store).toEqual({ slug: seller.slug, businessName: seller.businessName });
    expect(body.products).toHaveLength(1);
    const card = body.products[0];
    expect(card?.name).toBe("A shown");
    expect(card?.minPriceKobo).toBe(20_000);
    expect(card?.maxPriceKobo).toBe(50_000);
    expect(card?.photoUrl).toBeNull();
    expect(card?.soldOut).toBe(false);
  });

  it("returns 404 for an unknown store", async () => {
    const { status } = await getList("no-such-store-" + randomUUID().slice(0, 8));
    expect(status).toBe(404);
  });

  it("returns 404 for a closed shop and its products", async () => {
    const seller = await newSeller();
    const created = await createTestProduct(db, seller.id, {});
    await db.update(sellers).set({ closedAt: new Date() }).where(eq(sellers.id, seller.id));

    const { status } = await getList(seller.slug);
    expect(status).toBe(404);
    const res = await fetch(`${baseUrl}/storefront/${seller.slug}/products/${created.product.slug}`);
    expect(res.status).toBe(404);
  });

  it("marks soldOut only when every enabled variant has tracked stock 0", async () => {
    const seller = await newSeller();
    const out = await createTestProduct(db, seller.id, { name: "Out", stock: 0 });
    // A disabled variant with stock does not stop the product being sold out.
    await addVariant(out.product.id, { priceKobo: 20_000, stock: 9, isEnabled: false });

    const mixed = await createTestProduct(db, seller.id, { name: "Mixed", stock: 0 });
    await addVariant(mixed.product.id, { priceKobo: 20_000, stock: 3 });

    const untracked = await createTestProduct(db, seller.id, { name: "Untracked", stock: null });
    await addVariant(untracked.product.id, { priceKobo: 20_000, stock: 0 });

    const { body } = await getList(seller.slug);
    const byName: Record<string, boolean> = {};
    for (const card of body.products) {
      byName[card.name] = card.soldOut;
    }
    expect(byName).toEqual({ Out: true, Mixed: false, Untracked: false });
  });

  it("uses the small URL of image position 1 as the card photo", async () => {
    const seller = await newSeller();
    const made = await createTestProduct(db, seller.id, { name: "Pictured" });
    const imageRows = await db
      .insert(productImages)
      .values([
        {
          sellerId: seller.id,
          productId: made.product.id,
          position: 2,
          largeKey: "k/second-large.webp",
          smallKey: "k/second-small.webp",
          width: 10,
          height: 10,
        },
        {
          sellerId: seller.id,
          productId: made.product.id,
          position: 1,
          largeKey: "k/main-large.webp",
          smallKey: "k/main-small.webp",
          width: 10,
          height: 10,
        },
      ])
      .returning();
    expect(imageRows).toHaveLength(2);

    const { body } = await getList(seller.slug);
    expect(body.products[0]?.photoUrl).toBe(`${PUBLIC_BASE}/k/main-small.webp`);
  });

  it("returns the product page with images, options and live variants only", async () => {
    const seller = await newSeller();
    const made = await createTestProduct(db, seller.id, { name: "Shirt" });
    await db
      .update(products)
      .set({ description: "A nice shirt" })
      .where(eq(products.id, made.product.id));
    await db
      .update(productVariants)
      .set({ optionValues: ["M"], title: "M", priceKobo: 30_000, stock: 4, position: 0 })
      .where(eq(productVariants.id, made.variant.id));
    const large = await addVariant(made.product.id, {
      priceKobo: 31_000,
      stock: 1,
      optionValues: ["L"],
    });
    await db.update(productVariants).set({ position: 1 }).where(eq(productVariants.id, large.id));
    await addVariant(made.product.id, {
      priceKobo: 32_000,
      stock: 1,
      optionValues: ["XL"],
      isEnabled: false,
    });
    await addVariant(made.product.id, {
      priceKobo: 33_000,
      stock: 1,
      optionValues: ["S"],
      archived: true,
    });
    await db
      .insert(productOptions)
      .values({ productId: made.product.id, name: "Size", values: ["M", "L", "XL"], position: 0 });
    const imageRows = await db
      .insert(productImages)
      .values({
        sellerId: seller.id,
        productId: made.product.id,
        position: 1,
        largeKey: "k/a-large.webp",
        smallKey: "k/a-small.webp",
        width: 10,
        height: 10,
      })
      .returning();
    const image = imageRows[0];
    if (!image) {
      throw new Error("Failed to insert the test image");
    }

    const res = await fetch(`${baseUrl}/storefront/${seller.slug}/products/${made.product.slug}`);
    expect(res.status).toBe(200);
    const body = (await res.json()) as {
      store: { slug: string };
      product: {
        slug: string;
        name: string;
        description: string;
        images: { id: string; largeUrl: string; smallUrl: string }[];
        options: { name: string; values: string[] }[];
        variants: { id: string; optionValues: string[]; priceKobo: number; stock: number | null }[];
      };
    };
    expect(body.store.slug).toBe(seller.slug);
    expect(body.product.name).toBe("Shirt");
    expect(body.product.description).toBe("A nice shirt");
    expect(body.product.images).toEqual([
      {
        id: image.id,
        largeUrl: `${PUBLIC_BASE}/k/a-large.webp`,
        smallUrl: `${PUBLIC_BASE}/k/a-small.webp`,
      },
    ]);
    expect(body.product.options).toEqual([{ name: "Size", values: ["M", "L", "XL"] }]);
    const sizes: string[] = [];
    for (const variant of body.product.variants) {
      sizes.push(variant.optionValues.join("/"));
    }
    expect(sizes).toEqual(["M", "L"]);
    expect(body.product.variants[0]?.stock).toBe(4);
  });

  it("returns 404 for hidden or archived products and unknown slugs", async () => {
    const seller = await newSeller();
    const hidden = await createTestProduct(db, seller.id, { status: "hidden" });
    const archived = await createTestProduct(db, seller.id, { status: "archived" });
    const slugs = [hidden.product.slug, archived.product.slug, "nope-" + randomUUID().slice(0, 6)];
    for (const slug of slugs) {
      const res = await fetch(`${baseUrl}/storefront/${seller.slug}/products/${slug}`);
      expect(res.status).toBe(404);
    }
  });

  it("returns 404 for shop A's product under shop B's slug", async () => {
    const shopA = await newSeller();
    const shopB = await newSeller();
    const made = await createTestProduct(db, shopA.id, { name: "A only" });
    const wrong = await fetch(`${baseUrl}/storefront/${shopB.slug}/products/${made.product.slug}`);
    expect(wrong.status).toBe(404);
    const right = await fetch(`${baseUrl}/storefront/${shopA.slug}/products/${made.product.slug}`);
    expect(right.status).toBe(200);
  });
});
