import { emailCodes, sellers, sessions, users, type DbTransaction } from "@gbam/db";
import { RESERVED_SLUGS, slugSchema, type SignupInput } from "@gbam/shared";
import { BadRequestException, ConflictException, Injectable, Logger } from "@nestjs/common";
import { and, desc, eq, gt, isNull, lt, sql } from "drizzle-orm";
import { timingSafeEqual } from "node:crypto";
import { isUniqueViolation } from "../common/db-errors.js";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { EmailQueue } from "../email/email.queue.js";
import { InjectDb, type Db } from "../infra/infra.module.js";
import { hashPassword, hashToken, newEmailCode, newSessionToken } from "./crypto.js";

const SESSION_DAYS = 30;
const CODE_MINUTES = 15;
const MAX_CODE_ATTEMPTS = 5;
const RESEND_COOLDOWN_SECONDS = 60;
const RESEND_PER_HOUR = 10;

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

function badCode(): BadRequestException {
  // One message for wrong, expired and used-up codes, so a guesser learns nothing extra.
  return new BadRequestException({
    field: "code",
    message: "That code is wrong or has expired",
  });
}

/** Account creation and email verification. Never log passwords, tokens or codes here. */
@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectDb() private readonly db: Db,
    private readonly emails: EmailQueue,
    private readonly limiter: RateLimiter,
  ) {}

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
    const sessionExpiry = new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);

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
          expiresAt: sessionExpiry,
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

  /**
   * Checks a 6-digit code. The attempt counter is bumped in the same statement that
   * checks it is below the limit, BEFORE we look at whether the guess was right, so
   * parallel guesses cannot get more than 5 tries in total.
   */
  async verifyEmail(userId: string, code: string): Promise<void> {
    const now = new Date();
    const [latest] = await this.db
      .select()
      .from(emailCodes)
      .where(
        and(
          eq(emailCodes.userId, userId),
          eq(emailCodes.purpose, "verify_email"),
          isNull(emailCodes.consumedAt),
          gt(emailCodes.expiresAt, now),
        ),
      )
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

    await this.db.transaction(async (tx) => {
      // "consumed_at is null" makes this a one-shot: a parallel request with the same
      // right code finds nothing to consume and fails.
      const consumed = await tx
        .update(emailCodes)
        .set({ consumedAt: now })
        .where(and(eq(emailCodes.id, bumped.id), isNull(emailCodes.consumedAt)))
        .returning({ id: emailCodes.id });
      if (consumed.length === 0) {
        throw badCode();
      }
      await tx.update(users).set({ emailVerifiedAt: now }).where(eq(users.id, userId));
    });
  }

  async resendCode(userId: string, purpose: CodePurpose): Promise<void> {
    const [user] = await this.db.select().from(users).where(eq(users.id, userId));
    if (!user) {
      throw new BadRequestException({ field: "code", message: "Account not found" });
    }
    if (purpose === "verify_email" && user.emailVerifiedAt !== null) {
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
    const cooldown = await this.limiter.hit(`resend-code:${userId}`, 1, RESEND_COOLDOWN_SECONDS);
    if (!cooldown.allowed) {
      throw new TooManyRequestsError(cooldown.retryAfterSeconds);
    }
    const hourly = await this.limiter.hit(`resend-code-hour:${userId}`, RESEND_PER_HOUR, 3600);
    if (!hourly.allowed) {
      throw new TooManyRequestsError(hourly.retryAfterSeconds);
    }

    const code = newEmailCode();
    const codeId = await this.db.transaction(async (tx) => {
      // Invalidate older codes by marking them consumed, so only the new one works.
      await tx
        .update(emailCodes)
        .set({ consumedAt: new Date() })
        .where(
          and(
            eq(emailCodes.userId, userId),
            eq(emailCodes.purpose, purpose),
            isNull(emailCodes.consumedAt),
          ),
        );
      return this.insertCode(tx, userId, purpose, code);
    });
    if (purpose === "verify_email") {
      await this.emails.send(`code-${codeId}`, { kind: "verify_email", to: user.email, code });
    } else {
      await this.emails.send(`code-${codeId}`, { kind: "reset_password", to: user.email, code });
    }
  }

  /** Temporary session lookup for the controller; Task 12 replaces it with a guard. */
  async userFromToken(token: string): Promise<PublicUser | null> {
    const rows = await this.db
      .select({ user: users, seller: sellers })
      .from(sessions)
      .innerJoin(users, eq(users.id, sessions.userId))
      .leftJoin(sellers, eq(sellers.ownerUserId, users.id))
      .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
      .limit(1);
    const row = rows[0];
    if (!row) {
      return null;
    }
    return toPublicUser(row.user, row.seller);
  }

  private async insertCode(
    tx: DbTransaction,
    userId: string,
    purpose: CodePurpose,
    code: string,
  ): Promise<string> {
    const [row] = await tx
      .insert(emailCodes)
      .values({
        userId,
        purpose,
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
