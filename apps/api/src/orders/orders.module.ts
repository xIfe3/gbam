import { Module } from "@nestjs/common";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OrdersController, StorefrontOrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

@Module({
  imports: [NotificationsModule],
  controllers: [OrdersController, StorefrontOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
