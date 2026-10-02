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

type SellerRequest = Request & { sellerId?: string };

/**
 * PLACEHOLDER AUTH. Reads the seller from an `x-seller-id` header in development only.
 * In production it rejects every request, so this can't ship by accident.
 * Replace with real seller auth (e.g. WhatsApp OTP + session) before launch.
 */
@Injectable()
export class SellerGuard implements CanActivate {
  constructor(@Inject(ENV) private readonly env: Env) {}

  canActivate(ctx: ExecutionContext): boolean {
    if (this.env.NODE_ENV === "production") {
      throw new UnauthorizedException("Seller auth is not implemented yet");
    }
    const req = ctx.switchToHttp().getRequest<SellerRequest>();
    const sellerId = z.uuid().safeParse(req.header("x-seller-id"));
    if (!sellerId.success) throw new UnauthorizedException("Missing or invalid x-seller-id");
    req.sellerId = sellerId.data;
    return true;
  }
}

export const CurrentSellerId = createParamDecorator((_: unknown, ctx: ExecutionContext) => {
  return ctx.switchToHttp().getRequest<SellerRequest>().sellerId!;
});
