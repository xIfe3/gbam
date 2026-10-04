import { createParamDecorator, ForbiddenException, type ExecutionContext } from "@nestjs/common";
import type { PublicUser } from "./auth.service.js";
import type { AuthedRequest } from "./session.guard.js";

function userFrom(context: ExecutionContext): PublicUser {
  const request = context.switchToHttp().getRequest<AuthedRequest>();
  if (!request.user) {
    // A programming mistake, not a client error: the route is missing the guard.
    throw new Error("CurrentUser/CurrentSellerId used on a route without SessionGuard");
  }
  return request.user;
}

/**
 * `@CurrentUser() user: PublicUser` in a controller method receives the signed-in user.
 * Only on routes protected by `@UseGuards(SessionGuard)`, which sets it.
 */
export const CurrentUser = createParamDecorator(
  (_data: unknown, context: ExecutionContext): PublicUser => {
    return userFrom(context);
  },
);

/**
 * `@CurrentSellerId() sellerId: string` receives the id of the signed-in user's shop.
 * 403 if the user has no shop (for example an admin account).
 */
export const CurrentSellerId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const user = userFrom(context);
    if (!user.seller) {
      throw new ForbiddenException({
        statusCode: 403,
        code: "NO_SELLER",
        message: "This account has no shop",
      });
    }
    return user.seller.id;
  },
);
