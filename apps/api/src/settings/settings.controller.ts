import {
  deliverySettingsSchema,
  emailSettingsSchema,
  shopSettingsSchema,
  type DeliverySettingsInput,
  type EmailSettingsInput,
  type ShopSettingsInput,
} from "@gbam/shared";
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { z } from "zod";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { DeliveryService } from "./delivery.service.js";
import type { ShopImageKind } from "../products/photo-processing.js";
import { SettingsService } from "./settings.service.js";
import { ShopImagesService } from "./shop-images.service.js";

/** "logo" or "banner" from the address; anything else is a 400. */
function imageKind(kind: string): ShopImageKind {
  if (kind === "logo" || kind === "banner") {
    return kind;
  }
  throw new BadRequestException("Unknown image");
}

/** Signed-in, verified sellers only (SessionGuard on the whole controller). */
@Controller("settings")
@UseGuards(SessionGuard)
export class SettingsController {
  constructor(
    private readonly settings: SettingsService,
    private readonly delivery: DeliveryService,
    private readonly images: ShopImagesService,
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

  /** Uploads the shop's logo or banner (multipart field "image"). */
  @Post("images/:kind")
  @UseInterceptors(
    FileInterceptor("image", { limits: { fileSize: 10 * 1024 * 1024 + 1, files: 1, parts: 2 } }),
  )
  uploadImage(
    @CurrentSellerId() sellerId: string,
    @Param("kind") kind: string,
    @UploadedFile() file: { buffer: Buffer; size: number } | undefined,
  ) {
    if (!file) {
      throw new BadRequestException("Choose a photo to upload");
    }
    return this.images.upload(sellerId, imageKind(kind), file);
  }

  @Delete("images/:kind")
  @HttpCode(200)
  removeImage(@CurrentSellerId() sellerId: string, @Param("kind") kind: string) {
    return this.images.remove(sellerId, imageKind(kind));
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
