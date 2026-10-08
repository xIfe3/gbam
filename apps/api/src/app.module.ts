import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module.js";
import { APP_FILTER } from "@nestjs/core";
import { SentryGlobalFilter, SentryModule } from "@sentry/nestjs/setup";
import { AuthModule } from "./auth/auth.module.js";
import { ContactModule } from "./contact/contact.module.js";
import { ContentModule } from "./content/content.module.js";
import { HealthController } from "./health/health.controller.js";
import { InfraModule } from "./infra/infra.module.js";
import { IntegrationsModule } from "./integrations/integrations.module.js";
import { NotificationsModule } from "./notifications/notifications.module.js";
import { OrdersModule } from "./orders/orders.module.js";
import { PaymentsModule } from "./payments/payments.module.js";
import { PayoutsModule } from "./payouts/payouts.module.js";
import { WhatsAppModule } from "./whatsapp/whatsapp.module.js";
import { ProductsModule } from "./products/products.module.js";
import { SettingsModule } from "./settings/settings.module.js";
import { ToursModule } from "./tours/tours.module.js";
import { TrackingModule } from "./tracking/tracking.module.js";

/** HTTP process. Enqueues jobs but never processes them. */
@Module({
  imports: [
    // Error alerts. Does nothing unless SENTRY_DSN is set (see instrument.ts).
    SentryModule.forRoot(),
    AdminModule,
    AuthModule,
    ContactModule,
    ContentModule,
    InfraModule,
    IntegrationsModule,
    NotificationsModule,
    OrdersModule,
    PaymentsModule,
    PayoutsModule,
    ProductsModule,
    SettingsModule,
    ToursModule,
    TrackingModule,
    WhatsAppModule,
  ],
  controllers: [HealthController],
  providers: [
    // Reports unexpected errors (500s) to Sentry, then answers as Nest normally would.
    // Expected ones (404, 400, 409...) are not reported: they're the app working correctly.
    { provide: APP_FILTER, useClass: SentryGlobalFilter },
  ],
})
export class AppModule {}
