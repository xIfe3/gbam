import {
  reportIssueSchema,
  trackLookupSchema,
  type ReportIssueInput,
  type TrackLookupInput,
} from "@gbam/shared";
import { Body, Controller, Get, HttpCode, Inject, Param, Post, Query, Req } from "@nestjs/common";
import type { Request } from "express";
import { clientIp } from "../common/client-ip.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import { TrackingService } from "./tracking.service.js";

/** A query value that is exactly one string; anything else (missing, repeated) becomes "". */
function oneString(value: unknown): string {
  if (typeof value === "string") {
    return value;
  }
  return "";
}

/** Public: no login. Customers prove it's their order with the key or code + phone digits. */
@Controller("track")
export class TrackingController {
  constructor(
    private readonly tracking: TrackingService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  @Post("lookup")
  @HttpCode(200)
  lookup(@Req() req: Request, @Body(new ZodPipe(trackLookupSchema)) body: TrackLookupInput) {
    return this.tracking.lookup(clientIp(req, this.env.INTERNAL_API_SECRET), body);
  }

  @Get(":code")
  view(@Param("code") code: string, @Query("key") key: unknown) {
    return this.tracking.view(code, oneString(key));
  }

  @Post(":code/pay")
  @HttpCode(200)
  pay(@Param("code") code: string, @Query("key") key: unknown) {
    return this.tracking.payLink(code, oneString(key));
  }

  @Post(":code/issues")
  report(
    @Param("code") code: string,
    @Query("key") key: unknown,
    @Body(new ZodPipe(reportIssueSchema)) body: ReportIssueInput,
  ) {
    return this.tracking.reportIssue(code, oneString(key), body);
  }
}
