import { Module } from "@nestjs/common";
import { InfraModule } from "./infra/infra.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { NotificationsProcessor } from "./notifications/notifications.processor.js";

/** Worker process. Same modules as HTTP, plus the BullMQ processors. */
@Module({
  imports: [InfraModule, NotificationsModule],
  providers: [NotificationsProcessor],
})
export class WorkerModule {}
