/**
 * Provider names for the database and Redis, in their own file so services that infra.module
 * itself provides (like PlatformSettingsService) can use them without a circular import.
 */
import type { Db } from "@gbam/db";
import { Inject } from "@nestjs/common";

// A Symbol is a value guaranteed to be unique, so names can't collide.
export const DB = Symbol("DB"); // the Drizzle client itself
export const REDIS = Symbol("REDIS");

/** Use in a constructor to receive the database: `@InjectDb() private readonly db: Db` */
export function InjectDb() {
  return Inject(DB);
}
export type { Db };
