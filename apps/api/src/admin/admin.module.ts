import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { EmailModule } from "../email/email.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminGuard } from "./admin.guard.js";
import { AuditService } from "./audit.service.js";
import { OrdersAdminController } from "./orders-admin.controller.js";
import { OrdersAdminService } from "./orders-admin.service.js";
import { SessionsAdminService } from "./sessions-admin.service.js";
import { ShopsAdminController } from "./shops-admin.controller.js";
import { ShopsAdminService } from "./shops-admin.service.js";
import { SupportAdminController } from "./support-admin.controller.js";
import { SupportAdminService } from "./support-admin.service.js";
import { TeamController } from "./team.controller.js";
import { TeamService } from "./team.service.js";

/** The admin area's API: everything under /admin. */
@Module({
  imports: [AuthModule, EmailModule, OrdersModule, RateLimiterModule],
  controllers: [
    AdminAuthController,
    TeamController,
    ShopsAdminController,
    OrdersAdminController,
    SupportAdminController,
  ],
  providers: [
    AdminAuthService,
    AdminGuard,
    AuditService,
    TeamService,
    SessionsAdminService,
    ShopsAdminService,
    OrdersAdminService,
    SupportAdminService,
  ],
  exports: [AdminAuthService, AdminGuard, AuditService],
})
export class AdminModule {}
