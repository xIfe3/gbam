import {
  announcementSchema,
  sendAnnouncementSchema,
  type AnnouncementInput,
  type SendAnnouncementInput,
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
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AdminGuard, CurrentAdmin, RequirePermission } from "./admin.guard.js";
import { AnnouncementsAdminService } from "./announcements-admin.service.js";

/** Email announcements to sellers ("news and tips"). Everything needs messages.send. */
@Controller("admin/announcements")
@UseGuards(AdminGuard)
@RequirePermission("messages.send")
export class AnnouncementsAdminController {
  constructor(
    private readonly announcements: AnnouncementsAdminService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private ip(req: Request): string {
    return clientIp(req, this.env.INTERNAL_API_SECRET);
  }

  @Get()
  list(@Query("bin") bin: string | undefined) {
    return this.announcements.list(bin === "1");
  }

  @Post()
  create(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodPipe(announcementSchema)) body: AnnouncementInput,
  ) {
    return this.announcements.create(body, admin, this.ip(req));
  }

  /** Declared before ":id" routes so "preview" isn't read as an id. */
  @Post("preview")
  @HttpCode(200)
  preview(@Body(new ZodPipe(announcementSchema)) body: AnnouncementInput) {
    return this.announcements.preview(body);
  }

  @Get(":id")
  detail(@Param("id", ParseUUIDPipe) id: string) {
    return this.announcements.detail(id);
  }

  @Patch(":id")
  update(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(announcementSchema)) body: AnnouncementInput,
  ) {
    return this.announcements.update(id, body, admin, this.ip(req));
  }

  @Post(":id/test")
  @HttpCode(200)
  test(@CurrentAdmin() admin: AdminContext, @Param("id", ParseUUIDPipe) id: string) {
    return this.announcements.sendTest(id, admin);
  }

  @Post(":id/send")
  @HttpCode(200)
  send(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(sendAnnouncementSchema)) body: SendAnnouncementInput,
  ) {
    return this.announcements.send(id, body, admin, this.ip(req));
  }

  @Post(":id/cancel")
  @HttpCode(200)
  cancel(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.announcements.cancel(id, admin, this.ip(req));
  }

  @Post(":id/delete")
  @HttpCode(200)
  remove(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.announcements.remove(id, admin, this.ip(req));
  }

  @Post(":id/restore")
  @HttpCode(200)
  restore(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.announcements.restore(id, admin, this.ip(req));
  }
}
