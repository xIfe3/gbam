import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { InjectDb, REDIS, type Db } from "../infra/infra.module.js";
import { readWorkerState, type WorkerState } from "../platform/worker-heartbeat.js";

export type Check = { ok: boolean; ms: number };
export type SystemStatus = { database: Check; redis: Check; worker: WorkerState };

/** Times one check: did it answer, and how long did it take. */
async function timed(check: () => Promise<unknown>): Promise<Check> {
  const started = Date.now();
  try {
    await check();
    return { ok: true, ms: Date.now() - started };
  } catch {
    return { ok: false, ms: Date.now() - started };
  }
}

/** Is each part of Gbam up? (The API itself is, or this wouldn't be answering.) */
@Injectable()
export class SystemStatusService {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
  ) {}

  async status(): Promise<SystemStatus> {
    const database = await timed(() => this.db.execute(sql`select 1`));
    const redis = await timed(() => this.redis.ping());
    const worker = await readWorkerState(this.redis);
    return { database, redis, worker };
  }
}
