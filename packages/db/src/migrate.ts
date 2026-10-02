/**
 * Production migration runner: applies packages/db/migrations with drizzle-orm's
 * migrator (no drizzle-kit needed at runtime). Run ONCE per deploy, before the API and
 * worker start, never on app boot:
 *
 *   node node_modules/@gbam/db/dist/migrate.js
 *
 * Drizzle records applied migrations in drizzle.__drizzle_migrations and takes a lock,
 * so re-running is a no-op.
 */
import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import { fileURLToPath } from "node:url";
import postgres from "postgres";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const migrationsFolder = fileURLToPath(new URL("../migrations", import.meta.url));
const sql = postgres(url, { max: 1, onnotice: () => {} });

try {
  console.log(`Applying migrations from ${migrationsFolder}`);
  await migrate(drizzle(sql), { migrationsFolder });
  console.log("Migrations up to date");
} finally {
  await sql.end();
}
