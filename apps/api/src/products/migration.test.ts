/**
 * Integration test against the dev Postgres. Checks that the 0006 migration backfilled
 * slugs, default variants and order_items.variant_id, and that createTestProduct works.
 */
import { orderItems, productVariants, products, sellers } from "@gbam/db";
import { Test, type TestingModule } from "@nestjs/testing";
import { and, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { createTestProduct, createTestSeller } from "../test-helpers.js";

process.loadEnvFile?.("../../.env");

describe("product migration backfill (integration)", () => {
  let moduleRef: TestingModule;
  let db: Db;
  let sellerId: string;

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule] }).compile();
    db = moduleRef.get<Db>(DB);
    const seller = await createTestSeller(db, "migtest");
    sellerId = seller.id;
  });

  afterAll(async () => {
    await db.delete(sellers).where(eq(sellers.id, sellerId));
    await moduleRef.close();
  });

  it("gives every product exactly one default variant with its price and stock", async () => {
    const rows = await db
      .select({ product: products, variant: productVariants })
      .from(products)
      .leftJoin(
        productVariants,
        and(
          eq(productVariants.productId, products.id),
          sql`${productVariants.optionValues} = '{}'`,
        ),
      );
    for (const row of rows) {
      expect(row.variant).not.toBeNull();
      if (row.variant) {
        expect(row.variant.priceKobo).toBe(row.product.priceKobo);
        expect(row.variant.stock).toBe(row.product.stock);
      }
    }
  });

  it("backfills order_items.variant_id from product_id", async () => {
    const missing = await db
      .select({ id: orderItems.id })
      .from(orderItems)
      .where(and(isNotNull(orderItems.productId), isNull(orderItems.variantId)));
    expect(missing).toHaveLength(0);
  });

  it("gives every product a slug unique within its shop", async () => {
    const rows = await db
      .select({ sellerId: products.sellerId, slug: products.slug })
      .from(products);
    const seen = new Set<string>();
    for (const row of rows) {
      expect(row.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
      const key = `${row.sellerId}/${row.slug}`;
      expect(seen.has(key)).toBe(false);
      seen.add(key);
    }
  });

  it("createTestProduct makes a product with one default variant", async () => {
    const { product, variant } = await createTestProduct(db, sellerId, {
      name: "Zobo",
      priceKobo: 50_000,
      stock: 5,
    });
    expect(product.sellerId).toBe(sellerId);
    expect(product.slug).toMatch(/^[a-z0-9]+(-[a-z0-9]+)*$/);
    expect(product.status).toBe("active");
    expect(variant.productId).toBe(product.id);
    expect(variant.optionValues).toEqual([]);
    expect(variant.priceKobo).toBe(50_000);
    expect(variant.stock).toBe(5);
    const all = await db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, product.id));
    expect(all).toHaveLength(1);
  });
});
