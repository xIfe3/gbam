import { InjectQueue } from "@nestjs/bullmq";
import { Controller, Get, ServiceUnavailableException } from "@nestjs/common";
import type { Queue } from "bullmq";
import { sql } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { NOTIFICATIONS_QUEUE } from "../notifications/notifications.queue.js";

@Controller("health")
export class HealthController {
  constructor(
    @InjectDb() private readonly db: Db,
    @InjectQueue(NOTIFICATIONS_QUEUE) private readonly queue: Queue,
  ) {}

  @Get()
  async check() {
    const [db, redis] = await Promise.all([
      this.db.execute(sql`select 1`).then(
        () => "ok" as const,
        () => "down" as const,
      ),
      // Any round-trip proves Redis is reachable (BullMQ 6 no longer exposes the raw client).
      this.queue.getJobCounts().then(
        () => "ok" as const,
        () => "down" as const,
      ),
    ]);
    const body = { status: db === "ok" && redis === "ok" ? "ok" : "degraded", db, redis };
    if (body.status !== "ok") throw new ServiceUnavailableException(body);
    return body;
  }
}
