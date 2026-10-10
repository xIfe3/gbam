import { audienceSchema, notificationSchema, type NotificationInput } from "@gbam/shared";
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
import { NotificationsAdminService } from "./notifications-admin.service.js";

const countSchema = z.object({ audience: audienceSchema });

/** In-app notifications to sellers' dashboard bells. Everything needs messages.send. */
@Controller("admin/notifications")
@UseGuards(AdminGuard)
@RequirePermission("messages.send")
export class NotificationsAdminController {
  constructor(
    private readonly notifications: NotificationsAdminService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private ip(req: Request): string {
    return clientIp(req, this.env.INTERNAL_API_SECRET);
  }

  @Get()
  list(@Query("bin") bin: string | undefined) {
    return this.notifications.list(bin === "1");
  }

  @Post("count")
  @HttpCode(200)
  count(@Body(new ZodPipe(countSchema)) body: z.output<typeof countSchema>) {
    return this.notifications.count(body.audience);
  }

  @Post()
  create(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodPipe(notificationSchema)) body: NotificationInput,
  ) {
    return this.notifications.create(body, admin, this.ip(req));
  }

  @Post(":id/delete")
  @HttpCode(200)
  remove(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.notifications.remove(id, admin, this.ip(req));
  }

  @Post(":id/restore")
  @HttpCode(200)
  restore(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.notifications.restore(id, admin, this.ip(req));
  }
}
