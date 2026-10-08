import { BullModule } from "@nestjs/bullmq";
import { Module } from "@nestjs/common";
import { AuthModule } from "../auth/auth.module.js";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { SettingsModule } from "../settings/settings.module.js";
import { PHOTO_CLEANUP_QUEUE, PhotoCleanupQueue } from "./photo-cleanup.queue.js";
import { PhotosController } from "./photos.controller.js";
import { PhotosService } from "./photos.service.js";
import { ProductsController } from "./products.controller.js";
import { ProductsService } from "./products.service.js";
import { StorefrontController } from "./storefront.controller.js";
import { StorefrontService } from "./storefront.service.js";

@Module({
  imports: [
    AuthModule,
    RateLimiterModule,
    SettingsModule,
    BullModule.registerQueue({ name: PHOTO_CLEANUP_QUEUE }),
  ],
  controllers: [ProductsController, StorefrontController, PhotosController],
  providers: [ProductsService, StorefrontService, PhotosService, PhotoCleanupQueue],
  exports: [PhotosService],
})
export class ProductsModule {}
