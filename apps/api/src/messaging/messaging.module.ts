import { Module } from "@nestjs/common";
import { AudienceService } from "./audience.service.js";
import { UnsubscribeController } from "./unsubscribe.controller.js";

/** Announcements and notifications to sellers: who they go to, and unsubscribing. */
@Module({
  controllers: [UnsubscribeController],
  providers: [AudienceService],
  exports: [AudienceService],
})
export class MessagingModule {}
