import { Module } from "@nestjs/common";
import { EmailModule } from "./email/email.module.js";
import { EmailProcessor } from "./email/email.processor.js";
import { HousekeepingModule } from "./housekeeping/housekeeping.module.js";
import { HousekeepingProcessor } from "./housekeeping/housekeeping.processor.js";
import { InfraModule } from "./infra/infra.module.js";
import { AnnouncementSenderService } from "./messaging/announcement-sender.service.js";
import { AnnouncementsProcessor } from "./messaging/announcements.processor.js";
import { MessagingModule } from "./messaging/messaging.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { NotificationsProcessor } from "./notifications/notifications.processor.js";
import { OrderExpiryProcessor } from "./orders/order-expiry.processor.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { PlatformModule } from "./platform/platform.module.js";
import { VisitsCopyProcessor } from "./platform/visits-copy.processor.js";
import { WorkerHeartbeat } from "./platform/worker-heartbeat.js";
import { PhotoCleanupProcessor } from "./products/photo-cleanup.processor.js";
import { ProductsModule } from "./products/products.module.js";
import { WhatsAppModule } from "./whatsapp/whatsapp.module.js";
import { PaymentsProcessor } from "./payments/payments.processor.js";

/** Worker process. Same modules as HTTP, plus the BullMQ processors. */
@Module({
  imports: [
    InfraModule,
    IntegrationsModule,
    EmailModule,
    HousekeepingModule,
    MessagingModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    PlatformModule,
    ProductsModule,
    WhatsAppModule,
  ],
  providers: [
    NotificationsProcessor,
    PaymentsProcessor,
    EmailProcessor,
    PhotoCleanupProcessor,
    OrderExpiryProcessor,
    VisitsCopyProcessor,
    HousekeepingProcessor,
    AnnouncementSenderService,
    AnnouncementsProcessor,
    // Tells the admin System page the worker is alive.
    WorkerHeartbeat,
  ],
})
export class WorkerModule {}
