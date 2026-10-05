import { Controller, Get, Param } from "@nestjs/common";
import { StorefrontService } from "./storefront.service.js";

@Controller("storefront/:slug")
export class StorefrontController {
  constructor(private readonly storefront: StorefrontService) {}

  @Get()
  get(@Param("slug") slug: string) {
    return this.storefront.storefront(slug);
  }
}
