import { Controller, Get, Inject, Param, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { clientIp } from "../common/client-ip.js";
import { ENV, type Env } from "../env.js";
import type { AdminContext } from "./admin-auth.service.js";
import { AdminGuard, CurrentAdmin, RequirePermission } from "./admin.guard.js";
import { SystemAdminService } from "./system-admin.service.js";

/** The System page: health, errors, background jobs and uptime. */
@Controller("admin/system")
@UseGuards(AdminGuard)
export class SystemAdminController {
  constructor(
    private readonly system: SystemAdminService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get()
  @RequirePermission("system.view")
  overview() {
    return this.system.overview();
  }

  @Get("queues/:name/failed")
  @RequirePermission("system.view")
  failed(@Param("name") name: string) {
    return this.system.failedJobs(name);
  }

  @Post("queues/:name/jobs/:id/retry")
  @RequirePermission("system.manage")
  retry(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("name") name: string,
    @Param("id") id: string,
  ) {
    return this.system.retry(name, id, admin, clientIp(req, this.env.INTERNAL_API_SECRET));
  }
}
