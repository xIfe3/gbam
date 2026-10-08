import { Module } from "@nestjs/common";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { EmailModule } from "../email/email.module.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminGuard } from "./admin.guard.js";
import { AuditService } from "./audit.service.js";

/** The admin area's API: everything under /admin. */
@Module({
  imports: [EmailModule, RateLimiterModule],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminGuard, AuditService],
  exports: [AdminAuthService, AdminGuard, AuditService],
})
export class AdminModule {}
