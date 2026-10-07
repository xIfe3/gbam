import { emailCodes, sellers, sessions, users, type DbTransaction } from "@gbam/db";
import { RESERVED_SLUGS, slugSchema, type SignupInput } from "@gbam/shared";
import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  UnauthorizedException,
  type OnModuleInit,
} from "@nestjs/common";
import { and, desc, eq, gt, isNull, lt, lte, ne, or, sql } from "drizzle-orm";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { isUniqueViolation } from "../common/db-errors.js";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { EmailQueue } from "../email/email.queue.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import {
  hashPassword,
  hashToken,
  newEmailCode,
  newSessionToken,
  verifyPassword,
} from "./crypto.js";

const SESSION_DAYS = 30;
const CODE_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_PER_HOUR = 10;
const MAX_LOGIN_FAILURES = 5;
const LOCK_MINUTES = 15;
const LOGIN_PER_IP = 20;
const LOGIN_IP_WINDOW_SECONDS = 10 * 60;
const FORGOT_PER_IP_HOUR = 20;
const FORGOT_PER_EMAIL_HOUR = 5;
const FORGOT_PER_EMAIL_DAY = 10;
const RESET_PER_IP = 20;
const RESET_IP_WINDOW_SECONDS = 10 * 60;
const SLIDE_EVERY_MS = 24 * 60 * 60 * 1000;
const SETTINGS_PASSWORD_TRIES_PER_HOUR = 10;

export type PublicUser = {
  id: string;
  email: string;
  emailVerified: boolean;
  role: "seller" | "admin";
  seller: { id: string; slug: string; businessName: string; hasPayoutAccount: boolean } | null;
};

export type SessionMeta = { ip: string; userAgent: string | null };
export type CodePurpose = "verify_email" | "reset_password";

type UserRow = typeof users.$inferSelect;
type SellerRow = typeof sellers.$inferSelect;

function toPublicUser(user: UserRow, seller: SellerRow | null | undefined): PublicUser {
  let sellerInfo: PublicUser["seller"] = null;
  if (seller) {
    sellerInfo = {
      id: seller.id,
      slug: seller.slug,
      businessName: seller.businessName,
      hasPayoutAccount: seller.paystackSubaccountCode !== null,
    };
  }
  return {
    id: user.id,
    email: user.email,
    emailVerified: user.emailVerifiedAt !== null,
    role: user.role,
    seller: sellerInfo,
  };
}

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sessionExpiry(from: Date): Date {
  return new Date(from.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

function secondsUntil(when: Date, now: Date): number {
  return Math.max(1, Math.ceil((when.getTime() - now.getTime()) / 1000));
}

function invalidLogin(): UnauthorizedException {
  // One message for "no such account" and "wrong password", so it reveals neither.
  return new UnauthorizedException({
    statusCode: 401,
    message: "That email and password don't match",
  });
}

// A real Argon2id hash of a random string nobody knows, made once. Login checks the
// password against it when the email has no account, so that path is as slow as a real one.
let dummyHash: string | null = null;
async function dummyPasswordHash(): Promise<string> {
  if (dummyHash === null) {
    dummyHash = await hashPassword(randomBytes(32).toString("hex"));
  }
  return dummyHash;
}

function badCode(): BadRequestException {
  // One message for wrong, expired and used-up codes, so a guesser learns nothing extra.
  return new BadRequestException({
    field: "code",
    message: "That code is wrong or has expired",
  });
}

/** The owner deleted this account (Settings → Delete my account). */
function accountClosed(): ForbiddenException {
  return new ForbiddenException({
    code: "ACCOUNT_CLOSED",
    message: "This account was deleted. To reopen it, email support@gbam.app.",
  });
}

/** Accounts, sessions and codes. Never log passwords, tokens or codes here. */
@Injectable()
export class AuthService implements OnModuleInit {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly emails: EmailQueue,
    private readonly limiter: RateLimiter,
  ) {}

  /** Nest calls this at startup: make the dummy hash now, not during the first login. */
  async onModuleInit(): Promise<void> {
    await dummyPasswordHash();
  }

  async signup(
    input: SignupInput,
    meta: SessionMeta,
  ): Promise<{ sessionToken: string; user: PublicUser }> {
    // Defence in depth: the API's own schema already trims and lowercases, but this is the
    // one place that decides what gets stored, and the email column must be lowercase.
    const email = input.email.trim().toLowerCase();
    // Hash before the transaction: it is slow on purpose and must not hold a DB connection.
    const passwordHash = await hashPassword(input.password);
    const sessionToken = newSessionToken();
    const code = newEmailCode();
    const now = new Date();

    try {
      const created = await this.db.transaction(async (tx) => {
        const [user] = await tx
          .insert(users)
          .values({ email, passwordHash, role: "seller" })
          .returning();
        if (!user) {
          throw new Error("Expected the database to return the new user");
        }
        const [seller] = await tx
          .insert(sellers)
          .values({
            ownerUserId: user.id,
            slug: input.slug,
            businessName: input.businessName,
            whatsappPhone: input.phone,
          })
          .returning();
        if (!seller) {
          throw new Error("Expected the database to return the new seller");
        }
        await tx.insert(sessions).values({
          userId: user.id,
          tokenHash: hashToken(sessionToken),
          expiresAt: sessionExpiry(now),
          lastUsedAt: now,
          userAgent: meta.userAgent,
          ip: meta.ip,
        });
        const codeId = await this.insertCode(tx, user.id, "verify_email", code);
        return { user, seller, codeId };
      });

      // After the commit: if the queue is down the account still exists and the seller can
      // press "resend", so a queue failure must not turn a successful signup into an error.
      try {
        await this.emails.send(`code-${created.codeId}`, { kind: "verify_email", to: email, code });
      } catch (error) {
        this.logger.error("Could not queue the verification email", error);
      }

      return { sessionToken, user: toPublicUser(created.user, created.seller) };
    } catch (error) {
      // Two people (or one double-click) racing for the same value: the database's unique
      // constraints are the real guard, so we translate their errors into a field message.
      if (isUniqueViolation(error, "users_email_unique")) {
        throw new ConflictException({
          field: "email",
          message: "An account with this email already exists",
        });
      }
      if (isUniqueViolation(error, "sellers_slug_unique")) {
        throw new ConflictException({ field: "slug", message: "That store link is taken" });
      }
      if (isUniqueViolation(error, "sellers_whatsapp_phone_unique")) {
        throw new ConflictException({
          field: "phone",
          message: "That phone number is already used by another store",
        });
      }
      throw error;
    }
  }

  async slugAvailable(
    slug: string,
  ): Promise<{ available: boolean; reason?: "taken" | "reserved" | "invalid" }> {
    if (RESERVED_SLUGS.has(slug)) {
      return { available: false, reason: "reserved" };
    }
    if (!slugSchema.safeParse(slug).success) {
      return { available: false, reason: "invalid" };
    }
    const rows = await this.db
      .select({ id: sellers.id })
      .from(sellers)
      .where(eq(sellers.slug, slug));
    if (rows.length > 0) {
      return { available: false, reason: "taken" };
    }
    return { available: true };
  }

  /** Marks the email verified if `code` is the newest live verify_email code. */
  async verifyEmail(userId: string, code: string): Promise<void> {
    const codeId = await this.checkCode(userId, "verify_email", code);
    const now = new Date();
    // A transaction: the code is used up and the email verified together, or neither.
    await this.db.transaction(async (tx) => {
      await this.consumeCode(tx, codeId, now);
      await tx.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, userId));
    });
  }

  /** Verify-email codes only; a new reset code comes from forgotPassword (it needs a requestId). */
  async resendCode(userId: string, purpose: "verify_email"): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new BadRequestException({ field: "code", message: "Account not found" });
    }
    if (user.emailVerifiedAt !== null) {
      return; // nothing to verify
    }

    // Cooldown by the age of the newest code (covers the code made at signup)...
    const [latest] = await this.db
      .select()
      .from(emailCodes)
      .where(and(eq(emailCodes.userId, userId), eq(emailCodes.purpose, purpose)))
      .orderBy(desc(emailCodes.createdAt))
      .limit(1);
    if (latest) {
      const ageSeconds = Math.floor((Date.now() - latest.createdAt.getTime()) / 1000);
      if (ageSeconds < RESEND_COOLDOWN_SECONDS) {
        throw new TooManyRequestsError(RESEND_COOLDOWN_SECONDS - ageSeconds);
      }
    }
    // ...plus atomic Redis counters, so parallel requests cannot all slip past the check
    // above, and so one account cannot be used to flood an inbox all day.
    await this.limit(`resend-code:${userId}`, 1, RESEND_COOLDOWN_SECONDS);
    await this.limit(`resend-code-hour:${userId}`, RESEND_PER_HOUR, 3600);

    await this.issueCode(user, purpose);
  }

  // ---- Login and sessions ----

  /**
   * Email + password login. Wrong passwords are counted on the user row; the 5th in a row
   * locks the account for 15 minutes. While locked, even the right password gets a 429,
   * so the lock tells a guesser nothing about whether a guess was right.
   */
  async login(
    emailInput: string,
    password: string,
    meta: SessionMeta,
  ): Promise<{ sessionToken: string; user: PublicUser }> {
    // Per-IP limit first, so a flood of attempts can't make us do lots of slow hashing.
    await this.limit(`login-ip:${meta.ip}`, LOGIN_PER_IP, LOGIN_IP_WINDOW_SECONDS);

    const email = normaliseEmail(emailInput);
    const [row] = await this.db
      .select({ user: users, seller: sellers })
      .from(users)
      .leftJoin(sellers, eq(sellers.ownerUserId, users.id))
      .where(eq(users.email, email))
      .limit(1);

    if (!row) {
      // No such account. Hash anyway so the response takes as long as for a real account;
      // otherwise the timing would reveal which emails are registered.
      await verifyPassword(await dummyPasswordHash(), password);
      throw invalidLogin();
    }

    const user = row.user;
    // Always hash before looking at the lock, for the same timing reason as above.
    const passwordOk = await verifyPassword(user.passwordHash, password);
    const now = new Date();
    if (user.lockedUntil !== null && user.lockedUntil > now) {
      throw new TooManyRequestsError(secondsUntil(user.lockedUntil, now));
    }

    if (!passwordOk) {
      const lockUntil = new Date(now.getTime() + LOCK_MINUTES * 60 * 1000);
      const nowSql = sql`${now.toISOString()}::timestamptz`;
      // True when an earlier lock has run out: this failure then starts a fresh count at 1
      // (so a single wrong guess after the lock does not lock the account again).
      const lockExpired = sql`(${users.lockedUntil} is not null and ${users.lockedUntil} <= ${nowSql})`;
      // One UPDATE that both counts and (on the 5th failure) locks. Postgres reads the old
      // row values on the right-hand side, and runs updates to one row one at a time, so
      // parallel wrong guesses are all counted.
      await this.db
        .update(users)
        .set({
          failedLoginCount: sql`case when ${lockExpired} then 1 else ${users.failedLoginCount} + 1 end`,
          lockedUntil: sql`case when ${lockExpired} then null when ${users.failedLoginCount} + 1 >= ${MAX_LOGIN_FAILURES} then ${lockUntil.toISOString()}::timestamptz else ${users.lockedUntil} end`,
        })
        .where(eq(users.id, user.id));
      throw invalidLogin();
    }

    // Right password. Reset the counter, but only if no lock appeared while we were hashing
    // (parallel wrong guesses may have just locked the account).
    const unlocked = await this.db
      .update(users)
      .set({ failedLoginCount: 0, lockedUntil: null })
      .where(and(eq(users.id, user.id), or(isNull(users.lockedUntil), lte(users.lockedUntil, now))))
      .returning();
    const fresh = unlocked[0];
    if (!fresh) {
      throw new TooManyRequestsError(LOCK_MINUTES * 60);
    }

    // A shop whose owner deleted the account stays closed. Checked only after the right
    // password, so this answer tells a stranger nothing.
    if (row.seller && row.seller.closedAt !== null) {
      throw accountClosed();
    }

    const sessionToken = await this.createSession(this.db, user.id, meta);
    return { sessionToken, user: toPublicUser(fresh, row.seller) };
  }

  /**
   * The user behind a session token, or null if the token is unknown or expired.
   * Sliding expiry: a session used more than a day after its last recorded use is pushed
   * out to 30 days from now. Doing it at most once a day saves a DB write per request.
   */
  async sessionUser(token: string): Promise<PublicUser | null> {
    const now = new Date();
    const rows = await this.db
      .select({
        user: users,
        seller: sellers,
        sessionId: sessions.id,
        lastUsedAt: sessions.lastUsedAt,
      })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(sellers, eq(sellers.ownerUserId, users.id))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, now)))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    // Closing an account deletes its sessions; this is a second guard in case one survives.
    if (row.seller && row.seller.closedAt !== null) {
      return null;
    }

    const slideBefore = new Date(now.getTime() - SLIDE_EVERY_MS);
    if (row.lastUsedAt === null || row.lastUsedAt < slideBefore) {
      // The same condition in the WHERE means parallel requests write at most once.
      await this.db
        .update(sessions)
        .set({ expiresAt: sessionExpiry(now), lastUsedAt: now })
        .where(
          and(
            eq(sessions.id, row.sessionId),
            or(isNull(sessions.lastUsedAt), lt(sessions.lastUsedAt, slideBefore)),
          ),
        );
    }
    return toPublicUser(row.user, row.seller);
  }

  /** Like sessionUser, but a missing or expired session is a 401. */
  async me(token: string): Promise<PublicUser> {
    const user = await this.sessionUser(token);
    if (!user) {
      throw new UnauthorizedException();
    }
    return user;
  }

  /** Ends this one session (other devices stay signed in). */
  async logout(token: string): Promise<void> {
    await this.db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
  }

  // ---- Forgot / reset password ----

  /**
   * Emails a reset code if the account exists, and returns a `requestId` for the browser
   * that asked. The code only works together with that requestId (we store just its hash
   * on the code row), so someone who knows only the email can neither use nor burn the
   * code the real owner receives.
   *
   * The answer is the same whether the account exists or not: unknown emails get a random
   * requestId that matches nothing. The rate limits run before the lookup for the same
   * reason: they apply equally to every email.
   */
  async forgotPassword(emailInput: string, meta: SessionMeta): Promise<{ requestId: string }> {
    const email = normaliseEmail(emailInput);
    // Hash the email for the Redis key so raw addresses don't sit in Redis.
    const emailKey = hashToken(email);
    await this.limit(`forgot-ip:${meta.ip}`, FORGOT_PER_IP_HOUR, 3600);
    await this.limit(`forgot-email:${emailKey}`, 1, RESEND_COOLDOWN_SECONDS);
    await this.limit(`forgot-email-hour:${emailKey}`, FORGOT_PER_EMAIL_HOUR, 3600);
    // The daily cap bounds code guessing: at most 10 codes x 5 guesses a day per account.
    await this.limit(`forgot-email-day:${emailKey}`, FORGOT_PER_EMAIL_DAY, 24 * 3600);

    // Same kind of random value as a session token (32 bytes, base64url).
    const requestId = newSessionToken();
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    if (user) {
      await this.issueCode(user, "reset_password", hashToken(requestId));
    }
    return { requestId };
  }

  /**
   * Sets a new password using an emailed reset code. Every existing session is deleted
   * (a stolen session stops working), and the caller is signed in with a fresh one.
   * Receiving the code also proves the email address, and clears any login lockout.
   * The user's other unused reset codes stop working too.
   */
  async resetPassword(
    emailInput: string,
    requestId: string,
    code: string,
    newPassword: string,
    meta: SessionMeta,
  ): Promise<{ sessionToken: string; user: PublicUser }> {
    await this.limit(`reset-ip:${meta.ip}`, RESET_PER_IP, RESET_IP_WINDOW_SECONDS);

    const email = normaliseEmail(emailInput);
    const [user] = await this.db.select().from(users).where(eq(users.email, email));
    if (!user) {
      // Same error as a wrong code, so this can't be used to probe for accounts.
      throw badCode();
    }
    // Only the code issued to this requestId is looked at; a wrong or unknown requestId
    // finds nothing and gets the same error as a wrong code.
    const codeId = await this.checkCode(user.id, "reset_password", code, hashToken(requestId));

    // A deleted account stays deleted: a new password must not sign it back in. Checked
    // after the code, so only the email's owner learns the account is closed.
    const closedRows = await this.db
      .select({ closedAt: sellers.closedAt })
      .from(sellers)
      .where(eq(sellers.ownerUserId, user.id));
    const ownShop = closedRows[0];
    if (ownShop && ownShop.closedAt !== null) {
      throw accountClosed();
    }

    // Slow on purpose, so it runs outside the transaction (see signup).
    const passwordHash = await hashPassword(newPassword);
    const now = new Date();
    const result = await this.db.transaction(async (tx) => {
      await this.consumeCode(tx, codeId, now);
      // The password has changed, so every OTHER live reset code for this user (e.g. one
      // requested on another device, or by someone who knows the email) is used up too.
      // Inside the transaction, so this only happens if the reset itself succeeds.
      await tx
        .update(emailCodes)
        .set({ consumedAt: now })
        .where(
          and(
            eq(emailCodes.userId, user.id),
            eq(emailCodes.purpose, "reset_password"),
            isNull(emailCodes.consumedAt),
          ),
        );
      const [updated] = await tx
        .update(users)
        .set({
          passwordHash,
          failedLoginCount: 0,
          lockedUntil: null,
          emailVerifiedAt: sql`coalesce(${users.emailVerifiedAt}, ${now.toISOString()}::timestamptz)`,
        })
        .where(eq(users.id, user.id))
        .returning();
      if (!updated) {
        throw new Error("Expected the database to return the updated user");
      }
      await tx.delete(sessions).where(eq(sessions.userId, user.id));
      const sessionToken = await this.createSession(tx, user.id, meta);
      return { updated, sessionToken };
    });

    const [seller] = await this.db.select().from(sellers).where(eq(sellers.ownerUserId, user.id));
    return { sessionToken: result.sessionToken, user: toPublicUser(result.updated, seller) };
  }

  // ---- Settings ----

  /**
   * Settings → change password. The current password proves it's really the owner (not
   * someone who found an open laptop). Every OTHER device is signed out, in case the old
   * password leaked; the device making the change stays signed in.
   */
  async changePassword(
    userId: string,
    currentSessionToken: string,
    currentPassword: string,
    newPassword: string,
  ): Promise<void> {
    await this.limit(`change-password:${userId}`, SETTINGS_PASSWORD_TRIES_PER_HOUR, 3600);
    await this.checkOwnPassword(userId, currentPassword, "currentPassword");

    // Slow on purpose, so it runs outside the transaction (see signup).
    const passwordHash = await hashPassword(newPassword);
    const now = new Date();
    // A transaction: the new password and the sign-outs happen together, or not at all.
    await this.db.transaction(async (tx) => {
      await tx.update(users).set({ passwordHash }).where(eq(users.id, userId));
      await tx
        .delete(sessions)
        .where(
          and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashToken(currentSessionToken))),
        );
      // Reset codes asked for before the change shouldn't be able to undo it.
      await tx
        .update(emailCodes)
        .set({ consumedAt: now })
        .where(
          and(
            eq(emailCodes.userId, userId),
            eq(emailCodes.purpose, "reset_password"),
            isNull(emailCodes.consumedAt),
          ),
        );
    });
  }

  /**
   * Settings → delete my account. Typing the shop's name makes it hard to do by accident;
   * the password makes sure it's the owner. The shop is hidden at once and every device is
   * signed out. The records are kept for now (orders are business records) and our privacy
   * inbox is emailed to finish the deletion as the privacy policy says.
   */
  async closeAccount(userId: string, typedShopName: string, password: string): Promise<void> {
    await this.limit(`close-account:${userId}`, SETTINGS_PASSWORD_TRIES_PER_HOUR, 3600);

    const [row] = await this.db
      .select({ user: users, seller: sellers })
      .from(users)
      .innerJoin(sellers, eq(sellers.ownerUserId, users.id))
      .where(eq(users.id, userId));
    if (!row) {
      throw new UnauthorizedException();
    }
    const seller = row.seller;

    const typed = typedShopName.trim().toLowerCase();
    const expected = seller.businessName.trim().toLowerCase();
    if (typed !== expected) {
      throw new BadRequestException({
        field: "businessName",
        message: `Type your shop name exactly: ${seller.businessName}`,
      });
    }
    await this.checkOwnPassword(userId, password, "password");

    const now = new Date();
    await this.db.transaction(async (tx) => {
      await tx.update(sellers).set({ closedAt: now }).where(eq(sellers.id, seller.id));
      await tx.delete(sessions).where(eq(sessions.userId, userId));
    });

    // After the commit. If the queue is down the shop is still closed; the log is the backup.
    try {
      await this.emails.send(`account-closed-${seller.id}`, {
        kind: "account_closed",
        sellerId: seller.id,
        shopName: seller.businessName,
        slug: seller.slug,
        ownerEmail: row.user.email,
      });
    } catch (error) {
      this.logger.error(`Could not queue the deletion request for seller ${seller.id}`, error);
    }
  }

  /**
   * For other sensitive settings (e.g. changing the payout bank account): proves the person
   * at the keyboard knows the password, not just that a browser is signed in. Rate-limited
   * so it can't be used to guess the password.
   */
  async confirmPassword(userId: string, password: string, field: string): Promise<void> {
    await this.limit(`confirm-password:${userId}`, SETTINGS_PASSWORD_TRIES_PER_HOUR, 3600);
    await this.checkOwnPassword(userId, password, field);
  }

  /** A field error (not a 401: they ARE signed in) when the password is wrong. */
  private async checkOwnPassword(userId: string, password: string, field: string): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new UnauthorizedException();
    }
    const passwordOk = await verifyPassword(user.passwordHash, password);
    if (!passwordOk) {
      throw new BadRequestException({ field, message: "That password isn't right" });
    }
  }

  // ---- Helpers ----

  private async limit(key: string, max: number, windowSeconds: number): Promise<void> {
    const result = await this.limiter.hit(key, max, windowSeconds);
    if (!result.allowed) {
      throw new TooManyRequestsError(result.retryAfterSeconds);
    }
  }

  private async createSession(
    db: Db | DbTransaction,
    userId: string,
    meta: SessionMeta,
  ): Promise<string> {
    const sessionToken = newSessionToken();
    const now = new Date();
    await db.insert(sessions).values({
      userId,
      tokenHash: hashToken(sessionToken),
      expiresAt: sessionExpiry(now),
      lastUsedAt: now,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    return sessionToken;
  }

  /**
   * Checks a 6-digit code and returns its id (the caller then consumes it inside its own
   * transaction). The attempt counter is bumped in the same statement that checks it is
   * below the limit, BEFORE we look at whether the guess was right, so parallel guesses
   * cannot get more than 5 tries in total.
   */
  private async checkCode(
    userId: string,
    purpose: CodePurpose,
    code: string,
    requestTokenHash: string | null = null,
  ): Promise<string> {
    const now = new Date();
    const conditions = [
      eq(emailCodes.userId, userId),
      eq(emailCodes.purpose, purpose),
      isNull(emailCodes.consumedAt),
      gt(emailCodes.expiresAt, now),
    ];
    if (requestTokenHash !== null) {
      conditions.push(eq(emailCodes.requestTokenHash, requestTokenHash));
    }
    const [latest] = await this.db
      .select()
      .from(emailCodes)
      .where(and(...conditions))
      .orderBy(desc(emailCodes.createdAt))
      .limit(1);
    if (!latest) {
      throw badCode();
    }

    const [bumped] = await this.db
      .update(emailCodes)
      .set({ attempts: sql`${emailCodes.attempts} + 1` })
      .where(
        and(
          eq(emailCodes.id, latest.id),
          isNull(emailCodes.consumedAt),
          gt(emailCodes.expiresAt, now),
          lt(emailCodes.attempts, MAX_CODE_ATTEMPTS),
        ),
      )
      .returning();
    if (!bumped) {
      throw badCode();
    }

    const given = Buffer.from(hashToken(code));
    const stored = Buffer.from(bumped.codeHash);
    if (given.length !== stored.length || !timingSafeEqual(given, stored)) {
      throw badCode();
    }
    return bumped.id;
  }

  /**
   * Marks a code used. "consumed_at is null" makes this a one-shot: a parallel request
   * with the same right code finds nothing to consume and fails.
   */
  private async consumeCode(tx: DbTransaction, codeId: string, now: Date): Promise<void> {
    const consumed = await tx
      .update(emailCodes)
      .set({ consumedAt: now })
      .where(and(eq(emailCodes.id, codeId), isNull(emailCodes.consumedAt)))
      .returning({ id: emailCodes.id });
    if (consumed.length === 0) {
      throw badCode();
    }
  }

  /**
   * Creates a new code and queues the email.
   * - verify_email: older live codes are invalidated, so only the newest works.
   * - reset_password: older codes stay valid, because each is tied to the browser that
   *   asked for it (requestTokenHash). Otherwise anyone knowing the email could cancel the
   *   owner's code just by asking for another one.
   * A queue failure is logged (never with the code) and swallowed: the user can simply
   * ask again, so failing the request would only confuse them.
   */
  private async issueCode(
    user: UserRow,
    purpose: CodePurpose,
    requestTokenHash: string | null = null,
  ): Promise<void> {
    const code = newEmailCode();
    const codeId = await this.db.transaction(async (tx) => {
      if (purpose === "verify_email") {
        await tx
          .update(emailCodes)
          .set({ consumedAt: new Date() })
          .where(
            and(
              eq(emailCodes.userId, user.id),
              eq(emailCodes.purpose, purpose),
              isNull(emailCodes.consumedAt),
            ),
          );
      }
      return this.insertCode(tx, user.id, purpose, code, requestTokenHash);
    });
    try {
      if (purpose === "verify_email") {
        await this.emails.send(`code-${codeId}`, { kind: "verify_email", to: user.email, code });
      } else {
        await this.emails.send(`code-${codeId}`, { kind: "reset_password", to: user.email, code });
      }
    } catch (error) {
      let reason = "unknown error";
      if (error instanceof Error) {
        reason = error.message;
      }
      this.logger.error(
        `Could not queue the ${purpose} email (email_codes row ${codeId}): ${reason}`,
      );
    }
  }

  private async insertCode(
    tx: DbTransaction,
    userId: string,
    purpose: CodePurpose,
    code: string,
    requestTokenHash: string | null = null,
  ): Promise<string> {
    const [row] = await tx
      .insert(emailCodes)
      .values({
        userId,
        purpose,
        requestTokenHash,
        codeHash: hashToken(code),
        expiresAt: new Date(Date.now() + CODE_MINUTES * 60 * 1000),
      })
      .returning({ id: emailCodes.id });
    if (!row) {
      throw new Error("Expected the database to return the new code");
    }
    return row.id;
  }
}
