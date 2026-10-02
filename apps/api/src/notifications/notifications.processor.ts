import { customers, orders } from "@gbam/db";
import { Processor, WorkerHost } from "@nestjs/bullmq";
import { Logger } from "@nestjs/common";
import type { Job } from "bullmq";
import { eq } from "drizzle-orm";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { NOTIFICATIONS_QUEUE, type NotificationJob } from "./notifications.queue.js";

@Processor(NOTIFICATIONS_QUEUE)
export class NotificationsProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationsProcessor.name);

  constructor(@InjectDb() private readonly db: Db) {
    super();
  }

  async process(job: Job<NotificationJob>) {
    const { orderId, from, to } = job.data;
    const [row] = await this.db
      .select({ code: orders.code, phone: customers.phone })
      .from(orders)
      .innerJoin(customers, eq(customers.id, orders.customerId))
      .where(eq(orders.id, orderId));

    if (!row) {
      this.logger.warn(`Order ${orderId} no longer exists, dropping job ${job.id}`);
      return { skipped: true };
    }

    // Phase 5: send a WhatsApp template message via @gbam/integrations here.
    this.logger.log(`[stub] WhatsApp → ${row.phone}: order ${row.code} ${from ?? "new"} → ${to}`);
    return { sent: false, stub: true };
  }
}
