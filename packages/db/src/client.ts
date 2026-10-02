import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Opens a connection pool to Postgres. The API and the worker each call this once at
 * startup. Migrations are NOT run here: they are a separate deploy step.
 */
export function createDb(url: string, options: { max?: number } = {}) {
  let maxConnections = 10;
  if (options.max !== undefined) {
    maxConnections = options.max;
  }

  const sql = postgres(url, { max: maxConnections });
  const db = drizzle(sql, { schema });

  async function close() {
    await sql.end();
  }

  return { db, close };
}

/** What createDb returns: `{ db, close }`. */
export type DbHandle = ReturnType<typeof createDb>;

/** The Drizzle database client: what you call `.select()`, `.insert()` etc. on. */
export type Db = DbHandle["db"];

/**
 * The `tx` object inside `db.transaction(async (tx) => { ... })`. It has the same methods
 * as `Db`, but everything done through it is committed or rolled back together.
 *
 * (Drizzle doesn't export a short name for this type, so we derive it: "the type of the
 * first argument of the callback you pass to db.transaction".)
 */
export type DbTransaction = Parameters<Parameters<Db["transaction"]>[0]>[0];
