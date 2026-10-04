/** Integration test against the dev Postgres and Redis db 1. The email queue is a recorder. */
import "reflect-metadata";
import { emailCodes, sellers, sessions, users } from "@gbam/db";
import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
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
      if (entry.job.kind !== "contact_message" && entry.job.to === email) {
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

  it("forgotPassword for an unknown email resolves and queues nothing", async () => {
    const email = `nobody-${randomUUID()}@example.com`;
    const before = sent.length;
    await expect(service.forgotPassword(email, freshMeta())).resolves.toBeUndefined();
    expect(sent.length).toBe(before);
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

  it("forgotPassword resolves even if the queue is down", async () => {
    const input = newInput();
    await service.signup(input, meta);
    const before = sentTo(input.email);
    failNextSend = true;
    await expect(service.forgotPassword(input.email, freshMeta())).resolves.toBeUndefined();
    expect(failNextSend).toBe(false);
    expect(sentTo(input.email)).toBe(before);
  });

  it("resetPassword revokes every session and returns a working new one", async () => {
    const input = newInput();
    const signedUp = await service.signup(input, meta);
    const otherDevice = await service.login(input.email, input.password, freshMeta());
    await service.forgotPassword(input.email, freshMeta());
    const code = lastCodeFor(input.email, "reset_password");

    const result = await service.resetPassword(
      input.email,
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
      service.resetPassword(input.email, code, "another new password", freshMeta()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("resetPassword clears a lockout and marks the email verified", async () => {
    const input = newInput();
    const { user } = await service.signup(input, meta);
    await db
      .update(users)
      .set({ failedLoginCount: 5, lockedUntil: new Date(Date.now() + 10 * 60 * 1000) })
      .where(eq(users.id, user.id));
    await service.forgotPassword(input.email, freshMeta());
    const result = await service.resetPassword(
      input.email,
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

    // A verify_email code is not a reset code.
    const purposeError = await service
      .resetPassword(input.email, verifyCode, "a brand new password", freshMeta())
      .catch((e: unknown) => e);
    expect(purposeError).toBeInstanceOf(BadRequestException);

    await service.forgotPassword(input.email, freshMeta());
    const right = lastCodeFor(input.email, "reset_password");
    const wrong = right === "000000" ? "000001" : "000000";
    const wrongError = await service
      .resetPassword(input.email, wrong, "a brand new password", freshMeta())
      .catch((e: unknown) => e);
    expect(wrongError).toBeInstanceOf(BadRequestException);

    const unknownError = await service
      .resetPassword(
        `nobody-${randomUUID()}@example.com`,
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
      service.resetPassword(input.email, right, "a brand new password", freshMeta()),
    ).rejects.toBeInstanceOf(BadRequestException);

    // The password never changed.
    const result = await service.login(input.email, input.password, freshMeta());
    expect(result.user.id).toBe(user.id);
  });

  it("kills a reset code after 5 wrong attempts", async () => {
    const input = newInput();
    await service.signup(input, meta);
    await service.forgotPassword(input.email, freshMeta());
    const right = lastCodeFor(input.email, "reset_password");
    const wrong = right === "000000" ? "000001" : "000000";
    for (let i = 0; i < 5; i++) {
      await expect(
        service.resetPassword(input.email, wrong, "a brand new password", freshMeta()),
      ).rejects.toBeInstanceOf(BadRequestException);
    }
    await expect(
      service.resetPassword(input.email, right, "a brand new password", freshMeta()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });
});
