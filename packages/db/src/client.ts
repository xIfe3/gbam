import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * One pool per process. The API and the worker each call this once at boot.
 * Migrations are NOT run here: they are a separate deploy step (`pnpm db:migrate`).
 */
export function createDb(url: string, options: { max?: number } = {}) {
  const sql = postgres(url, { max: options.max ?? 10 });
  const db = drizzle(sql, { schema });
  return { db, close: () => sql.end() };
}

export type Db = ReturnType<typeof createDb>["db"];
