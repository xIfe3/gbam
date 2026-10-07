import { Inject, Injectable, Module } from "@nestjs/common";
import type { Redis } from "ioredis";
import { REDIS } from "../infra/infra.module.js";

/** Thrown when a caller has used up its allowance. DomainErrorsFilter turns it into HTTP 429. */
export class TooManyRequestsError extends Error {
  constructor(readonly retryAfterSeconds: number) {
    super("Too many requests");
    this.name = "TooManyRequestsError";
  }
}

export type RateLimitResult = { allowed: boolean; retryAfterSeconds: number };

/**
 * Fixed-window counter in Redis. Reused by signup, login, verification codes and bank checks.
 * Usage: `const r = await limiter.hit("contact:1.2.3.4", 5, 3600)`; if `!r.allowed`,
 * throw `new TooManyRequestsError(r.retryAfterSeconds)`.
 */
@Injectable()
export class RateLimiter {
  constructor(@Inject(REDIS) private readonly redis: Redis) {}

  async hit(key: string, limit: number, windowSeconds: number): Promise<RateLimitResult> {
    // INCR creates the key at 1 if missing and adds one otherwise (atomic in Redis).
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, windowSeconds);
    }

    let ttl = await this.redis.ttl(key);
    if (ttl < 0) {
      // -1 = the key has no expiry (EXPIRE never ran, e.g. a crash between the two calls).
      // Without this repair the counter would block this key forever.
      await this.redis.expire(key, windowSeconds);
      ttl = windowSeconds;
    }

    return { allowed: count <= limit, retryAfterSeconds: Math.max(1, ttl) };
  }

  /** How many hits a key has had in its current window, without adding one. */
  async count(key: string): Promise<number> {
    const value = await this.redis.get(key);
    if (value === null) {
      return 0;
    }
    return Number(value);
  }
}

@Module({
  providers: [RateLimiter],
  exports: [RateLimiter],
})
export class RateLimiterModule {}
