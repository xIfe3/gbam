import {
  createParamDecorator,
  Inject,
  Injectable,
  UnauthorizedException,
  type CanActivate,
  type ExecutionContext,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { ENV, type Env } from "../env.js";

/** An Express request that may have the seller's id attached by SellerGuard. */
type SellerRequest = Request & { sellerId?: string };

/**
 * PLACEHOLDER LOGIN. Reads the seller from an `x-seller-id` header, in development only.
 * In production it rejects every request, so this can't ship by accident.
 * Replace with real seller login (e.g. a WhatsApp code) before launch.
 *
 * A "guard" runs before a controller method. If canActivate() returns true the request
 * continues; if it throws, the request is rejected. Used via `@UseGuards(SellerGuard)`.
 */
@Injectable()
export class SellerGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(context: ExecutionContext): boolean {
    if (this.env.NODE_ENV === "production") {
      throw new UnauthorizedException("Seller login is not implemented yet");
    }

    const request = context.switchToHttp().getRequest<SellerRequest>();
    const header = request.header("x-seller-id");

    const parsed = z.uuid().safeParse(header);
    if (!parsed.success) {
      throw new UnauthorizedException("Missing or invalid x-seller-id");
    }

    // Attach it to the request so CurrentSellerId (below) can read it.
    request.sellerId = parsed.data;
    return true;
  }
}

/**
 * Lets a controller write `@CurrentSellerId() sellerId: string` to receive the seller's
 * id. Only use it on routes protected by SellerGuard, which sets the id.
 */
export const CurrentSellerId = createParamDecorator(
  (_data: unknown, context: ExecutionContext): string => {
    const request = context.switchToHttp().getRequest<SellerRequest>();
    if (!request.sellerId) {
      throw new Error("CurrentSellerId used on a route without @UseGuards(SellerGuard)");
    }
    return request.sellerId;
  },
);
