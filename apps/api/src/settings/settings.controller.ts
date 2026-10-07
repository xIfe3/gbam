import { shopSettingsSchema, type ShopSettingsInput } from "@gbam/shared";
import { Body, Controller, Get, Patch, UseGuards } from "@nestjs/common";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { SettingsService } from "./settings.service.js";

/** Signed-in, verified sellers only (SessionGuard on the whole controller). */
@Controller("settings")
@UseGuards(SessionGuard)
export class SettingsController {
  constructor(private readonly settings: SettingsService) {}

  @Get()
  get(@CurrentSellerId() sellerId: string) {
    return this.settings.get(sellerId);
  }

  @Patch("shop")
  updateShop(
    @CurrentSellerId() sellerId: string,
    @Body(new ZodPipe(shopSettingsSchema)) body: ShopSettingsInput,
  ) {
    return this.settings.updateShop(sellerId, body);
  }
}
