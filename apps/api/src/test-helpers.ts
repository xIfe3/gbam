/**
 * Shared setup for the integration tests (not used by the app itself).
 */
import {
  productVariants,
  products,
  sellers,
  type Db,
  type Product,
  type ProductVariant,
} from "@gbam/db";
import { and, like, lt } from "drizzle-orm";
import { randomInt, randomUUID } from "node:crypto";

type TestProductInput = {
  name?: string;
  priceKobo?: number;
  stock?: number | null;
  status?: "active" | "hidden" | "archived";
};

/**
 * Creates a product with a random slug and its one default variant (no options).
 * Price and stock go on the variant.
 */
export async function createTestProduct(
  db: Db,
  sellerId: string,
  input: TestProductInput = {},
): Promise<{ product: Product; variant: ProductVariant }> {
  const name = input.name ?? "Test product";
  const priceKobo = input.priceKobo ?? 150_000;
  let stock: number | null = null;
  if (input.stock !== undefined) {
    stock = input.stock;
  }
  const status = input.status ?? "active";

  // A transaction so the product and its variant are created together or not at all.
  return db.transaction(async (tx) => {
    const productRows = await tx
      .insert(products)
      .values({
        sellerId,
        name,
        slug: `test-${randomUUID().slice(0, 8)}`,
        status,
      })
      .returning();
    const product = productRows[0];
    if (!product) {
      throw new Error("Failed to create the test product");
    }

    const variantRows = await tx
      .insert(productVariants)
      .values({ productId: product.id, optionValues: [], priceKobo, stock })
      .returning();
    const variant = variantRows[0];
    if (!variant) {
      throw new Error("Failed to create the test variant");
    }
    return { product, variant };
  });
}

/**
 * Creates a throwaway seller for one test file. Every value is random, so two runs can
 * never collide, even if an earlier run crashed before cleaning up.
 *
 * Also deletes sellers left behind by crashed runs (same prefix, older than an hour),
 * so the dev database doesn't slowly fill up with test data.
 */
export async function createTestSeller(db: Db, prefix: string) {
  const anHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  await db
    .delete(sellers)
    .where(and(like(sellers.slug, `${prefix}-%`), lt(sellers.createdAt, anHourAgo)));

  // "299" isn't a real country code, so this can never be someone's actual number.
  let phone = "299";
  for (let i = 0; i < 10; i++) {
    phone = phone + String(randomInt(10));
  }

  const rows = await db
    .insert(sellers)
    .values({
      slug: `${prefix}-${randomUUID().slice(0, 8)}`,
      businessName: `Test seller (${prefix})`,
      whatsappPhone: phone,
    })
    .returning();

  const seller = rows[0];
  if (!seller) {
    throw new Error("Failed to create the test seller");
  }
  return seller;
}

/**
 * Delivery for test orders in a shop with no delivery zones: just an address, no fee.
 * Tests about delivery zones build their own.
 */
export const TEST_DELIVERY = {
  zoneId: null,
  expectedFeeKobo: null,
  address: "12 Test Street, Ikeja",
  landmark: null,
};
