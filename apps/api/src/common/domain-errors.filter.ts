import { InvalidOrderTransitionError } from "@gbam/shared";
import { Catch, type ArgumentsHost, type ExceptionFilter } from "@nestjs/common";
import type { Response } from "express";
import { TooManyRequestsError } from "./rate-limiter.js";

/** Maps domain errors to HTTP statuses so controllers don't need try/catch. */
@Catch(InvalidOrderTransitionError, TooManyRequestsError)
export class DomainErrorsFilter implements ExceptionFilter {
  catch(error: InvalidOrderTransitionError | TooManyRequestsError, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();

    if (error instanceof TooManyRequestsError) {
      // Round up so we never say "try again in 0 minutes".
      const minutes = Math.max(1, Math.ceil(error.retryAfterSeconds / 60));
      res.setHeader("Retry-After", String(error.retryAfterSeconds));
      res.status(429).json({
        statusCode: 429,
        error: "TooManyRequests",
        message: `Too many attempts, try again in ${minutes} minutes`,
        retryAfterSeconds: error.retryAfterSeconds,
      });
      return;
    }

    res.status(409).json({
      statusCode: 409,
      error: "InvalidOrderTransition",
      message: error.message,
      from: error.from,
      to: error.to,
    });
  }
}
