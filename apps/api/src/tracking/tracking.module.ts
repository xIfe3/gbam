import { Module } from "@nestjs/common";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { EmailModule } from "../email/email.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { TrackingController } from "./tracking.controller.js";
import { TrackingService } from "./tracking.service.js";

@Module({
  imports: [RateLimiterModule, PaymentsModule, EmailModule],
  controllers: [TrackingController],
  providers: [TrackingService],
})
export class TrackingModule {}
