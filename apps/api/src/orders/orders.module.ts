import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { EmailModule } from "../email/email.module.js";
import { NotificationsModule } from "../notifications/notifications.module.js";
import { ORDER_EXPIRY_QUEUE, OrderExpiryQueue } from "./order-expiry.queue.js";
import { OrderExpiryService } from "./order-expiry.service.js";
import { OrdersController, StorefrontOrdersController } from "./orders.controller.js";
import { OrdersService } from "./orders.service.js";

@Module({
  imports: [
    AuthModule,
    NotificationsModule,
    RateLimiterModule,
    EmailModule,
    BullModule.registerQueue({ name: ORDER_EXPIRY_QUEUE }),
  ],
  controllers: [OrdersController, StorefrontOrdersController],
  providers: [OrdersService, OrderExpiryService, OrderExpiryQueue],
  exports: [OrdersService, OrderExpiryService],
})
export class OrdersModule {}
