import { Module } from "@nestjs/common";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { EmailModule } from "../email/email.module.js";
import { ContactController } from "./contact.controller.js";
import { ContactService } from "./contact.service.js";

@Module({
  imports: [EmailModule, RateLimiterModule],
  controllers: [ContactController],
  providers: [ContactService],
})
export class ContactModule {}
