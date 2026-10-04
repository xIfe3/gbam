import {
  ForbiddenException,
  Injectable,
  SetMetadata,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { AuthService, type PublicUser } from "./auth.service.js";

/** An Express request after SessionGuard has run: `user` is the signed-in user. */
export type AuthedRequest = Request & { user?: PublicUser };

const ALLOW_UNVERIFIED = "auth:allowUnverified";

/**
 * Marks a route (or a whole controller) as usable before the email is verified: verify,
 * resend, me and logout. `SetMetadata` just attaches a label that the guard reads back
 * with the Reflector.
 */
export const AllowUnverified = () => SetMetadata(ALLOW_UNVERIFIED, true);

// Real tokens are 43 characters; anything far longer is junk and not worth hashing.
const MAX_TOKEN_LENGTH = 200;

/**
 * The token from an `Authorization: Bearer <token>` header, or null. The scheme name is
 * case-insensitive ("bearer" works too) and extra spaces are tolerated.
 */
export function bearerToken(header: string | undefined): string | null {
  if (typeof header !== "string") {
    return null;
  }
  const match = /^\s*bearer\s+(\S+)\s*$/i.exec(header);
  if (!match) {
    return null;
  }
  const token = match[1];
  if (token === undefined || token.length > MAX_TOKEN_LENGTH) {
    return null;
  }
  return token;
}

/**
 * Signed-in sellers only. Reads the session token from the Authorization header, loads
 * the session (and slides its expiry, see AuthService.sessionUser) and attaches the user
 * to the request. No/unknown/expired token → 401. Unverified email → 403
 * `{ code: "EMAIL_NOT_VERIFIED" }`, unless the route has `@AllowUnverified()`.
 *
 * A "guard" runs before a controller method; use it via `@UseGuards(SessionGuard)`.
 * Modules using it must import AuthModule, which provides AuthService.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly auth: AuthService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthedRequest>();
    const token = bearerToken(request.headers.authorization);
    if (token === null) {
      throw new UnauthorizedException();
    }
    const user = await this.auth.sessionUser(token);
    if (!user) {
      throw new UnauthorizedException();
    }
    request.user = user;

    // Look for @AllowUnverified() on the method first, then on the controller class.
    const allowUnverified = this.reflector.getAllAndOverride<boolean | undefined>(
      ALLOW_UNVERIFIED,
      [context.getHandler(), context.getClass()],
    );
    if (!user.emailVerified && allowUnverified !== true) {
      throw new ForbiddenException({
        statusCode: 403,
        code: "EMAIL_NOT_VERIFIED",
        message: "Verify your email to continue",
      });
    }
    return true;
  }
}
