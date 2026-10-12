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
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { clientIp } from "../common/client-ip.js";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
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

  /** "Resend payment request": the customer lost the WhatsApp message. */
  @Post(":id/resend-payment")
  @HttpCode(200)
  resendPayment(@CurrentSellerId() sellerId: string, @Param("id", ParseUUIDPipe) id: string) {
    return this.orders.resendPaymentRequest(sellerId, id);
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

/**
 * How many orders may be placed per hour. Every order sends a WhatsApp message from gbam's
 * one number (plus emails), so without limits a script could spam strangers in gbam's name,
 * run up the bill, and get the number blocked for every shop.
 */
const ORDERS_PER_HOUR = {
  /** One customer's phone, across all shops. */
  perPhone: 5,
  /**
   * One visitor IP. Generous on purpose: Nigerian mobile networks put many customers
   * behind one shared IP, and they must not block each other.
   */
  perIp: 30,
  /** One shop. Far above a small seller's busiest hour. */
  perShop: 200,
};
const ONE_HOUR_SECONDS = 60 * 60;

/** Public storefront checkout. */
@Controller("storefront/:slug/orders")
export class StorefrontOrdersController {
  constructor(
    private readonly orders: OrdersService,
    private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post()
  async create(
    @Req() req: Request,
    @Param("slug") slug: string,
    @Body(new ZodPipe(createOrderSchema)) body: CreateOrderInput,
  ) {
    // Checked before anything is written, so a refused request creates nothing.
    const ip = clientIp(req, this.env.INTERNAL_API_SECRET);
    await this.checkLimit(`storefront-order:ip:${ip}`, ORDERS_PER_HOUR.perIp);
    await this.checkLimit(`storefront-order:phone:${body.customer.phone}`, ORDERS_PER_HOUR.perPhone);
    await this.checkLimit(`storefront-order:shop:${slug}`, ORDERS_PER_HOUR.perShop);
    return this.orders.createFromStorefront(slug, body);
  }

  /** Counts one more order against `key`; too many this hour → HTTP 429. */
  private async checkLimit(key: string, perHour: number) {
    const result = await this.limiter.hit(key, perHour, ONE_HOUR_SECONDS);
    if (!result.allowed) {
      throw new TooManyRequestsError(result.retryAfterSeconds);
    }
  }
}
