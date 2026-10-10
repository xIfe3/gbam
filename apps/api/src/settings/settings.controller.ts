import {
  deliverySettingsSchema,
  emailSettingsSchema,
  shopSettingsSchema,
  type DeliverySettingsInput,
  type EmailSettingsInput,
  type ShopSettingsInput,
} from "@gbam/shared";
import { Body, Controller, Get, Patch, Put, Query, UseGuards } from "@nestjs/common";
import { z } from "zod";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { DeliveryService } from "./delivery.service.js";
import { SettingsService } from "./settings.service.js";

/** Signed-in, verified sellers only (SessionGuard on the whole controller). */
@Controller("settings")
@UseGuards(SessionGuard)
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly delivery: DeliveryService,
  ) {}

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

  /** "Available ✓ / Taken" as the seller types a new shop link. */
  @Get("slug-available")
  slugAvailable(@CurrentSellerId() sellerId: string, @Query("slug") slug: unknown) {
    let text = "";
    if (typeof slug === "string") {
      text = slug.trim().toLowerCase();
    }
    return this.settings.slugAvailableFor(sellerId, text);
  }

  /** A new shop link; the old one keeps redirecting to it. */
  @Patch("slug")
  changeSlug(
    @CurrentSellerId() sellerId: string,
    @Body(new ZodPipe(z.object({ slug: z.string().trim().toLowerCase().max(60) })))
    body: { slug: string },
  ) {
    return this.settings.changeSlug(sellerId, body.slug);
  }

  @Patch("emails")
  updateEmails(
    @CurrentSellerId() sellerId: string,
    @Body(new ZodPipe(emailSettingsSchema)) body: EmailSettingsInput,
  ) {
    return this.settings.updateEmails(sellerId, body);
  }

  @Get("delivery")
  getDelivery(@CurrentSellerId() sellerId: string) {
    return this.delivery.get(sellerId);
  }

  /** The whole list of zones at once (see DeliveryService.save). */
  @Put("delivery")
  saveDelivery(
    @CurrentSellerId() sellerId: string,
    @Body(new ZodPipe(deliverySettingsSchema)) body: DeliverySettingsInput,
  ) {
    return this.delivery.save(sellerId, body);
  }
}
