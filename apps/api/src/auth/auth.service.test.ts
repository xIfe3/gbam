/** Integration test against the dev Postgres and Redis db 1. The email queue is a recorder. */
import "reflect-metadata";
import { emailCodes, sellers, sessions, users } from "@gbam/db";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  UnauthorizedException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomInt, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Redis } from "ioredis";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TooManyRequestsError } from "../common/rate-limiter.js";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { DB, InfraModule, REDIS, type Db } from "../infra/infra.module.js";
import { AuthModule } from "./auth.module.js";
import { AuthService } from "./auth.service.js";
import { hashToken } from "./crypto.js";

process.loadEnvFile?.("../../.env");

describe("AuthService signup and verification (integration)", () => {
  let moduleRef: TestingModule;
  let service: AuthService;
  let db: Db;
  let redis: Redis;
  const sent: { jobId: string; job: EmailJob }[] = [];
  const createdEmails: string[] = [];
  const meta = { ip: "203.0.113.9", userAgent: "vitest" };
  // Set to true to make the next queued email fail, like a Redis outage would.
  let failNextSend = false;

  // Login and reset are rate-limited per IP; a fresh fake "IP" per call keeps tests independent.
  function freshMeta() {
    return { ip: `test-${randomUUID()}`, userAgent: "vitest" };
  }

  function newInput(overrides: Record<string, string> = {}) {
    const id = randomUUID().slice(0, 8);
    // "299" isn't a real country code, so this can never be someone's actual number.
    let phone = "299";
    for (let i = 0; i < 10; i++) {
      phone = phone + String(randomInt(10));
    }
    const input = {
      businessName: "Ada Bakes",
      slug: `authtest-${id}`,
      phone,
      email: `authtest-${id}@example.com`,
      password: "correct horse battery",
      ...overrides,
    };
    createdEmails.push(input.email.trim().toLowerCase());
    return input;
  }

  // The recorder holds the plaintext code, which is how we learn it (the DB has only a hash).
  function lastCodeFor(
    email: string,
    kind: "verify_email" | "reset_password" = "verify_email",
  ): string {
    for (let i = sent.length - 1; i >= 0; i--) {
      const entry = sent[i];
      if (entry && entry.job.kind === kind && entry.job.to === email) {
        return entry.job.code;
      }
    }
    throw new Error("no code sent");
  }

  function sentTo(email: string): number {
    let count = 0;
    for (const entry of sent) {
      // Contact messages and deletion requests go to our own inboxes, not to a user.
      if (
        entry.job.kind !== "contact_message" &&
        entry.job.kind !== "account_closed" &&
        entry.job.to === email
      ) {
        count = count + 1;
      }
    }
    return count;
  }

  beforeAll(async () => {
    const fakeQueue = {
      send: async (jobId: string, job: EmailJob) => {
        if (failNextSend) {
          failNextSend = false;
          throw new Error("queue is down");
        }
        sent.push({ jobId, job });
      },
    };
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, AuthModule] })
      .overrideProvider(EmailQueue)
      .useValue(fakeQueue)
      .compile();
    service = moduleRef.get(AuthService);
    db = moduleRef.get(DB);
    redis = moduleRef.get<Redis>(REDIS);
  });

  afterAll(async () => {
    const rows = await db.select().from(users).where(inArray(users.email, createdEmails));
    const ids = rows.map((r) => r.id);
    if (ids.length > 0) {
      await db.delete(sellers).where(inArray(sellers.ownerUserId, ids));
      await db.delete(users).where(inArray(users.id, ids)); // cascades to sessions and codes
      for (const id of ids) {
        await redis.del(`resend-code:${id}`, `resend-code-hour:${id}`);
      }
    }
    await moduleRef.close();
  });

  it("creates user, seller and session and queues a verify_email code", async () => {
    const input = newInput();
    const result = await service.signup(input, meta);
    expect(result.sessionToken).toHaveLength(43);
    expect(result.user.email).toBe(input.email);
    expect(result.user.emailVerified).toBe(false);
    expect(result.user.role).toBe("seller");
    expect(result.user.seller?.slug).toBe(input.slug);
    expect(result.user.seller?.hasPayoutAccount).toBe(false);

    const [session] = await db
      .select()
      .from(sessions)
      .where(eq(sessions.tokenHash, hashToken(result.sessionToken)));
    expect(session?.userId).toBe(result.user.id);
    expect(session?.ip).toBe(meta.ip);

    const [row] = await db.select().from(users).where(eq(users.id, result.user.id));
    expect(row?.passwordHash).not.toContain(input.password);

    expect(lastCodeFor(input.email)).toMatch(/^\d{6}$/);
    const entry = sent.find((s) => s.job.kind === "verify_email" && s.job.to === input.email);
    expect(entry?.jobId).toMatch(/^code-/);

    const viaToken = await service.sessionUser(result.sessionToken);
    expect(viaToken?.id).toBe(result.user.id);
    expect(viaToken?.seller?.slug).toBe(input.slug);
    expect(await service.sessionUser("not-a-token")).toBeNull();
  });

  it("trims and lowercases the email", async () => {
    const input = newInput();
    const result = await service.signup(
      { ...input, email: ` ${input.email.toUpperCase()} ` },
      meta,
    );
    expect(result.user.email).toBe(input.email);
  });

  it("rejects a duplicate email, slug or phone with a field", async () => {
    const first = newInput();
    await service.signup(first, meta);

    const dupEmail = newInput({ email: first.email });
    const emailError = await service.signup(dupEmail, meta).catch((e: unknown) => e);
    expect(emailError).toBeInstanceOf(ConflictException);
    expect((emailError as ConflictException).getResponse()).toMatchObject({ field: "email" });

    const dupSlug = newInput({ slug: first.slug });
    const slugError = await service.signup(dupSlug, meta).catch((e: unknown) => e);
    expect(slugError).toBeInstanceOf(ConflictException);
    expect((slugError as ConflictException).getResponse()).toMatchObject({ field: "slug" });

    const dupPhone = newInput({ phone: first.phone });
    const phoneError = await service.signup(dupPhone, meta).catch((e: unknown) => e);
    expect(phoneError).toBeInstanceOf(ConflictException);
    expect((phoneError as ConflictException).getResponse()).toMatchObject({ field: "phone" });
  });

  it("two concurrent signups with the same email: one wins, one is a ConflictException", async () => {
    const a = newInput();
    const b = newInput({ email: a.email });
    const results = await Promise.allSettled([service.signup(a, meta), service.signup(b, meta)]);
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected");
    expect(fulfilled).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    const reason = (rejected[0] as PromiseRejectedResult).reason;
    expect(reason).toBeInstanceOf(ConflictException);
    expect(reason.getResponse()).toMatchObject({ field: "email" });
  });

  it("verifies with the right code and marks the email verified", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    await service.verifyEmail(user.id, lastCodeFor(input.email));
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.emailVerifiedAt).not.toBeNull();
  });

  it("kills the code after 5 wrong attempts, even for the right value", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    const right = lastCodeFor(input.email);
    const wrong = right === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      await expect(service.verifyEmail(user.id, wrong)).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(service.verifyEmail(user.id, right)).rejects.toBeInstanceOf(BadRequestException);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.emailVerifiedAt).toBeNull();
  });

  it("concurrent wrong guesses cannot exceed 5 attempts", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    const right = lastCodeFor(input.email);
    const wrong = right === "000000" ? "000001" : "000000";
    await Promise.allSettled(Array.from({ length: 12 }, () => service.verifyEmail(user.id, wrong)));
    const [code] = await db.select().from(emailCodes).where(eq(emailCodes.userId, user.id));
    expect(code?.attempts).toBe(5);
    await expect(service.verifyEmail(user.id, right)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("rejects an expired code", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    await db
      .update(emailCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(emailCodes.userId, user.id));
    const error = await service
      .verifyEmail(user.id, lastCodeFor(input.email))
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({ field: "code" });
  });

  it("limits resend to once per 60 seconds, then invalidates the old code", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    await expect(service.resendCode(user.id, "verify_email")).rejects.toBeInstanceOf(
      TooManyRequestsError,
    );

    // Pretend the signup code was sent a while ago and the limiter window has passed.
    const oldCode = lastCodeFor(input.email);
    await db
      .update(emailCodes)
      .set({ createdAt: new Date(Date.now() - 120_000) })
      .where(eq(emailCodes.userId, user.id));
    await redis.del(`resend-code:${user.id}`);
    await service.resendCode(user.id, "verify_email");
    const newCode = lastCodeFor(input.email);

    const codes = await db.select().from(emailCodes).where(eq(emailCodes.userId, user.id));
    expect(codes).toHaveLength(2);
    expect(codes.filter((c) => c.consumedAt === null)).toHaveLength(1);

    if (newCode !== oldCode) {
      await expect(service.verifyEmail(user.id, oldCode)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    await service.verifyEmail(user.id, newCode);
  });

  it("reports slug availability", async () => {
    expect(await service.slugAvailable("dashboard")).toEqual({
      available: false,
      reason: "reserved",
    });
    expect(await service.slugAvailable("A!")).toEqual({ available: false, reason: "invalid" });
    const input = newInput();
    expect(await service.slugAvailable(input.slug)).toEqual({ available: true });
    await service.signup(input, meta);
    expect(await service.slugAvailable(input.slug)).toEqual({ available: false, reason: "taken" });
  });
  it("resendCode does not fail after the old code is consumed if the queue is down", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    await db
      .update(emailCodes)
      .set({ createdAt: new Date(Date.now() - 120_000) })
      .where(eq(emailCodes.userId, user.id));
    await redis.del(`resend-code:${user.id}`);
    failNextSend = true;
    await expect(service.resendCode(user.id, "verify_email")).resolves.toBeUndefined();
    expect(failNextSend).toBe(false);
  });

  // ---- Login ----

  it("logs in with an uppercase email and resets the failure counter", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    await db.update(users).set({ failedLoginCount: 3 }).where(eq(users.id, user.id));

    const result = await service.login(
      ` ${input.email.toUpperCase()} `,
      input.password,
      freshMeta(),
    );
    expect(result.sessionToken).toHaveLength(43);
    expect(result.user.id).toBe(user.id);
    expect(result.user.seller?.slug).toBe(input.slug);

    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.failedLoginCount).toBe(0);
    const me = await service.me(result.sessionToken);
    expect(me.id).toBe(user.id);
  });

  it("gives a wrong password and an unknown email the same 401", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    const wrong = await service
      .login(input.email, "not the password", freshMeta())
      .catch((e: unknown) => e);
    const unknown = await service
      .login(`nobody-${randomUUID()}@example.com`, "whatever", freshMeta())
      .catch((e: unknown) => e);
    expect(wrong).toBeInstanceOf(UnauthorizedException);
    expect(unknown).toBeInstanceOf(UnauthorizedException);
    expect((wrong as UnauthorizedException).getResponse()).toEqual(
      (unknown as UnauthorizedException).getResponse(),
    );
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.failedLoginCount).toBe(1);
  });

  it("locks the account after 5 wrong passwords, even for the right one, then unlocks", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    for (let i = 0; i < 5; i++) {
      await expect(
        service.login(input.email, "wrong password", freshMeta()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(service.login(input.email, input.password, freshMeta())).rejects.toBeInstanceOf(
      TooManyRequestsError,
    );
    const [locked] = await db.select().from(users).where(eq(users.id, user.id));
    let lockedUntilMs = 0;
    if (locked && locked.lockedUntil) {
      lockedUntilMs = locked.lockedUntil.getTime();
    }
    const lockedFor = lockedUntilMs - Date.now();
    expect(lockedFor).toBeGreaterThan(14 * 60 * 1000);
    expect(lockedFor).toBeLessThanOrEqual(15 * 60 * 1000);

    // A wrong guess while locked is also a 429 and is not counted.
    await expect(service.login(input.email, "wrong password", freshMeta())).rejects.toBeInstanceOf(
      TooManyRequestsError,
    );
    const [stillLocked] = await db.select().from(users).where(eq(users.id, user.id));
    expect(stillLocked?.failedLoginCount).toBe(5);

    // Pretend 15 minutes have passed.
    await db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(users.id, user.id));
    const result = await service.login(input.email, input.password, freshMeta());
    expect(result.user.id).toBe(user.id);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.failedLoginCount).toBe(0);
    expect(row?.lockedUntil).toBeNull();
  });

  it("after a lock expires, one wrong guess starts a fresh count instead of re-locking", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    for (let i = 0; i < 5; i++) {
      await expect(
        service.login(input.email, "wrong password", freshMeta()),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await db
      .update(users)
      .set({ lockedUntil: new Date(Date.now() - 1000) })
      .where(eq(users.id, user.id));

    await expect(service.login(input.email, "wrong password", freshMeta())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.failedLoginCount).toBe(1);
    expect(row?.lockedUntil).toBeNull();
    // Not locked: the right password still works.
    const result = await service.login(input.email, input.password, freshMeta());
    expect(result.user.id).toBe(user.id);
  });

  it("counts concurrent wrong passwords atomically", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    const attempts = [];
    for (let i = 0; i < 5; i++) {
      attempts.push(service.login(input.email, "wrong password", freshMeta()));
    }
    await Promise.allSettled(attempts);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.failedLoginCount).toBe(5);
    expect(row?.lockedUntil).not.toBeNull();
  });

  it("rate-limits login per IP before checking the password", async () => {
    const input = newInput();
    await service.signup(input, meta);
    const ipMeta = freshMeta();
    await redis.set(`login-ip:${ipMeta.ip}`, "20", "EX", 600);
    await expect(service.login(input.email, input.password, ipMeta)).rejects.toBeInstanceOf(
      TooManyRequestsError,
    );
  });

  // ---- Sessions ----

  it("logout ends the session, and me() rejects unknown and expired tokens", async () => {
    const input = newInput();
    const signedUp = await service.signup(input, meta);
    const loggedIn = await service.login(input.email, input.password, freshMeta());

    await service.logout(loggedIn.sessionToken);
    await expect(service.me(loggedIn.sessionToken)).rejects.toBeInstanceOf(UnauthorizedException);
    // Logging out one device leaves the others signed in.
    expect((await service.me(signedUp.sessionToken)).id).toBe(signedUp.user.id);

    await db
      .update(sessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(sessions.tokenHash, hashToken(signedUp.sessionToken)));
    await expect(service.me(signedUp.sessionToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.me("not-a-token")).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // ---- Forgot / reset password ----

  const REQUEST_ID = /^[A-Za-z0-9_-]{43}$/;

  it("forgotPassword for an unknown email returns a requestId and queues nothing", async () => {
    const email = `nobody-${randomUUID()}@example.com`;
    const before = sent.length;
    const result = await service.forgotPassword(email, freshMeta());
    expect(Object.keys(result)).toEqual(["requestId"]);
    expect(result.requestId).toMatch(REQUEST_ID);
    expect(sent.length).toBe(before);
  });

  it("forgotPassword answers known and unknown emails with the same shape", async () => {
    const input = newInput();
    await service.signup(input, meta);
    const known = await service.forgotPassword(input.email, freshMeta());
    const unknown = await service.forgotPassword(`nobody-${randomUUID()}@example.com`, freshMeta());
    expect(Object.keys(known)).toEqual(Object.keys(unknown));
    expect(known.requestId).toMatch(REQUEST_ID);
    expect(unknown.requestId).toMatch(REQUEST_ID);
    // Only a hash of the requestId is stored.
    const [row] = await db
      .select()
      .from(emailCodes)
      .where(eq(emailCodes.requestTokenHash, hashToken(known.requestId)));
    expect(row?.purpose).toBe("reset_password");
  });

  it("forgotPassword queues a reset code and is limited per email, account or not", async () => {
    const input = newInput();
    await service.signup(input, meta);
    await service.forgotPassword(input.email.toUpperCase(), freshMeta());
    expect(lastCodeFor(input.email, "reset_password")).toMatch(/^\d{6}$/);
    const entry = sent.find((s) => s.job.kind === "reset_password" && s.job.to === input.email);
    expect(entry?.jobId).toMatch(/^code-/);

    // A second request straight away is refused the same way for both kinds of email.
    await expect(service.forgotPassword(input.email, freshMeta())).rejects.toBeInstanceOf(
      TooManyRequestsError,
    );
    const nobody = `nobody-${randomUUID()}@example.com`;
    await service.forgotPassword(nobody, freshMeta());
    await expect(service.forgotPassword(nobody, freshMeta())).rejects.toBeInstanceOf(
      TooManyRequestsError,
    );
  });

  it("forgotPassword caps each email at 10 requests a day, account or not", async () => {
    const input = newInput();
    await service.signup(input, meta);
    const nobody = `nobody-${randomUUID()}@example.com`;
    for (const email of [input.email, nobody]) {
      // Pretend 10 requests were already made today (spread out, so no short-term limit).
      await redis.set(`forgot-email-day:${hashToken(email)}`, "10", "EX", 86_400);
      await expect(service.forgotPassword(email, freshMeta())).rejects.toBeInstanceOf(
        TooManyRequestsError,
      );
    }
  });

  it("forgotPassword resolves even if the queue is down", async () => {
    const input = newInput();
    await service.signup(input, meta);
    const before = sentTo(input.email);
    failNextSend = true;
    const result = await service.forgotPassword(input.email, freshMeta());
    expect(result.requestId).toMatch(REQUEST_ID);
    expect(failNextSend).toBe(false);
    expect(sentTo(input.email)).toBe(before);
  });

  it("resetPassword revokes every session and returns a working new one", async () => {
    const input = newInput();
    const signedUp = await service.signup(input, meta);
    const otherDevice = await service.login(input.email, input.password, freshMeta());
    const { requestId } = await service.forgotPassword(input.email, freshMeta());
    const code = lastCodeFor(input.email, "reset_password");

    const result = await service.resetPassword(
      input.email,
      requestId,
      code,
      "a brand new password",
      freshMeta(),
    );
    expect(result.user.id).toBe(signedUp.user.id);
    await expect(service.me(signedUp.sessionToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.me(otherDevice.sessionToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect((await service.me(result.sessionToken)).id).toBe(signedUp.user.id);

    await expect(service.login(input.email, input.password, freshMeta())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const again = await service.login(input.email, "a brand new password", freshMeta());
    expect(again.user.id).toBe(signedUp.user.id);

    // The code is single-use.
    await expect(
      service.resetPassword(input.email, requestId, code, "another new password", freshMeta()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("a successful resetPassword also uses up the user's other live reset codes", async () => {
    const input = newInput();
    await service.signup(input, meta);
    // Two reset requests, e.g. from a laptop and then a phone.
    const first = await service.forgotPassword(input.email, freshMeta());
    const firstCode = lastCodeFor(input.email, "reset_password");
    await redis.del(`forgot-email:${hashToken(input.email)}`);
    const second = await service.forgotPassword(input.email, freshMeta());
    const secondCode = lastCodeFor(input.email, "reset_password");

    await service.resetPassword(
      input.email,
      second.requestId,
      secondCode,
      "a brand new password",
      freshMeta(),
    );

    // The first code was never used, but the password has now changed: it must be dead.
    await expect(
      service.resetPassword(
        input.email,
        first.requestId,
        firstCode,
        "an attacker's password",
        freshMeta(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
    const again = await service.login(input.email, "a brand new password", freshMeta());
    expect(again.user.email).toBe(input.email);
  });

  it("resetPassword clears a lockout and marks the email verified", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    await db
      .update(users)
      .set({ failedLoginCount: 5, lockedUntil: new Date(Date.now() + 10 * 60 * 1000) })
      .where(eq(users.id, user.id));
    const { requestId } = await service.forgotPassword(input.email, freshMeta());
    const result = await service.resetPassword(
      input.email,
      requestId,
      lastCodeFor(input.email, "reset_password"),
      "a brand new password",
      freshMeta(),
    );
    expect(result.user.emailVerified).toBe(true);
    const [row] = await db.select().from(users).where(eq(users.id, user.id));
    expect(row?.failedLoginCount).toBe(0);
    expect(row?.lockedUntil).toBeNull();
  });

  it("resetPassword rejects wrong, expired, wrong-purpose codes and unknown emails alike", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    const verifyCode = lastCodeFor(input.email, "verify_email");
    const { requestId } = await service.forgotPassword(input.email, freshMeta());
    const right = lastCodeFor(input.email, "reset_password");
    const wrong = right === "000000" ? "000001" : "000000";

    // A verify_email code is not a reset code.
    if (verifyCode !== right) {
      const purposeError = await service
        .resetPassword(input.email, requestId, verifyCode, "a brand new password", freshMeta())
        .catch((e: unknown) => e);
      expect(purposeError).toBeInstanceOf(BadRequestException);
    }

    const wrongError = await service
      .resetPassword(input.email, requestId, wrong, "a brand new password", freshMeta())
      .catch((e: unknown) => e);
    expect(wrongError).toBeInstanceOf(BadRequestException);

    const unknownError = await service
      .resetPassword(
        `nobody-${randomUUID()}@example.com`,
        requestId,
        right,
        "a brand new password",
        freshMeta(),
      )
      .catch((e: unknown) => e);
    expect(unknownError).toBeInstanceOf(BadRequestException);
    expect((unknownError as BadRequestException).getResponse()).toEqual(
      (wrongError as BadRequestException).getResponse(),
    );

    await db
      .update(emailCodes)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(and(eq(emailCodes.userId, user.id), eq(emailCodes.purpose, "reset_password")));
    await expect(
      service.resetPassword(input.email, requestId, right, "a brand new password", freshMeta()),
    ).rejects.toBeInstanceOf(BadRequestException);

    // The password never changed.
    const result = await service.login(input.email, input.password, freshMeta());
    expect(result.user.id).toBe(user.id);
  });

  it("kills a reset code after 5 wrong attempts", async () => {
    const input = newInput();
    await service.signup(input, meta);
    const { requestId } = await service.forgotPassword(input.email, freshMeta());
    const right = lastCodeFor(input.email, "reset_password");
    const wrong = right === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      await expect(
        service.resetPassword(input.email, requestId, wrong, "a brand new password", freshMeta()),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      service.resetPassword(input.email, requestId, right, "a brand new password", freshMeta()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("someone with only the email cannot use or burn the victim's reset code", async () => {
    const input = newInput();
    await service.signup(input, meta);
    // The victim asks for a reset in their browser.
    const victim = await service.forgotPassword(input.email, freshMeta());
    const victimCode = lastCodeFor(input.email, "reset_password");
    const wrong = victimCode === "000000" ? "000001" : "000000";

    // An attacker knows the email. With no requestId of the victim's, guesses go nowhere...
    const randomRequestId = randomUUID() + randomUUID();
    for (let i = 0; i < 6; i++) {
      await expect(
        service.resetPassword(
          input.email,
          randomRequestId,
          wrong,
          "attacker password",
          freshMeta(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    // ...and the victim's right code is useless without the victim's requestId.
    await expect(
      service.resetPassword(
        input.email,
        randomRequestId,
        victimCode,
        "attacker password",
        freshMeta(),
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    // The attacker starts their own reset request (once the 60-second cooldown has passed).
    await redis.del(`forgot-email:${hashToken(input.email)}`);
    const attacker = await service.forgotPassword(input.email, freshMeta());
    expect(attacker.requestId).not.toBe(victim.requestId);
    // Burning the attacker's own code with 5 wrong guesses...
    for (let i = 0; i < 5; i++) {
      await expect(
        service.resetPassword(
          input.email,
          attacker.requestId,
          wrong,
          "attacker password",
          freshMeta(),
        ),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    // ...does not touch the victim's: the new request did not invalidate it, and the
    // wrong guesses were counted against the attacker's code only.
    const result = await service.resetPassword(
      input.email,
      victim.requestId,
      victimCode,
      "the victim's new password",
      freshMeta(),
    );
    expect(result.user.email).toBe(input.email);
  });

  // ---- Settings: change password, close account ----

  it("changePassword keeps this device signed in and signs out the others", async () => {
    const input = newInput();
    const thisDevice = await service.signup(input, meta);
    const otherDevice = await service.login(input.email, input.password, freshMeta());

    await service.changePassword(
      thisDevice.user.id,
      thisDevice.sessionToken,
      input.password,
      "a brand new password",
    );

    expect((await service.me(thisDevice.sessionToken)).id).toBe(thisDevice.user.id);
    await expect(service.me(otherDevice.sessionToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.login(input.email, input.password, freshMeta())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    const again = await service.login(input.email, "a brand new password", freshMeta());
    expect(again.user.id).toBe(thisDevice.user.id);
  });

  it("changePassword refuses a wrong current password and changes nothing", async () => {
    const input = newInput();
    const signedUp = await service.signup(input, meta);
    const otherDevice = await service.login(input.email, input.password, freshMeta());

    const error = await service
      .changePassword(signedUp.user.id, signedUp.sessionToken, "not my password", "whatever123")
      .catch((e: unknown) => e);

    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toMatchObject({
      field: "currentPassword",
    });
    expect((await service.me(otherDevice.sessionToken)).id).toBe(signedUp.user.id);
    const again = await service.login(input.email, input.password, freshMeta());
    expect(again.user.id).toBe(signedUp.user.id);
  });

  it("closeAccount hides the shop, signs out everywhere, emails the privacy inbox, blocks login", async () => {
    const input = newInput({ businessName: "Ada Bakes" });
    const signedUp = await service.signup(input, meta);
    const otherDevice = await service.login(input.email, input.password, freshMeta());

    // The name is matched without caring about capitals or spaces around it.
    await service.closeAccount(signedUp.user.id, "  ada bakes ", input.password);

    const [seller] = await db
      .select()
      .from(sellers)
      .where(eq(sellers.ownerUserId, signedUp.user.id));
    expect(seller?.closedAt).toBeInstanceOf(Date);
    await expect(service.me(signedUp.sessionToken)).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.me(otherDevice.sessionToken)).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    let request: EmailJob | undefined = undefined;
    for (const entry of sent) {
      if (entry.job.kind === "account_closed" && entry.job.ownerEmail === input.email) {
        request = entry.job;
      }
    }
    expect(request).toMatchObject({ shopName: "Ada Bakes", slug: input.slug });

    const loginError = await service
      .login(input.email, input.password, freshMeta())
      .catch((e: unknown) => e);
    expect(loginError).toBeInstanceOf(ForbiddenException);
  });

  it("closeAccount needs the right shop name and password, else nothing happens", async () => {
    const input = newInput({ businessName: "Ada Bakes" });
    const signedUp = await service.signup(input, meta);

    const wrongName = await service
      .closeAccount(signedUp.user.id, "Someone Else", input.password)
      .catch((e: unknown) => e);
    expect(wrongName).toBeInstanceOf(BadRequestException);
    expect((wrongName as BadRequestException).getResponse()).toMatchObject({
      field: "businessName",
    });

    const wrongPassword = await service
      .closeAccount(signedUp.user.id, "Ada Bakes", "not my password")
      .catch((e: unknown) => e);
    expect(wrongPassword).toBeInstanceOf(BadRequestException);
    expect((wrongPassword as BadRequestException).getResponse()).toMatchObject({
      field: "password",
    });

    const [seller] = await db
      .select()
      .from(sellers)
      .where(eq(sellers.ownerUserId, signedUp.user.id));
    expect(seller?.closedAt).toBeNull();
    expect((await service.me(signedUp.sessionToken)).id).toBe(signedUp.user.id);
  });
});
