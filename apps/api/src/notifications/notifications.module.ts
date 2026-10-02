import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { NOTIFICATIONS_QUEUE, NotificationsQueue } from "./notifications.queue.js";

/** Producer only. The processor is registered in WorkerModule so HTTP never consumes jobs. */
@Module({
  imports: [BullModule.registerQueue({ name: NOTIFICATIONS_QUEUE })],
  providers: [NotificationsQueue],
  exports: [NotificationsQueue, BullModule],
})
export class NotificationsModule {}
