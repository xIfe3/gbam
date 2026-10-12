import {
  Inject,
  Injectable,
  Logger,
  type OnApplicationBootstrap,
  type OnModuleDestroy,
} from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "../infra/infra.module.js";

/** Where the worker writes "I'm alive" (the time, in milliseconds). */
export const HEARTBEAT_KEY = "worker:heartbeat";
export const HEARTBEAT_EVERY_MS = 30_000;
/** If the worker stops for good, the key disappears after this and it shows as "missing". */
const HEARTBEAT_TTL_SECONDS = 10 * 60;
/** The worker beats every 30 seconds; after 2 minutes without one, something is wrong. */
const WORKER_LATE_MS = 2 * 60 * 1000;

export type WorkerState = { state: "ok" | "late" | "missing"; lastBeatAt: string | null };

/**
 * Is the worker alive? Read from its last heartbeat. Used by the admin System page and by
 * GET /health/worker (which UptimeRobot watches).
 */
export async function readWorkerState(redis: Redis): Promise<WorkerState> {
  let saved: string | null = null;
  try {
    saved = await redis.get(HEARTBEAT_KEY);
  } catch {
    // Redis is down: the worker can't be judged, and can't run jobs either.
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

/**
 * Runs only in the worker process. Every 30 seconds it writes the time to Redis, so the admin
 * System page can tell whether background jobs (emails, payments, expiry...) are being run.
 */
@Injectable()
export class WorkerHeartbeat implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: NodeJS.Timeout | null = null;

  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async beat(): Promise<void> {
    await this.redis.set(HEARTBEAT_KEY, String(Date.now()), "EX", HEARTBEAT_TTL_SECONDS);
  }

  /** Nest calls this once the worker has started. */
  async onApplicationBootstrap() {
    await this.safeBeat();
    this.timer = setInterval(() => {
      void this.safeBeat();
    }, HEARTBEAT_EVERY_MS);
  }

  /** Nest calls this when the worker shuts down. */
  onModuleDestroy() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  private async safeBeat() {
    try {
      await this.beat();
    } catch (error) {
      // Redis briefly unreachable: the next beat tries again.
      Logger.warn(`Heartbeat failed: ${String(error)}`, "WorkerHeartbeat");
    }
  }
}
