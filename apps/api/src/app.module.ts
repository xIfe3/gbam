import { Module } from "@nestjs/common";
import { HealthController } from "./health/health.controller.js";
import { InfraModule } from "./infra/infra.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { ProductsModule } from "./products/products.module.js";

/** HTTP process. Enqueues jobs but never processes them. */
@Module({
  imports: [InfraModule, NotificationsModule, OrdersModule, ProductsModule],
  controllers: [HealthController],
})
export class AppModule {}
