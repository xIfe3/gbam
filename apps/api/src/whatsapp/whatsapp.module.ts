import { Module } from "@nestjs/common";
import { WhatsAppMessagesService } from "./whatsapp-messages.service.js";
import { WhatsAppWebhookController } from "./whatsapp-webhook.controller.js";

@Module({
  controllers: [WhatsAppWebhookController],
  providers: [WhatsAppMessagesService],
  exports: [WhatsAppMessagesService],
})
export class WhatsAppModule {}
