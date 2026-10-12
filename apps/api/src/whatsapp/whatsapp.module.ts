import { Module } from "@nestjs/common";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { WhatsAppMessagesService } from "./whatsapp-messages.service.js";
import { WhatsAppWebhookController } from "./whatsapp-webhook.controller.js";

@Module({
  // NotificationsModule: to queue the auto-reply. RateLimiterModule: at most one a day each.
  imports: [NotificationsModule, RateLimiterModule],
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppMessagesService],
  exports: [WhatsAppMessagesService],
})
export class WhatsAppModule {}
