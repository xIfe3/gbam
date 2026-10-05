/**
 * Tests migration 0006 (slugs, default variants, order_items.variant_id) on real
 * old-style data. It builds a throwaway database on the dev Postgres, applies migrations
 * 0000-0005, inserts rows the way the app used to, applies 0006, then checks the result.
 * It also checks the createTestProduct helper against the normal dev database.
 */
import { createDb, productVariants, sellers, type DbHandle } from "@gbam/db";
import { eq, sql } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createTestProduct, createTestSeller } from "../test-helpers.js";

process.loadEnvFile?.("../../.env");

const migrationsDir = fileURLToPath(new URL("../../../../packages/db/migrations/", import.meta.url));

/** Runs one migration file. Drizzle files hold several statements split by a marker. */
async function applyMigration(handle: DbHandle, fileName: string) {
  const text = readFileSync(migrationsDir + fileName, "utf8");
  const statements = text.split("--> statement-breakpoint");
  for (const statement of statements) {
    if (statement.trim() === "") {
      continue;
    }
    await handle.db.execute(sql.raw(statement));
  }
}

describe("migration 0006 backfill (throwaway database)", () => {
  let adminHandle: DbHandle;
  let migHandle: DbHandle;
  let migDbName: string;

  // Rows that exist before 0006 runs, so we can look them up after.
  const sellerId = randomUUID();
  const otherSellerId = randomUUID();
  const dressOld = randomUUID();
  const dressNew = randomUUID();
  const orderProduct = randomUUID();
  const orderOneProduct = randomUUID();
  const inactiveProduct = randomUUID();
  const aFirst = randomUUID();
  const aSecond = randomUUID();
  const aTwo = randomUUID();
  const otherDress = randomUUID();
  const orderItemId = randomUUID();

  beforeAll(async () => {
    const baseUrl = process.env.DATABASE_URL;
    if (!baseUrl) {
      throw new Error("DATABASE_URL is not set");
    }
    migDbName = `gbam_mig_${randomUUID().replaceAll("-", "").slice(0, 12)}`;
    const parsed = new URL(baseUrl);
    parsed.pathname = `/${migDbName}`;

    adminHandle = createDb(baseUrl, { max: 1 });
    await adminHandle.db.execute(sql.raw(`CREATE DATABASE ${migDbName}`));
    migHandle = createDb(parsed.toString(), { max: 1 });

    // Apply 0000-0005 (every migration file except 0006), in order.
    const files = readdirSync(migrationsDir).filter((name) => name.endsWith(".sql")).sort();
    for (const file of files) {
      if (file < "0006") {
        await applyMigration(migHandle, file);
      }
    }

    // Old-style data: the products table has no slug/status yet.
    const db = migHandle.db;
    await db.execute(sql`
      INSERT INTO sellers (id, slug, business_name, whatsapp_phone) VALUES
        (${sellerId}, 'shop-one', 'Shop One', '2990000000001'),
        (${otherSellerId}, 'shop-two', 'Shop Two', '2990000000002')`);
    await db.execute(sql`
      INSERT INTO products (id, seller_id, name, price_kobo, stock, is_active, created_at) VALUES
        (${dressOld}, ${sellerId}, 'Dress', 500000, 3, true, '2026-01-01T00:00:00Z'),
        (${dressNew}, ${sellerId}, 'Dress', 600000, null, true, '2026-01-02T00:00:00Z'),
        (${orderProduct}, ${sellerId}, 'Order', 10000, 1, true, '2026-01-03T00:00:00Z'),
        (${orderOneProduct}, ${sellerId}, 'Order 1', 20000, 2, true, '2026-01-04T00:00:00Z'),
        (${inactiveProduct}, ${sellerId}, 'Old stock!!', 30000, 0, false, '2026-01-05T00:00:00Z'),
        (${aFirst}, ${sellerId}, 'A', 10000, null, true, '2026-01-06T00:00:00Z'),
        (${aSecond}, ${sellerId}, 'A', 10000, null, true, '2026-01-07T00:00:00Z'),
        (${aTwo}, ${sellerId}, 'A 2', 10000, null, true, '2026-01-08T00:00:00Z'),
        (${otherDress}, ${otherSellerId}, 'Dress', 700000, 9, true, '2026-01-09T00:00:00Z')`);
    const customerId = randomUUID();
    const orderId = randomUUID();
    await db.execute(sql`
      INSERT INTO customers (id, seller_id, name, phone)
      VALUES (${customerId}, ${sellerId}, 'Ada', '2990000000009')`);
    await db.execute(sql`
      INSERT INTO orders (id, seller_id, customer_id, code, total_kobo)
      VALUES (${orderId}, ${sellerId}, ${customerId}, 'GB-TEST', 500000)`);
    await db.execute(sql`
      INSERT INTO order_items (id, order_id, product_id, product_name, unit_price_kobo, quantity)
      VALUES (${orderItemId}, ${orderId}, ${dressOld}, 'Dress', 500000, 1)`);

    await applyMigration(migHandle, "0006_little_groot.sql");
  });

  afterAll(async () => {
    await migHandle.close();
    await adminHandle.db.execute(sql.raw(`DROP DATABASE IF EXISTS ${migDbName}`));
    await adminHandle.close();
  });

  async function productRow(id: string) {
    const rows = await migHandle.db.execute(
      sql`SELECT slug, status FROM products WHERE id = ${id}`,
    );
    const row = rows[0];
    if (!row) {
      throw new Error("Product row missing");
    }
    return row;
  }

  it("gives each product the right slug, de-duplicated within its shop", async () => {
    expect((await productRow(dressOld)).slug).toBe("dress");
    expect((await productRow(dressNew)).slug).toBe("dress-2");
    // "order" is a reserved route, so the plain "Order" becomes order-1; "Order 1" then
    // collides with it and gets the next free suffix.
    expect((await productRow(orderProduct)).slug).toBe("order-1");
    expect((await productRow(orderOneProduct)).slug).toBe("order-1-2");
    expect((await productRow(inactiveProduct)).slug).toBe("old-stock");
    // "A", "A", "A 2": the real "a-2" keeps its name; the second "A" skips to a-3.
    expect((await productRow(aFirst)).slug).toBe("a");
    expect((await productRow(aTwo)).slug).toBe("a-2");
    expect((await productRow(aSecond)).slug).toBe("a-3");
    // Another shop may reuse a slug.
    expect((await productRow(otherDress)).slug).toBe("dress");
  });

  it("sets status from is_active", async () => {
    expect((await productRow(dressOld)).status).toBe("active");
    expect((await productRow(inactiveProduct)).status).toBe("hidden");
  });

  it("gives every product one default variant with its old price and stock", async () => {
    const rows = await migHandle.db.execute(sql`
      SELECT p.id, p.price_kobo AS product_price, p.stock AS product_stock,
             count(v.id)::int AS variant_count,
             max(v.price_kobo) AS variant_price, max(v.stock) AS variant_stock
      FROM products p
      LEFT JOIN product_variants v ON v.product_id = p.id AND v.option_values = '{}'
      GROUP BY p.id`);
    expect(rows).toHaveLength(9);
    for (const row of rows) {
      expect(row.variant_count).toBe(1);
      expect(Number(row.variant_price)).toBe(Number(row.product_price));
      // max() ignores nulls, so compare null stock separately.
      if (row.product_stock === null) {
        expect(row.variant_stock).toBeNull();
      } else {
        expect(row.variant_stock).toBe(row.product_stock);
      }
    }
  });

  it("points order_items.variant_id at the product's default variant", async () => {
    const rows = await migHandle.db.execute(sql`
      SELECT oi.variant_id, v.product_id
      FROM order_items oi
      LEFT JOIN product_variants v ON v.id = oi.variant_id
      WHERE oi.id = ${orderItemId}`);
    const row = rows[0];
    if (!row) {
      throw new Error("Order item row missing");
    }
    expect(row.variant_id).not.toBeNull();
    expect(row.product_id).toBe(dressOld);
  });
});

describe("createTestProduct (dev database)", () => {
  let handle: DbHandle;
  let sellerId: string;

  beforeAll(async () => {
    const url = process.env.DATABASE_URL;
    if (!url) {
      throw new Error("DATABASE_URL is not set");
    }
    handle = createDb(url, { max: 2 });
    const seller = await createTestSeller(handle.db, "migtest");
    sellerId = seller.id;
  });

  afterAll(async () => {
    await handle.db.delete(sellers).where(eq(sellers.id, sellerId));
    await handle.close();
  });

  it("products no longer has price_kobo, stock or is_active", async () => {
    const rows = await handle.db.execute(sql`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'products' AND column_name IN ('price_kobo', 'stock', 'is_active')`);
    expect(rows).toHaveLength(0);
  });

  it("createTestProduct makes a product with one default variant", async () => {
    const { product, variant } = await createTestProduct(handle.db, sellerId, {
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
    const all = await handle.db
      .select()
      .from(productVariants)
      .where(eq(productVariants.productId, product.id));
    expect(all).toHaveLength(1);
  });
});
