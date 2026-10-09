import { Module } from "@nestjs/common";
import { AuditService } from "../admin/audit.service.js";
import { AuthModule } from "../auth/auth.module.js";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { EmailModule } from "../email/email.module.js";
import { HelpController } from "./help.controller.js";
import { HelpService } from "./help.service.js";
import { PublicTicketsController } from "./public-tickets.controller.js";
import { TicketsService } from "./tickets.service.js";

/**
 * Support tickets. AuditService is listed here too (it only needs the database), so tickets
 * don't have to import the whole admin module, which itself uses tickets.
 */
@Module({
  imports: [AuthModule, EmailModule, RateLimiterModule],
  controllers: [HelpController, PublicTicketsController],
  providers: [TicketsService, HelpService, AuditService],
  exports: [TicketsService],
})
export class TicketsModule {}
