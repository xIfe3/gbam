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
