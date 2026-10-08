/**
 * Shared setup for the admin integration tests (not used by the app itself).
 */
import { adminAuditLog, adminInvites, adminRoles, adminUsers, type Db } from "@gbam/db";
import type { AdminPermission } from "@gbam/shared";
import type { INestApplication } from "@nestjs/common";
import { randomUUID } from "node:crypto";
import { inArray } from "drizzle-orm";
import { currentStep, totpCode } from "./admin-crypto.js";
import type { AdminAuthService } from "./admin-auth.service.js";

export type TestAdmin = { id: string; email: string; token: string; secret: string };

/** Tracks what a test file created, so afterAll can remove it all. */
export class AdminTestData {
  readonly adminEmails: string[] = [];
  readonly roleIds: string[] = [];

  constructor(
    private readonly db: Db,
    private readonly auth: AdminAuthService,
  ) {}

  /** A role with exactly these permissions. */
  async role(permissions: AdminPermission[]): Promise<string> {
    const rows = await this.db
      .insert(adminRoles)
      .values({ name: `Test role ${randomUUID().slice(0, 8)}`, permissions })
      .returning({ id: adminRoles.id });
    const role = rows[0];
    if (!role) {
      throw new Error("Failed to create the test role");
    }
    this.roleIds.push(role.id);
    return role.id;
  }

  /** A signed-in admin, made the real way: invite → open the page → accept with a code. */
  async admin(options: { isSuperadmin: boolean; roleId?: string | null }): Promise<TestAdmin> {
    const email = `admin-${randomUUID().slice(0, 8)}@example.com`;
    this.adminEmails.push(email);
    let roleId: string | null = null;
    if (options.roleId) {
      roleId = options.roleId;
    }
    const { token } = await this.auth.createInvite(
      { name: `Admin ${email.slice(6, 10)}`, email, roleId, isSuperadmin: options.isSuperadmin },
      null,
    );
    const view = await this.auth.viewInvite(token);
    const accepted = await this.auth.acceptInvite(
      token,
      { password: "a long admin password", code: totpCode(view.secret, currentStep(Date.now())) },
      { ip: "test", userAgent: "vitest" },
    );
    const me = await this.auth.sessionAdmin(accepted.sessionToken);
    if (!me) {
      throw new Error("The test admin could not sign in");
    }
    return { id: me.id, email, token: accepted.sessionToken, secret: view.secret };
  }

  async cleanUp(): Promise<void> {
    if (this.adminEmails.length > 0) {
      const rows = await this.db
        .select({ id: adminUsers.id })
        .from(adminUsers)
        .where(inArray(adminUsers.email, this.adminEmails));
      const ids: string[] = [];
      for (const row of rows) {
        ids.push(row.id);
      }
      if (ids.length > 0) {
        await this.db.delete(adminAuditLog).where(inArray(adminAuditLog.adminId, ids));
        await this.db.delete(adminInvites).where(inArray(adminInvites.invitedBy, ids));
        await this.db.delete(adminUsers).where(inArray(adminUsers.id, ids));
      }
      await this.db.delete(adminInvites).where(inArray(adminInvites.email, this.adminEmails));
    }
    if (this.roleIds.length > 0) {
      await this.db.delete(adminRoles).where(inArray(adminRoles.id, this.roleIds));
    }
  }
}

/** Calls the running test app as an admin (or with no token). */
export async function callAdmin(
  baseUrl: string,
  method: string,
  url: string,
  token: string | null,
  body?: unknown,
): Promise<{ status: number; json: unknown }> {
  const headers: Record<string, string> = {};
  if (token !== null) {
    headers["x-admin-token"] = token;
  }
  let payload: string | undefined;
  if (body !== undefined) {
    headers["content-type"] = "application/json";
    payload = JSON.stringify(body);
  }
  const res = await fetch(`${baseUrl}${url}`, { method, headers, body: payload });
  const text = await res.text();
  let json: unknown = null;
  if (text !== "") {
    json = JSON.parse(text);
  }
  return { status: res.status, json };
}

/** Starts the module's controllers on a random local port. */
export async function listen(app: INestApplication): Promise<string> {
  await app.listen(0, "127.0.0.1");
  return app.getUrl();
}
