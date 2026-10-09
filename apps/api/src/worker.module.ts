import { Module } from "@nestjs/common";
import { EmailModule } from "./email/email.module.js";
import { EmailProcessor } from "./email/email.processor.js";
import { InfraModule } from "./infra/infra.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { NotificationsProcessor } from "./notifications/notifications.processor.js";
import { OrderExpiryProcessor } from "./orders/order-expiry.processor.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { PlatformModule } from "./platform/platform.module.js";
import { VisitsCopyProcessor } from "./platform/visits-copy.processor.js";
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
  ],
})
export class WorkerModule {}
