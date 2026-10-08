import {
  inviteAdminSchema,
  reasonSchema,
  roleInputSchema,
  updateAdminSchema,
  type InviteAdminInput,
  type ReasonInput,
  type RoleInput,
  type UpdateAdminInput,
} from "@gbam/shared";
import {
  Body,
  Controller,
  Delete,
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
import { AdminGuard, CurrentAdmin, SuperadminOnly } from "./admin.guard.js";
import { SessionsAdminService } from "./sessions-admin.service.js";
import { TeamService } from "./team.service.js";

/**
 * The team, roles and sessions pages. Superadmin only: `@SuperadminOnly()` on the class
 * applies to every route below. `ParseUUIDPipe` turns a malformed id into a 400.
 */
@Controller("admin")
@UseGuards(AdminGuard)
@SuperadminOnly()
export class TeamController {
  constructor(
    private readonly team: TeamService,
    private readonly sessions: SessionsAdminService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private ip(req: Request): string {
    return clientIp(req, this.env.INTERNAL_API_SECRET);
  }

  @Get("team")
  list() {
    return this.team.list();
  }

  @Post("team")
  invite(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodPipe(inviteAdminSchema)) body: InviteAdminInput,
  ) {
    return this.team.invite(body, admin, this.ip(req));
  }

  @Patch("team/:id")
  update(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(updateAdminSchema)) body: UpdateAdminInput,
  ) {
    return this.team.update(id, body, admin, this.ip(req));
  }

  @Post("team/:id/reset-authenticator")
  @HttpCode(200)
  resetAuthenticator(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.team.resetAuthenticator(id, admin, this.ip(req));
  }

  @Post("team/:id/remove")
  @HttpCode(200)
  remove(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.team.remove(id, admin, this.ip(req));
  }

  @Get("roles")
  roles(@Query("bin") bin: string | undefined) {
    return this.team.roles(bin === "1");
  }

  @Post("roles")
  createRole(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Body(new ZodPipe(roleInputSchema)) body: RoleInput,
  ) {
    return this.team.createRole(body, admin, this.ip(req));
  }

  @Patch("roles/:id")
  updateRole(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
    @Body(new ZodPipe(roleInputSchema)) body: RoleInput,
  ) {
    return this.team.updateRole(id, body, admin, this.ip(req));
  }

  @Delete("roles/:id")
  deleteRole(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.team.deleteRole(id, admin, this.ip(req));
  }

  @Post("roles/:id/restore")
  @HttpCode(200)
  restoreRole(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("id", ParseUUIDPipe) id: string,
  ) {
    return this.team.restoreRole(id, admin, this.ip(req));
  }

  @Get("sessions/admins")
  adminSessions(@CurrentAdmin() admin: AdminContext) {
    return this.sessions.adminSessions(admin);
  }

  @Get("sessions/sellers")
  sellerSessions(@Query("q") q: string | undefined) {
    return this.sessions.sellerSessions(q);
  }

  @Post("sessions/admins/:sessionId/end")
  @HttpCode(200)
  endAdminSession(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
  ) {
    return this.sessions.endAdminSession(sessionId, admin, this.ip(req));
  }

  @Post("sessions/admins/by-admin/:adminId/end-all")
  @HttpCode(200)
  endAllForAdmin(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("adminId", ParseUUIDPipe) adminId: string,
  ) {
    return this.sessions.endAllForAdmin(adminId, admin, this.ip(req));
  }

  @Post("sessions/sellers/:sessionId/end")
  @HttpCode(200)
  endSellerSession(
    @Req() req: Request,
    @CurrentAdmin() admin: AdminContext,
    @Param("sessionId", ParseUUIDPipe) sessionId: string,
    @Body(new ZodPipe(reasonSchema)) body: ReasonInput,
  ) {
    return this.sessions.endSellerSession(sessionId, body.reason, admin, this.ip(req));
  }
}
