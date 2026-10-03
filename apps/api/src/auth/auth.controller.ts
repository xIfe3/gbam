import { codeSchema, signupSchema, type SignupInput } from "@gbam/shared";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  UnauthorizedException,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { clientIp } from "../common/client-ip.js";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { AuthService, type PublicUser } from "./auth.service.js";

const verifyEmailBody = z.object({ code: codeSchema });

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
  ) {}

  @Post("signup")
  async signup(@Req() req: Request, @Body(new ZodPipe(signupSchema)) body: SignupInput) {
    const ip = clientIp(req);
    const result = await this.limiter.hit(`signup:${ip}`, 10, 3600);
    if (!result.allowed) {
      throw new TooManyRequestsError(result.retryAfterSeconds);
    }
    let userAgent: string | null = null;
    const header = req.headers["user-agent"];
    if (typeof header === "string") {
      userAgent = header.slice(0, 300);
    }
    return this.auth.signup(body, { ip, userAgent });
  }

  @Get("slug-available")
  async slugAvailable(@Req() req: Request, @Query("slug") slug: unknown) {
    const result = await this.limiter.hit(`slug-available:${clientIp(req)}`, 30, 60);
    if (!result.allowed) {
      throw new TooManyRequestsError(result.retryAfterSeconds);
    }
    if (typeof slug !== "string") {
      return { available: false, reason: "invalid" };
    }
    return this.auth.slugAvailable(slug);
  }

  @Post("verify-email")
  @HttpCode(200)
  async verifyEmail(
    @Req() req: Request,
    @Body(new ZodPipe(verifyEmailBody)) body: z.infer<typeof verifyEmailBody>,
  ) {
    const user = await this.requireUser(req);
    await this.auth.verifyEmail(user.id, body.code);
    return { ok: true };
  }

  @Post("resend-code")
  @HttpCode(200)
  async resendCode(@Req() req: Request) {
    const user = await this.requireUser(req);
    await this.auth.resendCode(user.id, "verify_email");
    return { ok: true };
  }

  /** Reads `Authorization: Bearer <token>`. Task 12 replaces this with a guard. */
  private async requireUser(req: Request): Promise<PublicUser> {
    const header = req.headers.authorization;
    if (typeof header === "string" && header.startsWith("Bearer ")) {
      const user = await this.auth.userFromToken(header.slice("Bearer ".length).trim());
      if (user) {
        return user;
      }
    }
    throw new UnauthorizedException();
  }
}
