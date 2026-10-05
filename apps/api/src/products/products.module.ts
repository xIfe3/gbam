import { products, sellers } from "@gbam/db";
import { createProductSchema, type CreateProductInput } from "@gbam/shared";
import {
  Body,
  Controller,
  Get,
  Injectable,
  Module,
  NotFoundException,
  Param,
  Post,
  UseGuards,
} from "@nestjs/common";
import { BullModule } from "@nestjs/bullmq";
import { and, asc, eq } from "drizzle-orm";
import { AuthModule } from "../auth/auth.module.js";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { RateLimiterModule } from "../common/rate-limiter.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { PHOTO_CLEANUP_QUEUE, PhotoCleanupQueue } from "./photo-cleanup.queue.js";
import { PhotosController } from "./photos.controller.js";
import { PhotosService } from "./photos.service.js";

@Injectable()
export class ProductsService {
  constructor(@InjectDb() private readonly db: Db) {}

  listForSeller(sellerId: string) {
    return this.db
      .select()
      .from(products)
      .where(eq(products.sellerId, sellerId))
      .orderBy(asc(products.name));
  }

  async create(sellerId: string, input: CreateProductInput) {
    const [product] = await this.db
      .insert(products)
      .values({ sellerId, ...input })
      .returning();
    return product!;
  }

  async storefront(slug: string) {
    const [seller] = await this.db
      .select({ id: sellers.id, businessName: sellers.businessName })
      .from(sellers)
      .where(eq(sellers.slug, slug));
    if (!seller) throw new NotFoundException("Store not found");

    const items = await this.db
      .select({
        id: products.id,
        name: products.name,
        description: products.description,
        priceKobo: products.priceKobo,
      })
      .from(products)
      .where(and(eq(products.sellerId, seller.id), eq(products.isActive, true)))
      .orderBy(asc(products.name));

    return { store: { slug, businessName: seller.businessName }, products: items };
  }
}

@Controller("products")
@UseGuards(SessionGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@CurrentSellerId() sellerId: string) {
    return this.products.listForSeller(sellerId);
  }

  @Post()
  create(
    @CurrentSellerId() sellerId: string,
    @Body(new ZodPipe(createProductSchema)) body: CreateProductInput,
  ) {
    return this.products.create(sellerId, body);
  }
}

@Controller("storefront/:slug")
export class StorefrontController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  get(@Param("slug") slug: string) {
    return this.products.storefront(slug);
  }
}

@Module({
  imports: [
    AuthModule,
    RateLimiterModule,
    BullModule.registerQueue({ name: PHOTO_CLEANUP_QUEUE }),
  ],
  controllers: [ProductsController, StorefrontController, PhotosController],
  providers: [ProductsService, PhotosService, PhotoCleanupQueue],
  exports: [PhotosService],
})
export class ProductsModule {}
