import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { DeliveryService } from "./delivery.service.js";
import { SettingsController } from "./settings.controller.js";
import { SettingsService } from "./settings.service.js";

@Module({
  imports: [AuthModule],
  controllers: [SettingsController],
  providers: [SettingsService, DeliveryService],
  // The storefront shows a shop's delivery zones at checkout.
  exports: [DeliveryService],
})
export class SettingsModule {}
