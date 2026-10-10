import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { IntegrationsModule } from "../integrations/integrations.module.js";
import { DeliveryService } from "./delivery.service.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsService } from "./settings.service.js";
import { ShopImagesService } from "./shop-images.service.js";

@Module({
  // IntegrationsModule (photo storage) is global in the app; listed so tests get it too.
  imports: [AuthModule, IntegrationsModule, RateLimiterModule],
  controllers: [SettingsController],
  providers: [SettingsService, DeliveryService, ShopImagesService],
  // The storefront shows a shop's delivery zones at checkout.
  exports: [DeliveryService],
})
export class SettingsModule {}
