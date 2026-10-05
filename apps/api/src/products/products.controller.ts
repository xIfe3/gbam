import {
  productStatusSchema,
  productInputSchema,
  updateProductInputSchema,
  type ProductInput,
  type ProductStatus,
  type UpdateProductInput,
} from "@gbam/shared";
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Put,
  UseGuards,
} from "@nestjs/common";
import { z } from "zod";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ProductsService } from "./products.service.js";

const statusBodySchema = z.object({ status: productStatusSchema });
type StatusBody = { status: ProductStatus };

@Controller("products")
@UseGuards(SessionGuard)
export class ProductsController {
  constructor(private readonly products: ProductsService) {}

  @Get()
  list(@CurrentSellerId() sellerId: string) {
    return this.products.list(sellerId);
  }

  @Get(":id")
  get(@CurrentSellerId() sellerId: string, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.products.get(sellerId, id);
  }

  @Post()
  create(
    @CurrentSellerId() sellerId: string,
    @Body(new ZodPipe(productInputSchema)) body: ProductInput,
  ) {
    return this.products.create(sellerId, body);
  }

  @Put(":id")
  update(
    @CurrentSellerId() sellerId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(updateProductInputSchema)) body: UpdateProductInput,
  ) {
    return this.products.update(sellerId, id, body);
  }

  @Patch(":id/status")
  @HttpCode(204)
  async setStatus(
    @CurrentSellerId() sellerId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Body(new ZodPipe(statusBodySchema)) body: StatusBody,
  ): Promise<void> {
    await this.products.setStatus(sellerId, id, body.status);
  }

  @Delete(":id")
  remove(@CurrentSellerId() sellerId: string, @Param("id", new ParseUUIDPipe()) id: string) {
    return this.products.remove(sellerId, id);
  }
}
