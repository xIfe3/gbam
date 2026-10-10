import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { ANNOUNCEMENTS_QUEUE, AnnouncementsQueue } from "./announcements.queue.js";
import { AudienceService } from "./audience.service.js";
import { UnsubscribeController } from "./unsubscribe.controller.js";

/** Announcements and notifications to sellers: who they go to, sending, and unsubscribing. */
@Module({
  imports: [BullModule.registerQueue({ name: ANNOUNCEMENTS_QUEUE })],
  controllers: [UnsubscribeController],
  providers: [AudienceService, AnnouncementsQueue],
  exports: [AudienceService, AnnouncementsQueue],
})
export class MessagingModule {}
