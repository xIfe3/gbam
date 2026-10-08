import { ORDER_STATUSES, reasonSchema, type ReasonInput } from "@gbam/shared";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AdminGuard, CurrentAdmin, RequirePermission } from "./admin.guard.js";
import { OrdersAdminService } from "./orders-admin.service.js";

const listQuerySchema = z.object({
  q: z.string().max(100).optional(),
  status: z.enum(ORDER_STATUSES).optional(),
  shopId: z.uuid().optional(),
  // Days like "2026-10-01" (from the start of "from" to the end of "to").
  from: z.iso.date().optional(),
  to: z.iso.date().optional(),
  hasIssue: z.enum(["true"]).optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
});

const refundsQuerySchema = z.object({
  status: z.enum(["open", "resolved"]).default("open"),
});

@Controller("admin")
@UseGuards(AdminGuard)
export class OrdersAdminController {
  constructor(
    private readonly orders: OrdersAdminService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("orders")
  @RequirePermission("orders.view")
  list(@Query(new ZodPipe(listQuerySchema)) query: z.output<typeof listQuerySchema>) {
    let from: Date | undefined = undefined;
    if (query.from) {
      from = new Date(`${query.from}T00:00:00.000Z`);
    }
    let to: Date | undefined = undefined;
    if (query.to) {
      to = new Date(`${query.to}T23:59:59.999Z`);
    }
    return this.orders.list({
      q: query.q,
      status: query.status,
      shopId: query.shopId,
      from,
      to,
      hasIssue: query.hasIssue === "true",
      page: query.page,
    });
  }

  @Get("orders/:id")
  @RequirePermission("orders.view")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.orders.detail(id);
  }

  @Get("refunds")
  @RequirePermission("refunds.handle")
  refunds(@Query(new ZodPipe(refundsQuerySchema)) query: z.output<typeof refundsQuerySchema>) {
    return this.orders.refunds(query.status);
  }

  @Post("refunds/:id/resolve")
  @HttpCode(200)
  @RequirePermission("refunds.handle")
  resolve(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
  ) {
    return this.orders.resolveRefund(
      id,
      body.reason,
      admin,
      clientIp(req, this.env.INTERNAL_API_SECRET),
    );
  }
}
