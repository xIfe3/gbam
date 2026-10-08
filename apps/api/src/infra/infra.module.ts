/**
 * The shared plumbing both processes (HTTP and worker) need: settings, Postgres, Redis
 * and the BullMQ queue connection.
 *
 * HOW NEST "PROVIDERS" WORK (the idea behind this whole file):
 * A provider is "something Nest can hand to a class that asks for it". Each one has:
 *   - provide:    a name (here a Symbol, a unique label) that classes ask for
 *   - useFactory: a function Nest calls ONCE to create the value
 *   - inject:     other providers the factory needs as arguments
 * So `{ provide: DB, inject: [DB_HANDLE], useFactory: getDbClient }` means:
 * "when someone asks for DB, call getDbClient(<the DB_HANDLE value>) once and share it."
 */
import { createDb, type Db, type DbHandle } from "@gbam/db";
import { BullModule } from "@nestjs/bullmq";
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
import { Redis } from "ioredis";
import { ENV, loadEnv, type Env } from "../env.js";

import { DB, REDIS } from "./tokens.js";
import {
  PLATFORM_SETTINGS_NAMESPACE,
  PlatformSettingsService,
} from "./platform-settings.service.js";

// The provider names live in tokens.ts; re-exported here so existing imports keep working.
export { DB, InjectDb, REDIS, type Db } from "./tokens.js";

const DB_HANDLE = Symbol("DB_HANDLE"); // { db, close }, used to close the pool on shutdown

// ---- Factories: each runs once at startup ----

function createRedisClient(env: Env): Redis {
  // BullMQ 6 (in an ESM app) needs a ready-made Redis client, not just a URL.
  // maxRetriesPerRequest: null is required by BullMQ's workers.
  return new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
}

function createDbHandle(env: Env): DbHandle {
  return createDb(env.DATABASE_URL);
}

function getDbClient(handle: DbHandle): Db {
  return handle.db;
}

function createBullConfig(redis: Redis) {
  return { connection: redis };
}

// ---- Clean shutdown ----
// Nest calls onApplicationShutdown() when the process is stopping (because main.ts and
// worker.ts call enableShutdownHooks()). Closing connections lets deploys restart cleanly.

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    // BullMQ never closes a connection we hand it, so closing it is our job.
    try {
      await this.redis.quit(); // polite: finish pending commands first
    } catch {
      this.redis.disconnect(); // forceful fallback
    }
  }
}

@Injectable()
class DbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: DbHandle) {}

  async onApplicationShutdown() {
    await this.handle.close();
  }
}

// ---- Modules ----

/**
 * Settings + Redis. Kept separate from InfraModule only because of a Nest rule:
 * BullModule.forRootAsync (below) can only use providers from modules it imports.
 *
 * `@Global()` makes these providers available everywhere without importing the module.
 */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: loadEnv },
    { provide: REDIS, inject: [ENV], useFactory: createRedisClient },
    RedisLifecycle,
  ],
  exports: [ENV, REDIS],
})
class CoreModule {}

@Global()
@Module({
  imports: [
    CoreModule,
    // Sets up BullMQ (the job queue library) to use our Redis client.
    BullModule.forRootAsync({
      imports: [CoreModule],
      inject: [REDIS],
      useFactory: createBullConfig,
    }),
  ],
  providers: [
    { provide: DB_HANDLE, inject: [ENV], useFactory: createDbHandle },
    { provide: DB, inject: [DB_HANDLE], useFactory: getDbClient },
    DbLifecycle,
    // Admin → Settings, readable everywhere. The namespace is empty except in tests.
    { provide: PLATFORM_SETTINGS_NAMESPACE, useValue: "" },
    PlatformSettingsService,
  ],
  exports: [CoreModule, DB, PlatformSettingsService],
})
export class InfraModule {}
