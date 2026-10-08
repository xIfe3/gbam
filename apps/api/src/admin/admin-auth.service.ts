import {
  adminBackupCodes,
  adminInvites,
  adminRoles,
  adminSessions,
  adminUsers,
  type DbTransaction,
} from "@gbam/db";
import type { AcceptInviteInput, AdminPermission, InviteAdminInput } from "@gbam/shared";
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq, gt, isNull } from "drizzle-orm";
import type { Redis } from "ioredis";
import { randomBytes } from "node:crypto";
import { hashPassword, hashToken, newSessionToken, verifyPassword } from "../auth/crypto.js";
import { RateLimiter, TooManyRequestsError } from "../common/rate-limiter.js";
import { EmailQueue } from "../email/email.queue.js";
import { ENV, type Env } from "../env.js";
import { InjectDb, REDIS, type Db } from "../infra/infra.module.js";
import {
  decryptSecret,
  encryptSecret,
  newBackupCodes,
  newTotpSecret,
  otpauthUrl,
  verifyTotp,
} from "./admin-crypto.js";
import { AuditService } from "./audit.service.js";

const SESSION_HOURS = 12;
const INVITE_HOURS = 48;
const CHALLENGE_SECONDS = 5 * 60;
const MAX_FAILURES = 5;
const LOCK_MINUTES = 15;
const LOGIN_PER_IP = 20;
const LOGIN_IP_WINDOW_SECONDS = 10 * 60;
/** Last-active is written at most this often, not on every click. */
const TOUCH_EVERY_MS = 5 * 60 * 1000;

export type RequestMeta = { ip: string; userAgent: string | null };

/** The signed-in admin, as the guard attaches it to each request. */
export type AdminContext = {
  id: string;
  sessionId: string;
  name: string;
  email: string;
  isSuperadmin: boolean;
  role: { id: string; name: string } | null;
  /** What their role allows. A superadmin is allowed everything regardless. */
  permissions: AdminPermission[];
};

function badSignIn(): UnauthorizedException {
  // One message for "no such admin" and "wrong password", so it reveals neither.
  return new UnauthorizedException({
    statusCode: 401,
    message: "That email and password don't match",
  });
}

function badCode(): UnauthorizedException {
  return new UnauthorizedException({
    statusCode: 401,
    field: "code",
    message: "That code isn't right. Check your app and try again.",
  });
}

function secondsUntil(when: Date): number {
  return Math.max(1, Math.ceil((when.getTime() - Date.now()) / 1000));
}

// Checked against when the email has no admin, so that path takes as long as a real one.
let dummyHash: string | null = null;
async function dummyPasswordHash(): Promise<string> {
  if (dummyHash === null) {
    dummyHash = await hashPassword(randomBytes(32).toString("hex"));
  }
  return dummyHash;
}

/** Admin invites, sign-in (password, then authenticator code) and sessions. */
@Injectable()
export class AdminAuthService {
  constructor(
    @InjectDb() private readonly db: Db,
    @Inject(REDIS) private readonly redis: Redis,
    @Inject(ENV) private readonly env: Env,
    private readonly emails: EmailQueue,
    private readonly limiter: RateLimiter,
    private readonly audit: AuditService,
  ) {}

  /** The key that encrypts authenticator secrets. Without it, admin sign-in is off. */
  private key(): string {
    const key = this.env.ADMIN_TOTP_KEY;
    if (!key) {
      throw new ServiceUnavailableException(
        "Admin sign-in isn't set up (ADMIN_TOTP_KEY is missing)",
      );
    }
    return key;
  }

  // ---- Invites ----

  /**
   * Creates an invite and emails its link. `allowExisting` is for "reset authenticator": the
   * same admin sets a new password and authenticator through a fresh invite.
   */
  async createInvite(
    input: InviteAdminInput,
    invitedBy: string | null,
    allowExisting = false,
  ): Promise<{ inviteId: string; token: string }> {
    this.key();
    const email = input.email.trim().toLowerCase();
    if (!allowExisting) {
      const existing = await this.db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(and(eq(adminUsers.email, email), isNull(adminUsers.removedAt)));
      if (existing.length > 0) {
        throw new ConflictException({ field: "email", message: "That email is already an admin" });
      }
    }

    const token = newSessionToken();
    const rows = await this.db
      .insert(adminInvites)
      .values({
        email,
        name: input.name,
        roleId: input.roleId,
        isSuperadmin: input.isSuperadmin,
        tokenHash: hashToken(token),
        invitedBy,
        expiresAt: new Date(Date.now() + INVITE_HOURS * 60 * 60 * 1000),
      })
      .returning({ id: adminInvites.id });
    const invite = rows[0];
    if (!invite) {
      throw new Error("Expected the database to return the invite");
    }

    await this.emails.send(`admin-invite-${invite.id}`, {
      kind: "admin_invite",
      to: email,
      name: input.name,
      inviteUrl: `${this.env.WEB_URL}/admin/invite/${token}`,
    });
    return { inviteId: invite.id, token };
  }

  /** A live invite (not used, not expired), or 404. */
  private async liveInvite(token: string) {
    const rows = await this.db
      .select()
      .from(adminInvites)
      .where(
        and(
          eq(adminInvites.tokenHash, hashToken(token)),
          isNull(adminInvites.usedAt),
          gt(adminInvites.expiresAt, new Date()),
        ),
      );
    const invite = rows[0];
    if (!invite) {
      throw new NotFoundException("This invite link has expired or was already used");
    }
    return invite;
  }

  /**
   * What the invite page shows: who it's for, and the authenticator secret (as a QR code
   * link, and as text for typing in by hand). The secret is made on the first visit and
   * kept, so reloading the page shows the same QR code.
   */
  async viewInvite(
    token: string,
  ): Promise<{ email: string; name: string; secret: string; otpauthUrl: string }> {
    const key = this.key();
    const invite = await this.liveInvite(token);
    let secret: string;
    if (invite.totpSecretEnc) {
      secret = decryptSecret(invite.totpSecretEnc, key);
    } else {
      secret = newTotpSecret();
      await this.db
        .update(adminInvites)
        .set({ totpSecretEnc: encryptSecret(secret, key) })
        .where(eq(adminInvites.id, invite.id));
    }
    return {
      email: invite.email,
      name: invite.name,
      secret,
      otpauthUrl: otpauthUrl(secret, invite.email),
    };
  }

  /**
   * The invitee sets their password and proves their app works (a correct code). Creates the
   * admin (or, for a reset, updates them), gives them 10 backup codes, and signs them in.
   */
  async acceptInvite(
    token: string,
    input: AcceptInviteInput,
    meta: RequestMeta,
  ): Promise<{ sessionToken: string; backupCodes: string[] }> {
    const key = this.key();
    const invite = await this.liveInvite(token);
    if (!invite.totpSecretEnc) {
      throw new BadRequestException({
        field: "code",
        message: "Open the invite page again to see your QR code",
      });
    }
    // Kept in its own variable: TypeScript then knows it isn't null inside the transaction.
    const secretEnc = invite.totpSecretEnc;
    const step = verifyTotp(decryptSecret(secretEnc, key), input.code, Date.now(), null);
    if (step === null) {
      throw new BadRequestException({
        field: "code",
        message: "That code isn't right. Check your app and try again.",
      });
    }

    // Slow on purpose, so it runs before (outside) the transaction.
    const passwordHash = await hashPassword(input.password);
    const backupCodes = newBackupCodes();

    const sessionToken = await this.db.transaction(async (tx) => {
      // Used up first, in the same transaction, so two tabs can't both accept it.
      const used = await tx
        .update(adminInvites)
        .set({ usedAt: new Date() })
        .where(and(eq(adminInvites.id, invite.id), isNull(adminInvites.usedAt)))
        .returning({ id: adminInvites.id });
      if (used.length === 0) {
        throw new NotFoundException("This invite link has expired or was already used");
      }

      const values = {
        name: invite.name,
        passwordHash,
        totpSecretEnc: secretEnc,
        totpLastStep: step,
        isSuperadmin: invite.isSuperadmin,
        roleId: invite.roleId,
        failedCount: 0,
        lockedUntil: null,
        removedAt: null,
      };
      const existing = await tx
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(eq(adminUsers.email, invite.email));
      let adminId: string;
      const found = existing[0];
      if (found) {
        // A reset, or a removed admin invited back: same account, new password and app.
        await tx.update(adminUsers).set(values).where(eq(adminUsers.id, found.id));
        await tx.delete(adminSessions).where(eq(adminSessions.adminId, found.id));
        await tx.delete(adminBackupCodes).where(eq(adminBackupCodes.adminId, found.id));
        adminId = found.id;
      } else {
        const inserted = await tx
          .insert(adminUsers)
          .values({ ...values, email: invite.email })
          .returning({ id: adminUsers.id });
        const created = inserted[0];
        if (!created) {
          throw new Error("Expected the database to return the admin");
        }
        adminId = created.id;
      }

      const codeRows = [];
      for (const code of backupCodes) {
        codeRows.push({ adminId, codeHash: hashToken(code) });
      }
      await tx.insert(adminBackupCodes).values(codeRows);

      await this.audit.record(
        {
          adminId,
          action: "admin.invite_accepted",
          targetType: "admin",
          targetId: adminId,
          ip: meta.ip,
        },
        tx,
      );
      return this.createSession(tx, adminId, meta);
    });

    return { sessionToken, backupCodes };
  }

  // ---- Sign-in ----

  /**
   * Step 1: email and password. Returns a short-lived "challenge" for step 2 (the code). It
   * lives in Redis for 5 minutes and says which admin got the password right.
   */
  async login(
    emailInput: string,
    password: string,
    meta: RequestMeta,
  ): Promise<{ challengeToken: string }> {
    this.key();
    const limit = await this.limiter.hit(
      `admin-login-ip:${meta.ip}`,
      LOGIN_PER_IP,
      LOGIN_IP_WINDOW_SECONDS,
    );
    if (!limit.allowed) {
      throw new TooManyRequestsError(limit.retryAfterSeconds);
    }

    const email = emailInput.trim().toLowerCase();
    const rows = await this.db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.email, email), isNull(adminUsers.removedAt)));
    const admin = rows[0];
    if (!admin) {
      await verifyPassword(await dummyPasswordHash(), password);
      await this.audit.record({
        adminId: null,
        action: "admin.sign_in_failed",
        note: "unknown email",
        ip: meta.ip,
      });
      throw badSignIn();
    }
    this.assertNotLocked(admin.lockedUntil);

    const passwordOk = await verifyPassword(admin.passwordHash, password);
    if (!passwordOk) {
      await this.recordFailure(admin.id, admin.failedCount, "wrong password", meta);
      throw badSignIn();
    }

    const challengeToken = newSessionToken();
    await this.redis.set(
      `admin-challenge:${hashToken(challengeToken)}`,
      admin.id,
      "EX",
      CHALLENGE_SECONDS,
    );
    return { challengeToken };
  }

  /** Step 2: the code from the authenticator app, or a backup code. Signs the admin in. */
  async verify(
    challengeToken: string,
    code: string,
    meta: RequestMeta,
  ): Promise<{ sessionToken: string }> {
    this.key();
    const challengeKey = `admin-challenge:${hashToken(challengeToken)}`;
    const adminId = await this.redis.get(challengeKey);
    if (!adminId) {
      throw new UnauthorizedException({
        statusCode: 401,
        message: "Sign-in timed out. Please start again.",
      });
    }
    const rows = await this.db
      .select()
      .from(adminUsers)
      .where(and(eq(adminUsers.id, adminId), isNull(adminUsers.removedAt)));
    const admin = rows[0];
    if (!admin) {
      throw badSignIn();
    }
    this.assertNotLocked(admin.lockedUntil);

    const normalised = code.trim().toLowerCase();
    let accepted = false;
    if (/^\d{6}$/.test(normalised)) {
      const secret = decryptSecret(admin.totpSecretEnc, this.key());
      const step = verifyTotp(secret, normalised, Date.now(), admin.totpLastStep);
      if (step !== null) {
        // Remember the window, so this same code can't be used again.
        await this.db
          .update(adminUsers)
          .set({ totpLastStep: step })
          .where(eq(adminUsers.id, admin.id));
        accepted = true;
      }
    } else {
      // A backup code: used up in the same statement that checks it's unused.
      const used = await this.db
        .update(adminBackupCodes)
        .set({ usedAt: new Date() })
        .where(
          and(
            eq(adminBackupCodes.adminId, admin.id),
            eq(adminBackupCodes.codeHash, hashToken(normalised)),
            isNull(adminBackupCodes.usedAt),
          ),
        )
        .returning({ id: adminBackupCodes.id });
      accepted = used.length > 0;
    }

    if (!accepted) {
      await this.recordFailure(admin.id, admin.failedCount, "wrong code", meta);
      throw badCode();
    }

    await this.redis.del(challengeKey);
    const sessionToken = await this.db.transaction(async (tx) => {
      await tx
        .update(adminUsers)
        .set({ failedCount: 0, lockedUntil: null })
        .where(eq(adminUsers.id, admin.id));
      await this.audit.record({ adminId: admin.id, action: "admin.sign_in", ip: meta.ip }, tx);
      return this.createSession(tx, admin.id, meta);
    });
    return { sessionToken };
  }

  async logout(token: string, admin: AdminContext, ip: string): Promise<void> {
    await this.db.delete(adminSessions).where(eq(adminSessions.tokenHash, hashToken(token)));
    await this.audit.record({ adminId: admin.id, action: "admin.sign_out", ip });
  }

  /**
   * The admin behind a session token, or null if the token is unknown, expired, or belongs
   * to a removed admin. The role is read fresh every time, so a role change applies on the
   * admin's very next request.
   */
  async sessionAdmin(token: string): Promise<AdminContext | null> {
    const now = new Date();
    const rows = await this.db
      .select({ session: adminSessions, admin: adminUsers, role: adminRoles })
      .from(adminSessions)
      .innerJoin(adminUsers, eq(adminUsers.id, adminSessions.adminId))
      .leftJoin(adminRoles, and(eq(adminRoles.id, adminUsers.roleId), isNull(adminRoles.deletedAt)))
      .where(
        and(
          eq(adminSessions.tokenHash, hashToken(token)),
          gt(adminSessions.expiresAt, now),
          isNull(adminUsers.removedAt),
        ),
      );
    const row = rows[0];
    if (!row) {
      return null;
    }

    const lastUsed = row.session.lastUsedAt;
    if (lastUsed === null || now.getTime() - lastUsed.getTime() > TOUCH_EVERY_MS) {
      await this.db
        .update(adminSessions)
        .set({ lastUsedAt: now })
        .where(eq(adminSessions.id, row.session.id));
    }

    let role: AdminContext["role"] = null;
    let permissions: AdminPermission[] = [];
    if (row.role) {
      role = { id: row.role.id, name: row.role.name };
      permissions = row.role.permissions as AdminPermission[];
    }
    return {
      id: row.admin.id,
      sessionId: row.session.id,
      name: row.admin.name,
      email: row.admin.email,
      isSuperadmin: row.admin.isSuperadmin,
      role,
      permissions,
    };
  }

  // ---- Helpers ----

  private assertNotLocked(lockedUntil: Date | null): void {
    if (lockedUntil !== null && lockedUntil.getTime() > Date.now()) {
      throw new TooManyRequestsError(secondsUntil(lockedUntil));
    }
  }

  /** Counts a wrong password or code; the 5th in a row locks the account for 15 minutes. */
  private async recordFailure(
    adminId: string,
    failedCount: number,
    why: string,
    meta: RequestMeta,
  ) {
    const failures = failedCount + 1;
    let lockedUntil: Date | null = null;
    if (failures >= MAX_FAILURES) {
      lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
    }
    await this.db
      .update(adminUsers)
      .set({ failedCount: failures, lockedUntil })
      .where(eq(adminUsers.id, adminId));
    await this.audit.record({ adminId, action: "admin.sign_in_failed", note: why, ip: meta.ip });
  }

  private async createSession(
    tx: DbTransaction,
    adminId: string,
    meta: RequestMeta,
  ): Promise<string> {
    const token = newSessionToken();
    const now = new Date();
    await tx.insert(adminSessions).values({
      adminId,
      tokenHash: hashToken(token),
      expiresAt: new Date(now.getTime() + SESSION_HOURS * 60 * 60 * 1000),
      lastUsedAt: now,
      userAgent: meta.userAgent,
      ip: meta.ip,
    });
    return token;
  }
}
