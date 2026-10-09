import { Inject, Injectable } from "@nestjs/common";
import { sql } from "drizzle-orm";
import type { Redis } from "ioredis";
import { InjectDb, REDIS, type Db } from "../infra/infra.module.js";
import { HEARTBEAT_KEY } from "../platform/worker-heartbeat.js";

/** The worker beats every 30 seconds; after 2 minutes without one, something is wrong. */
const WORKER_LATE_MS = 2 * 60 * 1000;

export type Check = { ok: boolean; ms: number };
export type WorkerState = { state: "ok" | "late" | "missing"; lastBeatAt: string | null };
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
    const worker = await this.worker();
    return { database, redis, worker };
  }

  private async worker(): Promise<WorkerState> {
    let saved: string | null = null;
    try {
      saved = await this.redis.get(HEARTBEAT_KEY);
    } catch {
      // Redis is down: the Redis check already says so; the worker can't be judged.
      saved = null;
    }
    if (saved === null) {
      return { state: "missing", lastBeatAt: null };
    }
    const lastBeat = Number(saved);
    const lastBeatAt = new Date(lastBeat).toISOString();
    if (Date.now() - lastBeat > WORKER_LATE_MS) {
      return { state: "late", lastBeatAt };
    }
    return { state: "ok", lastBeatAt };
  }
}
