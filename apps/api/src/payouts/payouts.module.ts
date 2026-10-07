import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { EmailModule } from "../email/email.module.js";
import { PayoutsController } from "./payouts.controller.js";
import { PayoutsService } from "./payouts.service.js";

// PAYSTACK, DB and REDIS come from global modules (IntegrationsModule, InfraModule).
@Module({
  imports: [AuthModule, EmailModule, RateLimiterModule],
  controllers: [PayoutsController],
  providers: [PayoutsService],
})
export class PayoutsModule {}
