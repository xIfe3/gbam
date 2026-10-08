import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { EmailModule } from "../email/email.module.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminGuard } from "./admin.guard.js";
import { AuditService } from "./audit.service.js";
import { SessionsAdminService } from "./sessions-admin.service.js";
import { ShopsAdminController } from "./shops-admin.controller.js";
import { ShopsAdminService } from "./shops-admin.service.js";
import { TeamController } from "./team.controller.js";
import { TeamService } from "./team.service.js";

/** The admin area's API: everything under /admin. */
@Module({
  imports: [AuthModule, EmailModule, RateLimiterModule],
  controllers: [AdminAuthController, TeamController, ShopsAdminController],
  providers: [
    AdminAuthService,
    AdminGuard,
    AuditService,
    TeamService,
    SessionsAdminService,
    ShopsAdminService,
  ],
  exports: [AdminAuthService, AdminGuard, AuditService],
})
export class AdminModule {}
