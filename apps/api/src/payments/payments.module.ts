import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { OrdersModule } from "../orders/orders.module.js";
import { PAYMENTS_QUEUE, PaymentsQueue } from "./payments.queue.js";
import { PaymentsService } from "./payments.service.js";
import { PaystackWebhookController } from "./paystack-webhook.controller.js";

/** PaymentsProcessor is registered in WorkerModule only, like the notifications one. */
@Module({
  imports: [OrdersModule, BullModule.registerQueue({ name: PAYMENTS_QUEUE })],
  controllers: [PaystackWebhookController],
  providers: [PaymentsService, PaymentsQueue],
  exports: [PaymentsService],
})
export class PaymentsModule {}
