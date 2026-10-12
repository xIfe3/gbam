import { BullModule, getQueueToken } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import type { Queue } from "bullmq";
import { AuthModule } from "../auth/auth.module.js";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { EmailModule } from "../email/email.module.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { OrdersModule } from "../orders/orders.module.js";
import { PaymentsModule } from "../payments/payments.module.js";
import { PlatformModule } from "../platform/platform.module.js";
import { MessagingModule } from "../messaging/messaging.module.js";
import { TicketsModule } from "../tickets/tickets.module.js";
import { AdminAuthController } from "./admin-auth.controller.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminGuard } from "./admin.guard.js";
import { AnalyticsAdminService } from "./analytics-admin.service.js";
import { AnnouncementsAdminController } from "./announcements-admin.controller.js";
import { AnnouncementsAdminService } from "./announcements-admin.service.js";
import { AuditService } from "./audit.service.js";
import { ContentAdminController } from "./content-admin.controller.js";
import { ContentAdminService } from "./content-admin.service.js";
import { MoneyAdminService } from "./money-admin.service.js";
import { NotificationsAdminController } from "./notifications-admin.controller.js";
import { NotificationsAdminService } from "./notifications-admin.service.js";
import { NumbersAdminController } from "./numbers-admin.controller.js";
import { OrdersAdminController } from "./orders-admin.controller.js";
import { OrdersAdminService } from "./orders-admin.service.js";
import { SessionsAdminService } from "./sessions-admin.service.js";
import { SettingsAdminController } from "./settings-admin.controller.js";
import { SettingsAdminService } from "./settings-admin.service.js";
import { ShopsAdminController } from "./shops-admin.controller.js";
import { ShopsAdminService } from "./shops-admin.service.js";
import { SupportAdminController } from "./support-admin.controller.js";
import { SupportAdminService } from "./support-admin.service.js";
import { SentryIssuesClient } from "./sentry-issues.client.js";
import { SystemAdminController } from "./system-admin.controller.js";
import { SYSTEM_QUEUE_NAMES, SYSTEM_QUEUES, SystemAdminService } from "./system-admin.service.js";
import { SystemStatusService } from "./system-status.service.js";
import { TicketsAdminController } from "./tickets-admin.controller.js";
import { TicketsAdminService } from "./tickets-admin.service.js";
import { UptimeClient } from "./uptime.client.js";
import { TeamController } from "./team.controller.js";
import { TeamService } from "./team.service.js";

/** One BullMQ queue connection per queue name, so the System page can count their jobs. */
const queueRegistrations = [];
for (const name of SYSTEM_QUEUE_NAMES) {
  queueRegistrations.push({ name });
}
const queueTokens = [];
for (const name of SYSTEM_QUEUE_NAMES) {
  queueTokens.push(getQueueToken(name));
}

/** The admin area's API: everything under /admin. */
@Module({
  imports: [
    AuthModule,
    EmailModule,
    // Photo storage (R2) for content images. Global in the app; listed so tests get it too.
    IntegrationsModule,
    OrdersModule,
    // PaymentsService: the "Re-check with Paystack" button on an order.
    PaymentsModule,
    PlatformModule,
    RateLimiterModule,
    TicketsModule,
    MessagingModule,
    BullModule.registerQueue(...queueRegistrations),
  ],
  controllers: [
    AdminAuthController,
    TeamController,
    ShopsAdminController,
    OrdersAdminController,
    SupportAdminController,
    SettingsAdminController,
    NumbersAdminController,
    SystemAdminController,
    TicketsAdminController,
    AnnouncementsAdminController,
    NotificationsAdminController,
    ContentAdminController,
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
    SettingsAdminService,
    MoneyAdminService,
    AnalyticsAdminService,
    SystemStatusService,
    SentryIssuesClient,
    UptimeClient,
    SystemAdminService,
    TicketsAdminService,
    AnnouncementsAdminService,
    NotificationsAdminService,
    ContentAdminService,
    // A "factory" provider: Nest looks up each queue (by its token) and passes them all in,
    // and the list becomes SYSTEM_QUEUES.
    {
      provide: SYSTEM_QUEUES,
      useFactory: (...queues: Queue[]) => queues,
      inject: queueTokens,
    },
  ],
  exports: [AdminAuthService, AdminGuard, AuditService],
})
export class AdminModule {}
