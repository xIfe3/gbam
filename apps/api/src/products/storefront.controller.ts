import { Controller, Get, Param } from "@nestjs/common";
import { StorefrontService } from "./storefront.service.js";

/** Public (no login) pages for a shop's buyers. */
@Controller("storefront/:slug")
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get()
  list(@Param("slug") slug: string) {
    return this.storefront.list(slug);
  }

  @Get("products/:productSlug")
  product(@Param("slug") slug: string, @Param("productSlug") productSlug: string) {
    return this.storefront.product(slug, productSlug);
  }
}
