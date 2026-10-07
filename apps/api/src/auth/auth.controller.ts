import {
  changePasswordSchema,
  closeAccountSchema,
  codeSchema,
  forgotPasswordSchema,
  loginSchema,
  resetPasswordSchema,
  signupSchema,
  type ChangePasswordInput,
  type CloseAccountInput,
  type ForgotPasswordInput,
  type LoginInput,
  type ResetPasswordInput,
  type SignupInput,
} from "@gbam/shared";
import {
  Body,
  Controller,
  Get,
  HttpCode,
  Inject,
  Post,
  Query,
  Req,
  UseGuards,
} from "@nestjs/common";
import type { Request } from "express";
import { z } from "zod";
import { clientIp } from "../common/client-ip.js";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { ZodPipe } from "../common/zod-validation.pipe.js";
import { ENV, type Env } from "../env.js";
import { AuthService, type PublicUser, type SessionMeta } from "./auth.service.js";
import { CurrentUser } from "./current-user.js";
import { AllowUnverified, bearerToken, SessionGuard } from "./session.guard.js";

const verifyEmailBody = z.object({ code: codeSchema });

/** Who is signing in, stored on the session row (helps a user spot a strange device). */
function sessionMeta(req: Request, internalSecret: string | undefined): SessionMeta {
  let userAgent: string | null = null;
  const header = req.headers["user-agent"];
  if (typeof header === "string") {
    userAgent = header.slice(0, 300);
  }
  return { ip: clientIp(req, internalSecret), userAgent };
}

@Controller("auth")
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly limiter: RateLimiter,
    @Inject(ENV) private readonly env: Env,
  ) {}

  private meta(req: Request): SessionMeta {
    return sessionMeta(req, this.env.INTERNAL_API_SECRET);
  }

  @Post("signup")
  async signup(@Req() req: Request, @Body(new ZodPipe(signupSchema)) body: SignupInput) {
    const meta = this.meta(req);
    const result = await this.limiter.hit(`signup:${meta.ip}`, 10, 3600);
    if (!result.allowed) {
      throw new TooManyRequestsError(result.retryAfterSeconds);
    }
    return this.auth.signup(body, meta);
  }

  @Get("slug-available")
  async slugAvailable(@Req() req: Request, @Query("slug") slug: unknown) {
    const result = await this.limiter.hit(
      `slug-available:${clientIp(req, this.env.INTERNAL_API_SECRET)}`,
      30,
      60,
    );
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
  @UseGuards(SessionGuard)
  @AllowUnverified()
  async verifyEmail(
    @CurrentUser() user: PublicUser,
    @Body(new ZodPipe(verifyEmailBody)) body: z.infer<typeof verifyEmailBody>,
  ) {
    await this.auth.verifyEmail(user.id, body.code);
    return { ok: true };
  }

  @Post("resend-code")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @AllowUnverified()
  async resendCode(@CurrentUser() user: PublicUser) {
    await this.auth.resendCode(user.id, "verify_email");
    return { ok: true };
  }

  @Post("login")
  @HttpCode(200)
  async login(@Req() req: Request, @Body(new ZodPipe(loginSchema)) body: LoginInput) {
    return this.auth.login(body.email, body.password, this.meta(req));
  }

  @Post("logout")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  @AllowUnverified()
  async logout(@Req() req: Request) {
    // The guard has already checked this header, so the token is there.
    const token = bearerToken(req.headers.authorization);
    if (token !== null) {
      await this.auth.logout(token);
    }
    return { ok: true };
  }

  @Get("me")
  @UseGuards(SessionGuard)
  @AllowUnverified()
  me(@CurrentUser() user: PublicUser) {
    return user;
  }

  @Post("forgot-password")
  @HttpCode(200)
  async forgotPassword(
    @Req() req: Request,
    @Body(new ZodPipe(forgotPasswordSchema)) body: ForgotPasswordInput,
  ) {
    // requestId comes back for every email (a dummy one when there is no account), so the
    // answer is the same either way. The web app keeps it for the reset step.
    const { requestId } = await this.auth.forgotPassword(body.email, this.meta(req));
    return { ok: true, message: "If that email has an account, we've sent a code", requestId };
  }

  @Post("reset-password")
  @HttpCode(200)
  async resetPassword(
    @Req() req: Request,
    @Body(new ZodPipe(resetPasswordSchema)) body: ResetPasswordInput,
  ) {
    return this.auth.resetPassword(
      body.email,
      body.requestId,
      body.code,
      body.password,
      this.meta(req),
    );
  }

  // ---- Settings (signed-in, verified sellers) ----

  @Post("change-password")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async changePassword(
    @Req() req: Request,
    @CurrentUser() user: PublicUser,
    @Body(new ZodPipe(changePasswordSchema)) body: ChangePasswordInput,
  ) {
    // The guard has already checked this header, so the token is there.
    const token = bearerToken(req.headers.authorization);
    if (token === null) {
      throw new Error("SessionGuard let a request through without a session token");
    }
    await this.auth.changePassword(user.id, token, body.currentPassword, body.newPassword);
    return { ok: true };
  }

  @Post("close-account")
  @HttpCode(200)
  @UseGuards(SessionGuard)
  async closeAccount(
    @CurrentUser() user: PublicUser,
    @Body(new ZodPipe(closeAccountSchema)) body: CloseAccountInput,
  ) {
    await this.auth.closeAccount(user.id, body.businessName, body.password);
    return { ok: true };
  }
}
