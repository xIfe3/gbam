import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { InfraModule } from "./infra/infra.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { ProductsModule } from "./products/products.module.js";

/** HTTP process. Enqueues jobs but never processes them. */
@Module({
  imports: [
    InfraModule,
    IntegrationsModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    ProductsModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
