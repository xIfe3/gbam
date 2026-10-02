import { InjectQueue } from "@nestjs/bullmq";
import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import type { Queue } from "bullmq";
import { sql } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { NOTIFICATIONS_QUEUE } from "../notifications/notifications.queue.js";

/**
 * GET /health: tells a hosting provider (or you) whether the API can reach its database
 * and Redis. 200 = all good, 503 = something is down.
 *
 * `@Controller("health")` is a decorator: a label that tells Nest "this class handles
 * URLs starting with /health".
 */
@Controller("health")
export class HealthController {
  // Dependency injection: we don't create the database or queue ourselves. We list them
  // here and Nest passes them in. `private readonly db` also saves it as `this.db`.
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  @Get()
  async check() {
    let db = "ok";
    try {
      await this.db.execute(sql`select 1`); // the simplest possible query
    } catch {
      db = "down";
    }

    let redis = "ok";
    try {
      // Any Redis call proves Redis is reachable. (BullMQ 6 doesn't expose the raw client.)
      await this.queue.getJobCounts();
    } catch {
      redis = "down";
    }

    if (db === "down" || redis === "down") {
      // Throwing this makes Nest answer with HTTP 503 and this body.
      throw new ServiceUnavailableException({ status: "degraded", db, redis });
    }
    return { status: "ok", db, redis };
  }
}
