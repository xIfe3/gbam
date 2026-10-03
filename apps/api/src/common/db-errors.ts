/**
 * True if `error` is Postgres saying "this would create a duplicate" (error code 23505)
 * for the given unique constraint. Drizzle wraps the Postgres error, so we look at the
 * error and at what it wraps (`error.cause`).
 */
export function isUniqueViolation(error: unknown, constraintName: string): boolean {
  let current: unknown = error;
  while (current !== null && typeof current === "object") {
    const pgError = current as { code?: string; constraint_name?: string; cause?: unknown };
    if (pgError.code === "23505" && pgError.constraint_name === constraintName) {
      return true;
    }
    current = pgError.cause;
  }
  return false;
}
