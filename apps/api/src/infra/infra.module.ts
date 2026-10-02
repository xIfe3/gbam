import { createDb, type Db } from "@gbam/db";
import { BullModule } from "@nestjs/bullmq";
import { Global, Inject, Injectable, Module, type OnApplicationShutdown } from "@nestjs/common";
import { Redis } from "ioredis";
import { ENV, loadEnv, type Env } from "../env.js";

const DB_HANDLE = Symbol("DB_HANDLE");
export const DB = Symbol("DB");
export const REDIS = Symbol("REDIS");

/** Inject the Drizzle client: `constructor(@InjectDb() private readonly db: Db)` */
export const InjectDb = () => Inject(DB);
export type { Db };

@Injectable()
class RedisLifecycle implements OnApplicationShutdown {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    // BullMQ never closes a connection it was handed, so we own it.
    await this.redis.quit().catch(() => this.redis.disconnect());
  }
}

/**
 * Env + the Redis client. Separate from InfraModule because BullModule.forRootAsync
 * can only inject providers from modules it imports.
 */
@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    {
      provide: REDIS,
      inject: [ENV],
      // BullMQ 6 in native ESM needs a constructed client, not connection options.
      // maxRetriesPerRequest: null is required for BullMQ workers' blocking commands.
      useFactory: (env: Env) => new Redis(env.REDIS_URL, { maxRetriesPerRequest: null }),
    },
    RedisLifecycle,
  ],
  exports: [ENV, REDIS],
})
class CoreModule {}

@Injectable()
class DbLifecycle implements OnApplicationShutdown {
  constructor(@Inject(DB_HANDLE) private readonly handle: ReturnType<typeof createDb>) {}

  async onApplicationShutdown() {
    await this.handle.close();
  }
}

/**
 * Shared by both entrypoints (HTTP and worker): env, Postgres, Redis and BullMQ.
 * Entrypoints must call enableShutdownHooks() so connections close cleanly.
 */
@Global()
@Module({
  imports: [
    CoreModule,
    BullModule.forRootAsync({
      imports: [CoreModule],
      inject: [REDIS],
      useFactory: (redis: Redis) => ({ connection: redis }),
    }),
  ],
  providers: [
    { provide: DB_HANDLE, inject: [ENV], useFactory: (env: Env) => createDb(env.DATABASE_URL) },
    { provide: DB, inject: [DB_HANDLE], useFactory: (h: ReturnType<typeof createDb>) => h.db },
    DbLifecycle,
  ],
  exports: [CoreModule, DB],
})
export class InfraModule {}
