import { Controller, Get, Inject, ServiceUnavailableException } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "../infra/infra.module.js";
import { readWorkerState } from "../platform/worker-heartbeat.js";

/**
 * GET /health/worker: is the background worker running? 200 = yes, 503 = it hasn't checked
 * in for 2 minutes. Point an UptimeRobot monitor here: if the worker stops, payments are
 * never confirmed and no WhatsApp message goes out, but the website still looks fine.
 *
 * Kept apart from GET /health on purpose: Railway can use /health to decide whether a new
 * API version started, and a worker restart shouldn't make the API look broken.
 */
@Controller("health")
export class WorkerHealthController {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  @Get("worker")
  async check() {
    const worker = await readWorkerState(this.redis);
    if (worker.state !== "ok") {
      // Throwing this makes Nest answer with HTTP 503 and this body.
      throw new ServiceUnavailableException({
        worker: worker.state,
        lastBeatAt: worker.lastBeatAt,
      });
    }
    return { worker: worker.state, lastBeatAt: worker.lastBeatAt };
  }
}
