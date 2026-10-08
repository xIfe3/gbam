import {
  acceptInviteSchema,
  adminLoginSchema,
  adminVerifySchema,
  type AcceptInviteInput,
  type AdminLoginInput,
  type AdminVerifyInput,
} from "@gbam/shared";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Param,
  Post,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import { AdminAuthService, type AdminContext, type RequestMeta } from "./admin-auth.service.js";
import { AdminGuard, CurrentAdmin, type AdminRequest } from "./admin.guard.js";

/** Who is signing in (stored on the session, shown on the Sessions page). */
export function requestMeta(req: Request, internalSecret: string | undefined): RequestMeta {
  let userAgent: string | null = null;
  const header = req.headers["user-agent"];
  if (typeof header === "string") {
    userAgent = header.slice(0, 300);
  }
  return { ip: clientIp(req, internalSecret), userAgent };
}

/** Invites and sign-in. Everything here works before signing in, except me and logout. */
@Controller("admin")
export class AdminAuthController {
  constructor(
    private readonly auth: AdminAuthService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("invites/:token")
  viewInvite(@Param("token") token: string) {
    return this.auth.viewInvite(token);
  }

  @Post("invites/:token/accept")
  acceptInvite(
    @Req() req: Request,
    @Param("token") token: string,
    @Body(new ZodPipe(acceptInviteSchema)) body: AcceptInviteInput,
  ) {
    return this.auth.acceptInvite(token, body, requestMeta(req, this.env.INTERNAL_API_SECRET));
  }

  @Post("auth/login")
  @HttpCode(200)
  login(@Req() req: Request, @Body(new ZodPipe(adminLoginSchema)) body: AdminLoginInput) {
    return this.auth.login(
      body.email,
      body.password,
      requestMeta(req, this.env.INTERNAL_API_SECRET),
    );
  }

  @Post("auth/verify")
  @HttpCode(200)
  verify(@Req() req: Request, @Body(new ZodPipe(adminVerifySchema)) body: AdminVerifyInput) {
    return this.auth.verify(
      body.challengeToken,
      body.code,
      requestMeta(req, this.env.INTERNAL_API_SECRET),
    );
  }

  @Post("auth/logout")
  @HttpCode(200)
  @UseGuards(AdminGuard)
  async logout(@Req() req: AdminRequest, @CurrentAdmin() admin: AdminContext) {
    const token = req.adminToken ?? "";
    await this.auth.logout(token, admin, clientIp(req, this.env.INTERNAL_API_SECRET));
    return { ok: true };
  }

  /** The signed-in admin: the website builds its menu from `permissions`. */
  @Get("me")
  @UseGuards(AdminGuard)
  me(@CurrentAdmin() admin: AdminContext) {
    return {
      id: admin.id,
      name: admin.name,
      email: admin.email,
      isSuperadmin: admin.isSuperadmin,
      role: admin.role,
      permissions: admin.permissions,
    };
  }
}
