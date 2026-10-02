/**
 * Dev-only demo data: one seller with a few products. Safe to re-run.
 * Usage: pnpm db:seed
 */
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { createDb } from "./client";
import { products, sellers } from "./schema";

config({ path: "../../.env" });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed production");

const { db, close } = createDb(url, { max: 1 });

const [seller] = await db
  .insert(sellers)
  .values({
    slug: "mama-ngozi",
    businessName: "Mama Ngozi Kitchen",
    whatsappPhone: "2348000000001",
  })
  .onConflictDoUpdate({ target: sellers.slug, set: { businessName: "Mama Ngozi Kitchen" } })
  .returning();

const existing = await db.$count(products, eq(products.sellerId, seller!.id));
if (existing === 0) {
  await db.insert(products).values([
    { sellerId: seller!.id, name: "Jollof Rice (large)", priceKobo: 350_000 },
    { sellerId: seller!.id, name: "Fried Plantain", priceKobo: 120_000 },
    { sellerId: seller!.id, name: "Chapman (1L)", priceKobo: 200_000, stock: 20 },
  ]);
}

console.log(`Seeded seller "${seller!.slug}" → id ${seller!.id}`);
console.log(`Use header  x-seller-id: ${seller!.id}`);
await close();
