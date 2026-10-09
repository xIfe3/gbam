/**
 * Creates the FIRST superadmin (or another one in an emergency). Run on the server, e.g. in
 * a Railway shell for the API service:
 *
 *   node dist/scripts/create-superadmin.js admin@gbam.zephra.dev "zephra admin"
 *   pnpm admin:create-superadmin you@example.com "Your Name"   (locally)
 *
 * It emails an invite link and also prints it here (in case email isn't set up yet). There
 * is deliberately no web page that can do this: only someone with server access can.
 */
import "reflect-metadata";
import { adminUsers } from "@gbam/db";
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
const nameArgument = process.argv[3];
if (!emailArgument) {
  console.error('Usage: create-superadmin <email> ["Full Name"]');
  process.exit(1);
}
const email = emailArgument.trim().toLowerCase();
let name = email;
if (nameArgument) {
  name = nameArgument;
}

const app = await NestFactory.createApplicationContext(ScriptModule, { logger: ["error"] });
try {
  const db = app.get<Db>(DB);
  const existing = await db
    .select({ id: adminUsers.id })
    .from(adminUsers)
    .where(and(eq(adminUsers.email, email), isNull(adminUsers.removedAt)));
  if (existing.length > 0) {
    console.error(`${email} is already an admin. To reset their authenticator: reset-admin-totp.`);
    process.exitCode = 1;
  } else {
    const auth = app.get(AdminAuthService);
    const { inviteId, token } = await auth.createInvite(
      { name, email, roleId: null, isSuperadmin: true },
      null,
    );
    await app.get(AuditService).record({
      adminId: null,
      action: "admin.invited",
      targetType: "admin_invite",
      targetId: inviteId,
      note: "Superadmin invite created from the server (create-superadmin script)",
      after: { email, isSuperadmin: true },
    });
    const webUrl = process.env.WEB_URL ?? "";
    console.log(`Invite emailed to ${email}. It expires in 48 hours.`);
    console.log(`Link (keep it private): ${webUrl}/admin/invite/${token}`);
  }
} finally {
  await app.close();
}
