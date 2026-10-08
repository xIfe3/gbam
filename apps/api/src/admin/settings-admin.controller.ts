import {
  maintenanceSchema,
  platformSettingsSchema,
  type Maintenance,
  type PlatformSettings,
} from "@gbam/shared";
import { Body, Controller, Get, Inject, Patch, Put, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AdminGuard, CurrentAdmin, RequirePermission, SuperadminOnly } from "./admin.guard.js";
import { SettingsAdminService } from "./settings-admin.service.js";

@Controller("admin")
@UseGuards(AdminGuard)
export class SettingsAdminController {
  constructor(
    private readonly settings: SettingsAdminService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("settings")
  @RequirePermission("settings.manage")
  current() {
    return this.settings.current();
  }

  /** The whole settings form at once (every field is sent, so it's validated as a whole). */
  @Patch("settings")
  @RequirePermission("settings.manage")
  update(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodPipe(platformSettingsSchema)) body: PlatformSettings,
  ) {
    return this.settings.updateSettings(body, admin, clientIp(req, this.env.INTERNAL_API_SECRET));
  }

  @Put("maintenance")
  @SuperadminOnly()
  maintenance(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodPipe(maintenanceSchema)) body: Maintenance,
  ) {
    return this.settings.setMaintenance(body, admin, clientIp(req, this.env.INTERNAL_API_SECRET));
  }
}
