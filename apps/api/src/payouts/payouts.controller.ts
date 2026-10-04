import { payoutAccountSchema, type PayoutAccountInput } from "@gbam/shared";
import { Body, Controller, Get, HttpCode, Inject, Post, Req, UseGuards } from "@nestjs/common";
import type { Request } from "express";
import { CurrentSellerId } from "../auth/current-user.js";
import { SessionGuard } from "../auth/session.guard.js";
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import { PayoutsService } from "./payouts.service.js";

/** Signed-in, verified sellers only (SessionGuard on the whole controller). */
@Controller("payouts")
@UseGuards(SessionGuard)
export class PayoutsController {
  constructor(
    private readonly payouts: PayoutsService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Get("banks")
  banks() {
    return this.payouts.listBanks();
  }

  @Post("resolve-account")
  @HttpCode(200)
  resolveAccount(
    @Req() req: Request,
    @CurrentSellerId() sellerId: string,
    @Body(new ZodPipe(payoutAccountSchema)) body: PayoutAccountInput,
  ) {
    return this.payouts.resolveAccount(sellerId, clientIp(req, this.env.INTERNAL_API_SECRET), body);
  }

  // 201 Created (Nest's default for POST): a payout account now exists.
  @Post("account")
  createAccount(
    @CurrentSellerId() sellerId: string,
    @Body(new ZodPipe(payoutAccountSchema)) body: PayoutAccountInput,
  ) {
    return this.payouts.createAccount(sellerId, body);
  }
}
