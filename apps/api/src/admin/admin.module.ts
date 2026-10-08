import { Module } from "@nestjs/common";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { EmailModule } from "../email/email.module.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminGuard } from "./admin.guard.js";
import { AuditService } from "./audit.service.js";
import { SessionsAdminService } from "./sessions-admin.service.js";
import { TeamController } from "./team.controller.js";
import { TeamService } from "./team.service.js";

/** The admin area's API: everything under /admin. */
@Module({
  imports: [EmailModule, RateLimiterModule],
  controllers: [AdminAuthController, TeamController],
  providers: [AdminAuthService, AdminGuard, AuditService, TeamService, SessionsAdminService],
  exports: [AdminAuthService, AdminGuard, AuditService],
})
export class AdminModule {}
