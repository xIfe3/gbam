import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { ANNOUNCEMENTS_QUEUE, AnnouncementsQueue } from "./announcements.queue.js";
import { AudienceService } from "./audience.service.js";
import { BellController } from "./bell.controller.js";
import { SellerNotificationsService } from "./seller-notifications.service.js";
import { UnsubscribeController } from "./unsubscribe.controller.js";

/** Announcements and notifications to sellers: who they go to, sending, the bell, unsubscribing. */
@Module({
  imports: [AuthModule, BullModule.registerQueue({ name: ANNOUNCEMENTS_QUEUE })],
  controllers: [UnsubscribeController, BellController],
  providers: [AudienceService, AnnouncementsQueue, SellerNotificationsService],
  exports: [AudienceService, AnnouncementsQueue, SellerNotificationsService],
})
export class MessagingModule {}
