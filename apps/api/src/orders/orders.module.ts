import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { EmailModule } from "../email/email.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { OrdersController, StorefrontOrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

@Module({
  imports: [AuthModule, NotificationsModule, EmailModule],
  controllers: [OrdersController, StorefrontOrdersController],
  providers: [OrdersService],
  exports: [OrdersService],
})
export class OrdersModule {}
