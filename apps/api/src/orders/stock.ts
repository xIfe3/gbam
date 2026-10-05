import { orderItems, orders, productVariants, type DbTransaction } from "@gbam/db";
import { and, asc, eq, isNotNull, sql } from "drizzle-orm";

/**
 * "Product – Variant", or just "Product" for a default variant (its title is empty).
 * Used in customer-facing messages and the shortfall log.
 */
export function variantDisplayName(productName: string, variantTitle: string): string {
  if (variantTitle === "") {
    return productName;
  }
  return `${productName} – ${variantTitle}`;
}

/**
 * Takes the ordered quantities off stock once an order is paid. Call it inside the
 * transaction that marks the order paid, so both happen together or not at all.
 *
 * Only variants with tracked stock (a number, not null) are touched.
 * Stock never goes below 0. If a variant had less than the order needs (two customers
 * paid for the last unit), we still take it to 0, flag the order `stock_shortfall`, and
 * the seller has to refund it.
 */
export async function reduceStockForPaidOrder(
  tx: DbTransaction,
  orderId: string,
): Promise<{ shortfall: boolean }> {
  // FOR UPDATE locks each variant row until our transaction ends. If another payment is
  // reducing the same variant, we wait here, then read the stock AFTER their change.
  // Ordering by variant id makes every payment lock rows in the same order, so two
  // payments that share variants can't each wait on the other (a "deadlock").
  const lines = await tx
    .select({
      variantId: productVariants.id,
      quantity: orderItems.quantity,
      stock: productVariants.stock,
    })
    .from(orderItems)
    .innerJoin(productVariants, eq(productVariants.id, orderItems.variantId))
    .where(and(eq(orderItems.orderId, orderId), isNotNull(productVariants.stock)))
    .orderBy(asc(productVariants.id))
    .for("update", { of: productVariants });

  let shortfall = false;
  for (const line of lines) {
    if (line.stock === null) {
      continue; // untracked (the query already skips these)
    }
    if (line.stock < line.quantity) {
      shortfall = true;
    }
    // greatest(..., 0) keeps stock from ever going negative.
    await tx
      .update(productVariants)
      .set({ stock: sql`greatest(${productVariants.stock} - ${line.quantity}, 0)` })
      .where(eq(productVariants.id, line.variantId));
  }

  if (shortfall) {
    await tx.update(orders).set({ stockShortfall: true }).where(eq(orders.id, orderId));
  }
  return { shortfall };
}
