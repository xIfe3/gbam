/**
 * Dev-only demo data: one seller with a few products, and its owner login
 * `demo@gbam.app`. Safe to re-run. Every run gives the demo login a NEW random password
 * and prints it (once, here), and signs out any old demo sessions.
 * Usage: pnpm db:seed
 */
import { hash, type Algorithm } from "@node-rs/argon2";
import { config } from "dotenv";
import { eq } from "drizzle-orm";
import { randomBytes } from "node:crypto";
import { createDb } from "./client";
import { CONTENT_DIR } from "./content-dir";
import { syncContent } from "./content-loader";
import { productVariants, products, sellers, sessions, users } from "./schema";

config({ path: "../../.env" });

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");
if (process.env.NODE_ENV === "production") throw new Error("Refusing to seed production");

const { db, close } = createDb(url, { max: 1 });

const DEMO_EMAIL = "demo@gbam.app";

// Same hashing as the API (apps/api/src/auth/crypto.ts): Argon2id with the library's
// defaults. This package can't import the API's code, so it calls the library directly.
const demoPassword = randomBytes(12).toString("base64url");
// Algorithm.Argon2id is a "const enum" (a compile-time-only name) that this package's
// build settings can't read, so we use its numeric value, 2, directly.
const ARGON2ID = 2 as Algorithm;
const demoPasswordHash = await hash(demoPassword, { algorithm: ARGON2ID });
const now = new Date();

// "Upsert": insert, or if the email already exists, update that row instead.
const [demoUser] = await db
  .insert(users)
  .values({ email: DEMO_EMAIL, passwordHash: demoPasswordHash, emailVerifiedAt: now })
  .onConflictDoUpdate({
    target: users.email,
    set: {
      passwordHash: demoPasswordHash,
      emailVerifiedAt: now,
      failedLoginCount: 0,
      lockedUntil: null,
    },
  })
  .returning();
if (!demoUser) throw new Error("Expected the demo user");
// The password just changed, so old demo sessions shouldn't keep working.
await db.delete(sessions).where(eq(sessions.userId, demoUser.id));

const [seller] = await db
  .insert(sellers)
  .values({
    slug: "mama-ngozi",
    businessName: "Mama Ngozi Kitchen",
    whatsappPhone: "2348000000001",
    ownerUserId: demoUser.id,
  })
  .onConflictDoUpdate({
    target: sellers.slug,
    set: { businessName: "Mama Ngozi Kitchen", ownerUserId: demoUser.id },
  })
  .returning();

if (!seller) throw new Error("Expected the demo seller");

const existing = await db.$count(products, eq(products.sellerId, seller.id));
if (existing === 0) {
  const demoProducts = [
    { name: "Jollof Rice (large)", slug: "jollof-rice-large", priceKobo: 350_000, stock: null },
    { name: "Fried Plantain", slug: "fried-plantain", priceKobo: 120_000, stock: null },
    { name: "Chapman (1L)", slug: "chapman-1l", priceKobo: 200_000, stock: 20 },
  ];
  for (const demo of demoProducts) {
    // A transaction: the product and its variant are saved together or not at all.
    await db.transaction(async (tx) => {
      const [product] = await tx
        .insert(products)
        .values({
          sellerId: seller.id,
          name: demo.name,
          slug: demo.slug,
          priceKobo: demo.priceKobo,
          stock: demo.stock,
        })
        .returning();
      if (!product) throw new Error("Expected the demo product");
      // Every product has at least one variant; with no options it is the "default" one.
      await tx.insert(productVariants).values({
        productId: product.id,
        optionValues: [],
        priceKobo: demo.priceKobo,
        stock: demo.stock,
      });
    });
  }
}

// Markdown content (help, FAQ, blog, changelog, legal) lives in packages/db/content.
// Same function as the production `sync-content` deploy step, so dev and prod match.
const contentCount = await syncContent(db, CONTENT_DIR);

console.log(`Seeded seller "${seller.slug}" → id ${seller.id}`);
console.log(`Seeded ${contentCount} content entries`);
console.log(`Demo login: ${DEMO_EMAIL} / ${demoPassword}  (new password every seed run)`);
await close();
