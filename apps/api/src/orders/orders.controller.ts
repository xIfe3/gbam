import {
  createOrderSchema,
  orderStatusSchema,
  updateOrderStatusSchema,
  type CreateOrderInput,
  type OrderStatus,
  type UpdateOrderStatusInput,
} from "@gbam/shared";
import {
  Body,
  Controller,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { OrdersService } from "./orders.service.js";

/** Seller dashboard. */
@Controller("orders")
@UseGuards(SessionGuard)
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get()
  list(
    @CurrentSellerId() sellerId: string,
    @Query("status", new ZodPipe(orderStatusSchema.optional())) status?: OrderStatus,
  ) {
    return this.orders.listForSeller(sellerId, status);
  }

  @Get(":id")
  get(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.orders.getForSeller(sellerId, id);
  }

  @Patch(":id/issues/:issueId/resolve")
  resolveIssue(
    @CurrentSellerId() sellerId: string,
    @Param("id", new ParseUUIDPipe()) id: string,
    @Param("issueId", new ParseUUIDPipe()) issueId: string,
  ) {
    return this.orders.resolveIssue(sellerId, id, issueId);
  }

  @Patch(":id/status")
  updateStatus(
    @CurrentSellerId() sellerId: string,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateOrderStatusSchema)) body: UpdateOrderStatusInput,
  ) {
    return this.orders.transition({ orderId: id, to: body.status, actor: "seller", sellerId });
  }
}

/** Public storefront checkout. */
@Controller("storefront/:slug/orders")
export class StorefrontOrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Post()
  create(
    @Param("slug") slug: string,
    @Body(new ZodPipe(createOrderSchema)) body: CreateOrderInput,
  ) {
    return this.orders.createFromStorefront(slug, body);
  }
}
