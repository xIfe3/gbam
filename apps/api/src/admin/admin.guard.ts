import type { AdminPermission } from "@gbam/shared";
import {
  createParamDecorator,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { AdminAuthService, type AdminContext } from "./admin-auth.service.js";

/** An Express request after AdminGuard has run: `admin` is the signed-in admin. */
export type AdminRequest = Request & { admin?: AdminContext; adminToken?: string };

const PERMISSION = "admin:permission";
const SUPERADMIN = "admin:superadmin";
/** Plenty for a person clicking around; stops a script hammering the API with a stolen token. */
const REQUESTS_PER_MINUTE = 300;
const MAX_TOKEN_LENGTH = 200;

/** The route needs this permission (a superadmin always has it). */
export const RequirePermission = (permission: AdminPermission) =>
  SetMetadata(PERMISSION, permission);

/** Only a superadmin may use this route (team, roles, sessions, maintenance). */
export const SuperadminOnly = () => SetMetadata(SUPERADMIN, true);

/** `@CurrentAdmin() admin: AdminContext` in a controller method: the signed-in admin. */
export const CurrentAdmin = createParamDecorator((_data: unknown, context: ExecutionContext) => {
  const request = context.switchToHttp().getRequest<AdminRequest>();
  if (!request.admin) {
    throw new UnauthorizedException();
  }
  return request.admin;
});

/** Can this admin do this? Superadmins can do everything. */
export function adminCan(admin: AdminContext, permission: AdminPermission): boolean {
  if (admin.isSuperadmin) {
    return true;
  }
  return admin.permissions.includes(permission);
}

/**
 * Signed-in admins only. The website sends the admin's session token in an `x-admin-token`
 * header (never the seller's `Authorization` header, so the two can't be mixed up).
 * No/unknown token → 401; missing permission or not a superadmin → 403.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(
    private readonly auth: AdminAuthService,
    private readonly reflector: Reflector,
    private readonly limiter: RateLimiter,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AdminRequest>();
    const header = request.headers["x-admin-token"];
    if (typeof header !== "string" || header === "" || header.length > MAX_TOKEN_LENGTH) {
      throw new UnauthorizedException();
    }
    const admin = await this.auth.sessionAdmin(header);
    if (!admin) {
      throw new UnauthorizedException();
    }

    const limit = await this.limiter.hit(`admin-rate:${admin.id}`, REQUESTS_PER_MINUTE, 60);
    if (!limit.allowed) {
      throw new TooManyRequestsError(limit.retryAfterSeconds);
    }
    request.admin = admin;
    request.adminToken = header;

    // Look on the method first, then on the controller class.
    const targets = [context.getHandler(), context.getClass()];
    const superadminOnly = this.reflector.getAllAndOverride<boolean | undefined>(
      SUPERADMIN,
      targets,
    );
    if (superadminOnly === true && !admin.isSuperadmin) {
      throw new ForbiddenException("Only a superadmin can do this");
    }
    const permission = this.reflector.getAllAndOverride<AdminPermission | undefined>(
      PERMISSION,
      targets,
    );
    if (permission !== undefined && !adminCan(admin, permission)) {
      throw new ForbiddenException("Your role doesn't allow this");
    }
    return true;
  }
}
