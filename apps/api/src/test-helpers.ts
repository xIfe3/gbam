/**
 * Shared setup for the integration tests (not used by the app itself).
 */
import { sellers, type Db } from "@gbam/db";
import { and, like, lt } from "drizzle-orm";
import { randomInt, randomUUID } from "node:crypto";

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
