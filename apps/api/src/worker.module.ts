import { Module } from "@nestjs/common";
import { EmailModule } from "./email/email.module.js";
import { EmailProcessor } from "./email/email.processor.js";
import { InfraModule } from "./infra/infra.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { NotificationsProcessor } from "./notifications/notifications.processor.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { WhatsAppModule } from "./whatsapp/whatsapp.module.js";
import { PaymentsProcessor } from "./payments/payments.processor.js";

/** Worker process. Same modules as HTTP, plus the BullMQ processors. */
@Module({
  imports: [
    InfraModule,
    IntegrationsModule,
    EmailModule,
    NotificationsModule,
    PaymentsModule,
    WhatsAppModule,
  ],
  providers: [NotificationsProcessor, PaymentsProcessor, EmailProcessor],
})
export class WorkerModule {}
