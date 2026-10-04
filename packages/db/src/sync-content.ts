/**
 * Production-safe content sync: writes packages/db/content (help, FAQ, blog, changelog,
 * legal) into the content_entries table. Run on every deploy, right after migrations:
 *
 *   node node_modules/@gbam/db/dist/sync-content.js
 *
 * Each file is an "upsert" keyed by (type, slug), so re-running it is safe: unchanged
 * files rewrite the same values and edited files are updated. Unlike the seed, it creates
 * no demo users or sellers, so it is allowed in production.
 */
import { createDb } from "./client";
import { CONTENT_DIR } from "./content-dir";
import { syncContent } from "./content-loader";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const { db, close } = createDb(url, { max: 1 });

try {
  console.log(`Syncing content from ${CONTENT_DIR}`);
  const count = await syncContent(db, CONTENT_DIR);
  console.log(`Synced ${count} content entries`);
} finally {
  await close();
}
