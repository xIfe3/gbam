/** Integration test against the dev Postgres + Redis (db 1). */
import "reflect-metadata";
import { adminAuditLog, adminInvites, adminSessions, adminUsers } from "@gbam/db";
import {
  BadRequestException,
  NotFoundException,
  ServiceUnavailableException,
  UnauthorizedException,
} from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { randomUUID } from "node:crypto";
import { and, eq, inArray, like } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { TooManyRequestsError } from "../common/rate-limiter.js";
import { EmailQueue } from "../email/email.queue.js";
import type { EmailJob } from "../email/templates.js";
import { ENV, loadEnv } from "../env.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";
import { currentStep, totpCode } from "./admin-crypto.js";
import { AdminAuthService } from "./admin-auth.service.js";
import { AdminModule } from "./admin.module.js";

process.loadEnvFile?.("../../.env");

const PASSWORD = "a long admin password";

describe("Admin sign-in (integration)", () => {
  let moduleRef: TestingModule;
  let service: AdminAuthService;
  let db: Db;
  const sent: EmailJob[] = [];
  const emails: string[] = [];

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [InfraModule, AdminModule] })
      .overrideProvider(EmailQueue)
      .useValue({
        send: async (_jobId: string, job: EmailJob) => {
          sent.push(job);
        },
      })
      .compile();
    moduleRef.enableShutdownHooks();
    service = moduleRef.get(AdminAuthService);
    db = moduleRef.get(DB);
  });

  afterAll(async () => {
    if (emails.length > 0) {
      const rows = await db.select().from(adminUsers).where(inArray(adminUsers.email, emails));
      const ids = rows.map((row) => row.id);
      if (ids.length > 0) {
        await db.delete(adminAuditLog).where(inArray(adminAuditLog.adminId, ids));
        await db.delete(adminUsers).where(inArray(adminUsers.id, ids));
      }
    }
    await moduleRef.close();
  });

  const meta = () => ({ ip: `test-${randomUUID()}`, userAgent: "vitest" });

  /** Invites and accepts a fresh superadmin; returns what a real admin would have. */
  async function newAdmin() {
    const email = `admin-${randomUUID().slice(0, 8)}@example.com`;
    emails.push(email);
    const { token } = await service.createInvite(
      { name: "Test Admin", email, roleId: null, isSuperadmin: true },
      null,
    );
    const view = await service.viewInvite(token);
    const secret = view.secret;
    const accepted = await service.acceptInvite(
      token,
      { password: PASSWORD, code: totpCode(secret, currentStep(Date.now())) },
      meta(),
    );
    return { email, secret, ...accepted };
  }

  /** A code for the next 30-second window, so it hasn't been used yet. */
  function nextCode(secret: string): string {
    return totpCode(secret, currentStep(Date.now()) + 1);
  }

  it("invite → accept → signed in", async () => {
    const admin = await newAdmin();
    expect(admin.backupCodes).toHaveLength(10);
    const me = await service.sessionAdmin(admin.sessionToken);
    expect(me).toMatchObject({ email: admin.email, isSuperadmin: true });
    const invite = sent.find((job) => job.kind === "admin_invite" && job.to === admin.email);
    expect(invite).toBeDefined();
  });

  it("invite page shows the same secret on every visit", async () => {
    const email = `admin-${randomUUID().slice(0, 8)}@example.com`;
    emails.push(email);
    const { token } = await service.createInvite(
      { name: "A", email, roleId: null, isSuperadmin: true },
      null,
    );
    const first = await service.viewInvite(token);
    const second = await service.viewInvite(token);
    expect(second.secret).toBe(first.secret);
    expect(first.otpauthUrl).toContain(first.secret);
  });

  it("expired invite refused", async () => {
    const email = `admin-${randomUUID().slice(0, 8)}@example.com`;
    emails.push(email);
    const { token, inviteId } = await service.createInvite(
      { name: "A", email, roleId: null, isSuperadmin: true },
      null,
    );
    await db
      .update(adminInvites)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(adminInvites.id, inviteId));
    await expect(service.viewInvite(token)).rejects.toBeInstanceOf(NotFoundException);
  });

  it("a wrong code when accepting is a field error", async () => {
    const email = `admin-${randomUUID().slice(0, 8)}@example.com`;
    emails.push(email);
    const { token } = await service.createInvite(
      { name: "A", email, roleId: null, isSuperadmin: true },
      null,
    );
    await service.viewInvite(token);
    await expect(
      service.acceptInvite(token, { password: PASSWORD, code: "000000" }, meta()),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("signs in with password, then code", async () => {
    const admin = await newAdmin();
    const { challengeToken } = await service.login(admin.email, PASSWORD, meta());
    const { sessionToken } = await service.verify(challengeToken, nextCode(admin.secret), meta());
    expect(await service.sessionAdmin(sessionToken)).not.toBeNull();
  });

  it("wrong password and unknown email give the same 401", async () => {
    const admin = await newAdmin();
    const wrong = await service.login(admin.email, "not the password", meta()).catch((e) => e);
    const unknown = await service
      .login("nobody-here@example.com", PASSWORD, meta())
      .catch((e) => e);
    expect(wrong).toBeInstanceOf(UnauthorizedException);
    expect(unknown).toBeInstanceOf(UnauthorizedException);
    expect((wrong as UnauthorizedException).message).toBe(
      (unknown as UnauthorizedException).message,
    );
  });

  it("code reuse refused", async () => {
    const admin = await newAdmin();
    const code = nextCode(admin.secret);
    const first = await service.login(admin.email, PASSWORD, meta());
    await service.verify(first.challengeToken, code, meta());

    const second = await service.login(admin.email, PASSWORD, meta());
    await expect(service.verify(second.challengeToken, code, meta())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("5 wrong codes lock the account", async () => {
    const admin = await newAdmin();
    const { challengeToken } = await service.login(admin.email, PASSWORD, meta());
    for (let i = 0; i < 5; i++) {
      await service.verify(challengeToken, "000000", meta()).catch(() => undefined);
    }
    const locked = await service
      .verify(challengeToken, nextCode(admin.secret), meta())
      .catch((e) => e);
    expect(locked).toBeInstanceOf(TooManyRequestsError);
    // Logged: each failure is in the audit log.
    const failures = await db
      .select()
      .from(adminAuditLog)
      .innerJoin(adminUsers, eq(adminUsers.id, adminAuditLog.adminId))
      .where(
        and(eq(adminUsers.email, admin.email), like(adminAuditLog.action, "admin.sign_in_failed")),
      );
    expect(failures.length).toBeGreaterThanOrEqual(5);
  });

  it("backup code works once", async () => {
    const admin = await newAdmin();
    const backup = admin.backupCodes[0];
    if (!backup) {
      throw new Error("expected backup codes");
    }
    const first = await service.login(admin.email, PASSWORD, meta());
    await service.verify(first.challengeToken, backup.toUpperCase(), meta());

    const second = await service.login(admin.email, PASSWORD, meta());
    await expect(service.verify(second.challengeToken, backup, meta())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("session expires after 12 hours", async () => {
    const admin = await newAdmin();
    const session = await service.sessionAdmin(admin.sessionToken);
    if (!session) {
      throw new Error("expected a session");
    }
    const rows = await db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.id, session.sessionId));
    const row = rows[0];
    if (!row) {
      throw new Error("expected a session row");
    }
    const hours = (row.expiresAt.getTime() - row.createdAt.getTime()) / 3_600_000;
    expect(Math.round(hours)).toBe(12);

    await db
      .update(adminSessions)
      .set({ expiresAt: new Date(Date.now() - 1000) })
      .where(eq(adminSessions.id, session.sessionId));
    expect(await service.sessionAdmin(admin.sessionToken)).toBeNull();
  });

  it("removed admin's session stops working", async () => {
    const admin = await newAdmin();
    await db
      .update(adminUsers)
      .set({ removedAt: new Date() })
      .where(eq(adminUsers.email, admin.email));
    expect(await service.sessionAdmin(admin.sessionToken)).toBeNull();
    await expect(service.login(admin.email, PASSWORD, meta())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  it("seller token refused by admin endpoints", async () => {
    // Any token that isn't an admin session (a seller's included) finds nothing.
    expect(await service.sessionAdmin("a-seller-session-token-that-is-not-admin")).toBeNull();
  });

  it("503 without ADMIN_TOTP_KEY", async () => {
    const env = loadEnv({ ...process.env, ADMIN_TOTP_KEY: "" });
    const keyless = await Test.createTestingModule({ imports: [InfraModule, AdminModule] })
      .overrideProvider(ENV)
      .useValue(env)
      .overrideProvider(EmailQueue)
      .useValue({ send: async () => undefined })
      .compile();
    try {
      const keylessService = keyless.get(AdminAuthService);
      await expect(keylessService.login("x@example.com", PASSWORD, meta())).rejects.toBeInstanceOf(
        ServiceUnavailableException,
      );
    } finally {
      await keyless.close();
    }
  });
});
