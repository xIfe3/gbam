import { z } from "zod";
import { emailSchema } from "./schemas";

/**
 * Everything an admin can be allowed to do. Roles are made by ticking some of these; the API
 * checks one of them on every admin request. Adding a permission means adding it here and
 * using it in the API (and in ADMIN_PERMISSION_LABELS below).
 */
export const ADMIN_PERMISSIONS = [
  "shops.view",
  "shops.suspend",
  "sellers.help",
  "orders.view",
  "refunds.handle",
  "support.view",
  "support.handle",
  "audit.view",
  "fees.manage",
  "settings.manage",
  "money.view",
  "analytics.view",
  "system.view",
  "system.manage",
  "tickets.view",
  "tickets.handle",
  "messages.send",
  "content.edit",
  "content.publish",
] as const;

export type AdminPermission = (typeof ADMIN_PERMISSIONS)[number];

/** How each permission is shown on the Roles screen. */
export const ADMIN_PERMISSION_LABELS: Record<AdminPermission, { area: string; label: string }> = {
  "shops.view": { area: "Shops", label: "View shops" },
  "shops.suspend": { area: "Shops", label: "Suspend or reopen shops" },
  "sellers.help": { area: "Shops", label: "Unlock sellers and resend verification" },
  "orders.view": { area: "Orders", label: "View orders" },
  "refunds.handle": { area: "Orders", label: "Handle refunds" },
  "support.view": { area: "Support", label: "View contact messages and problem reports" },
  "support.handle": { area: "Support", label: "Mark support items handled" },
  "audit.view": { area: "Audit", label: "View the audit log" },
  "fees.manage": { area: "Money", label: "Give or end fee waivers" },
  "settings.manage": { area: "Platform", label: "Change platform settings" },
  "money.view": { area: "Money", label: "View the money overview" },
  "analytics.view": { area: "Numbers", label: "View analytics and active users" },
  "system.view": { area: "System", label: "View system health" },
  "system.manage": { area: "System", label: "Retry failed background jobs" },
  "tickets.view": { area: "Tickets", label: "View support tickets" },
  "tickets.handle": { area: "Tickets", label: "Reply to and manage tickets" },
  "messages.send": { area: "Messaging", label: "Send announcements and notifications" },
  "content.edit": { area: "Content", label: "Edit content drafts" },
  "content.publish": { area: "Content", label: "Publish content" },
};

/** Admins have more power than sellers, so a longer password. */
export const adminPasswordSchema = z
  .string()
  .min(12, "Use at least 12 characters")
  .max(200, "That password is too long");

export const adminLoginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, "Enter your password").max(200),
});
export type AdminLoginInput = z.output<typeof adminLoginSchema>;

/**
 * The second sign-in step: the 6 digits from the authenticator app, or a one-time backup code
 * like "a1b2-c3d4" (typed in any case, with spaces around it).
 */
export const adminCodeSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^(\d{6}|[0-9a-f]{4}-[0-9a-f]{4})$/, "Enter the 6-digit code from your app");

export const adminVerifySchema = z.object({
  challengeToken: z.string().min(1).max(200),
  code: adminCodeSchema,
});
export type AdminVerifyInput = z.output<typeof adminVerifySchema>;

/** Accepting an invite: choose a password and prove the authenticator app is set up. */
export const acceptInviteSchema = z.object({
  password: adminPasswordSchema,
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "Enter the 6-digit code from your app"),
});
export type AcceptInviteInput = z.output<typeof acceptInviteSchema>;

export const inviteAdminSchema = z
  .object({
    name: z.string().trim().min(1, "Enter their name").max(80),
    email: emailSchema,
    roleId: z.uuid().nullable(),
    isSuperadmin: z.boolean(),
  })
  // A superadmin can do everything, so needs no role; everyone else needs one.
  .refine((invite) => invite.isSuperadmin || invite.roleId !== null, {
    message: "Choose a role",
    path: ["roleId"],
  });
export type InviteAdminInput = z.output<typeof inviteAdminSchema>;

export const roleInputSchema = z.object({
  name: z.string().trim().min(1, "Give the role a name").max(40),
  permissions: z
    .array(z.enum(ADMIN_PERMISSIONS))
    .refine((list) => new Set(list).size === list.length, "Each permission only once"),
});
export type RoleInput = z.output<typeof roleInputSchema>;

/** Changing an admin's role (superadmin only). */
export const updateAdminSchema = z
  .object({ roleId: z.uuid().nullable(), isSuperadmin: z.boolean() })
  .refine((change) => change.isSuperadmin || change.roleId !== null, {
    message: "Choose a role",
    path: ["roleId"],
  });
export type UpdateAdminInput = z.output<typeof updateAdminSchema>;

/** Every bulk action: which rows (at most 100) and a note for the audit log. */
export const bulkActionSchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1, "Pick at least one")
    .max(100, "At most 100 at a time")
    .refine((list) => new Set(list).size === list.length, "Each item only once"),
  note: z.string().trim().min(5, "Write a short note (at least 5 characters)").max(500),
});
export type BulkActionInput = z.output<typeof bulkActionSchema>;

/** A reason or note for a single action (suspend, sign out a seller, resolve a refund...). */
export const reasonSchema = z.object({
  reason: z.string().trim().min(5, "Write a short reason (at least 5 characters)").max(500),
});
export type ReasonInput = z.output<typeof reasonSchema>;
