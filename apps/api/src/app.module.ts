import { Module } from "@nestjs/common";
import { AuthModule } from "./auth/auth.module.js";
import { ContactModule } from "./contact/contact.module.js";
import { ContentModule } from "./content/content.module.js";
import { HealthController } from "./health/health.controller.js";
import { InfraModule } from "./infra/infra.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { PayoutsModule } from "./payouts/payouts.module.js";
import { WhatsAppModule } from "./whatsapp/whatsapp.module.js";
import { ProductsModule } from "./products/products.module.js";

/** HTTP process. Enqueues jobs but never processes them. */
@Module({
  imports: [
    AuthModule,
    ContactModule,
    ContentModule,
    InfraModule,
    IntegrationsModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    PayoutsModule,
    ProductsModule,
    WhatsAppModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
