import { productImages, products } from "@gbam/db";
import { productSlugBase } from "@gbam/shared";
import { BadRequestException } from "@nestjs/common";
import { and, eq, inArray, like } from "drizzle-orm";
import type { Db } from "../infra/infra.module.js";

/** The `tx` inside `db.transaction(async (tx) => ...)`: same methods as db, but in one transaction. */
export type Tx = Parameters<Parameters<Db["transaction"]>[0]>[0];

/** A 400 that points at the `imageIds` field, in the same shape ZodPipe uses. */
export function imageIdsError(): BadRequestException {
  const message = "One of the photos can't be used. Upload it again.";
  return new BadRequestException({
    message: "Validation failed",
    issues: { formErrors: [], fieldErrors: { imageIds: [message] } },
  });
}

/**
 * Every image must be this seller's and either unattached or already on this product.
 * The cleanup job deletes unattached photos after 24 h, so an id can also just be gone:
 * that is the seller's problem to fix (400), not a server error.
 */
export async function assertImagesUsable(
  tx: Tx,
  sellerId: string,
  imageIds: string[],
  productId: string | null,
): Promise<void> {
  const rows = await tx
    .select({ id: productImages.id, productId: productImages.productId })
    .from(productImages)
    .where(and(eq(productImages.sellerId, sellerId), inArray(productImages.id, imageIds)));

  if (rows.length !== imageIds.length) {
    throw imageIdsError();
  }
  for (const row of rows) {
    const unattached = row.productId === null;
    const onThisProduct = productId !== null && row.productId === productId;
    if (!unattached && !onThisProduct) {
      throw imageIdsError();
    }
  }
}

/** "ankara-wrap-dress", then "ankara-wrap-dress-2", "-3"... until this seller has none like it. */
export async function uniqueSlug(tx: Tx, sellerId: string, name: string): Promise<string> {
  const base = productSlugBase(name);
  // The base only has a-z, 0-9 and "-", so it is safe inside a LIKE pattern.
  const rows = await tx
    .select({ slug: products.slug })
    .from(products)
    .where(and(eq(products.sellerId, sellerId), like(products.slug, `${base}%`)));

  const taken = new Set<string>();
  for (const row of rows) {
    taken.add(row.slug);
  }

  if (!taken.has(base)) {
    return base;
  }
  let number = 2;
  while (taken.has(`${base}-${number}`)) {
    number = number + 1;
  }
  return `${base}-${number}`;
}
