/**
 * For an admin who lost their phone AND their backup codes (usually the superadmin, since a
 * superadmin can reset everyone else from the Team page). Run on the server:
 *
 *   node dist/scripts/reset-admin-totp.js you@example.com
 *
 * It signs them out everywhere and emails (and prints) a new setup link, where they choose
 * a new password and set up their authenticator app again. Their role stays the same.
 */
import "reflect-metadata";
import { adminSessions, adminUsers } from "@gbam/db";
import { Module } from "@nestjs/common";
import { NestFactory } from "@nestjs/core";
import { and, eq, isNull } from "drizzle-orm";
import { AdminAuthService } from "../admin/admin-auth.service.js";
import { AdminModule } from "../admin/admin.module.js";
import { AuditService } from "../admin/audit.service.js";
import { DB, InfraModule, type Db } from "../infra/infra.module.js";

@Module({ imports: [InfraModule, AdminModule] })
class ScriptModule {}

const emailArgument = process.argv[2];
if (!emailArgument) {
  console.error("Usage: reset-admin-totp <email>");
  process.exit(1);
}
const email = emailArgument.trim().toLowerCase();

const app = await NestFactory.createApplicationContext(ScriptModule, { logger: ["error"] });
try {
  const db = app.get<Db>(DB);
  const rows = await db
    .select()
    .from(adminUsers)
    .where(and(eq(adminUsers.email, email), isNull(adminUsers.removedAt)));
  const admin = rows[0];
  if (!admin) {
    console.error(`No active admin with the email ${email}.`);
    process.exitCode = 1;
  } else {
    await db.delete(adminSessions).where(eq(adminSessions.adminId, admin.id));
    const auth = app.get(AdminAuthService);
    const { inviteId, token } = await auth.createInvite(
      { name: admin.name, email, roleId: admin.roleId, isSuperadmin: admin.isSuperadmin },
      null,
      true,
    );
    await app.get(AuditService).record({
      adminId: null,
      action: "admin.authenticator_reset",
      targetType: "admin",
      targetId: admin.id,
      note: `Reset from the server (reset-admin-totp script), invite ${inviteId}`,
    });
    const webUrl = process.env.WEB_URL ?? "";
    console.log(`${email} is signed out everywhere. A new setup link was emailed.`);
    console.log(`Link (keep it private): ${webUrl}/admin/invite/${token}`);
  }
} finally {
  await app.close();
}
