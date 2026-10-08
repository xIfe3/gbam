import {
  bulkActionSchema,
  reasonSchema,
  type BulkActionInput,
  type ReasonInput,
} from "@gbam/shared";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  ParseUUIDPipe,
  Post,
  Put,
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
import { ShopsAdminService, type ShopListQuery } from "./shops-admin.service.js";

/** "true"/"false" in the address bar → true/false; anything else → not filtered. */
function yesNo(value: string | undefined): boolean | undefined {
  if (value === "true") {
    return true;
  }
  if (value === "false") {
    return false;
  }
  return undefined;
}

const listQuerySchema = z.object({
  q: z.string().max(200).optional(),
  status: z.enum(["active", "suspended", "closed"]).optional(),
  hasProducts: z.string().optional(),
  hasBank: z.string().optional(),
  page: z.coerce.number().int().min(1).max(10_000).default(1),
  sort: z.enum(["newest", "oldest", "name"]).default("newest"),
});

const feeWaiverSchema = z.object({
  // A day like "2027-01-31", or null to end the waiver.
  until: z.iso.date().nullable(),
});

@Controller("admin/shops")
@UseGuards(AdminGuard)
export class ShopsAdminController {
  constructor(
    private readonly shops: ShopsAdminService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private ip(req: Request): string {
    return clientIp(req, this.env.INTERNAL_API_SECRET);
  }

  @Get()
  @RequirePermission("shops.view")
  list(@Query(new ZodPipe(listQuerySchema)) query: z.output<typeof listQuerySchema>) {
    const listQuery: ShopListQuery = {
      q: query.q,
      status: query.status,
      hasProducts: yesNo(query.hasProducts),
      hasBank: yesNo(query.hasBank),
      page: query.page,
      sort: query.sort,
    };
    return this.shops.list(listQuery);
  }

  @Get(":id")
  @RequirePermission("shops.view")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.shops.detail(id);
  }

  @Post("bulk/suspend")
  @HttpCode(200)
  @RequirePermission("shops.suspend")
  bulkSuspend(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodPipe(bulkActionSchema)) body: BulkActionInput,
  ) {
    return this.shops.bulkSetSuspended(body.ids, true, body.note, admin, this.ip(req));
  }

  @Post("bulk/reopen")
  @HttpCode(200)
  @RequirePermission("shops.suspend")
  bulkReopen(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodPipe(bulkActionSchema)) body: BulkActionInput,
  ) {
    return this.shops.bulkSetSuspended(body.ids, false, body.note, admin, this.ip(req));
  }

  @Post(":id/suspend")
  @HttpCode(200)
  @RequirePermission("shops.suspend")
  suspend(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
  ) {
    return this.shops.suspend(id, body.reason, admin, this.ip(req));
  }

  @Post(":id/reopen")
  @HttpCode(200)
  @RequirePermission("shops.suspend")
  reopen(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
  ) {
    return this.shops.reopen(id, body.reason, admin, this.ip(req));
  }

  @Post(":id/unlock-seller")
  @HttpCode(200)
  @RequirePermission("sellers.help")
  unlock(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.shops.unlockSeller(id, admin, this.ip(req));
  }

  @Post(":id/resend-verification")
  @HttpCode(200)
  @RequirePermission("sellers.help")
  resendVerification(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.shops.resendVerification(id, admin, this.ip(req));
  }

  @Put(":id/fee-waiver")
  @RequirePermission("fees.manage")
  feeWaiver(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(feeWaiverSchema)) body: z.output<typeof feeWaiverSchema>,
  ) {
    let until: Date | null = null;
    if (body.until !== null) {
      // The waiver lasts to the end of that day.
      until = new Date(`${body.until}T23:59:59.000Z`);
    }
    return this.shops.setFeeWaiver(id, until, admin, this.ip(req));
  }
}
