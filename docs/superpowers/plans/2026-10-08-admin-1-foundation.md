# Admin Phase 1 (Foundation) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A working `/admin` area: invited admins sign in with password + authenticator code, see only what their role allows, and handle shops, orders, refunds and support, with every action in an append-only audit log.

**Architecture:** New `apps/api/src/admin/` module (own tables, own sessions sent in an `x-admin-token` header, `AdminGuard` + `@RequirePermission`). New `apps/web/app/admin/` pages calling it server-side with the token from an `gbam_admin` HttpOnly cookie. TOTP is implemented with `node:crypto` (RFC 6238); QR codes come from the `qrcode` package on the web side.

**Tech Stack:** NestJS 12, Drizzle, Zod, Next.js 16, Vitest; `qrcode` (web).

**Spec:** `docs/superpowers/specs/2026-10-08-admin-design.md` (sections 1.1–1.10, Security summary)

## Global Constraints

- CLAUDE.md code style (plain over clever; comment new concepts).
- Permission names exactly as spec 1.1. Phase-1 screens only use phase-1 permissions, but the full list is defined now.
- Admin password ≥ 12 characters, Argon2id via existing `hashPassword`.
- TOTP: 6 digits, 30-second steps, SHA-1, accept the current step ±1; refuse a step ≤ `totp_last_step`.
- Admin sessions: 12 hours absolute; last-active updated at most every 5 minutes. Token hashed with `hashToken`.
- 5 wrong tries (password or code) → locked 15 minutes.
- Invites: single use, 48 hours.
- Audit entries are written in the same transaction as the change; no update/delete path exists.
- Bulk actions: ≤ 100 ids, note ≥ 5 characters.
- `ADMIN_TOTP_KEY`: 32 bytes base64; admin sign-in endpoints answer 503 when it's missing.
- Every admin endpoint: no/invalid token → 401, missing permission → 403.

## Review Focus

1. A removed admin with a still-valid session token → next request is 401, immediately. (Task 4 test `removed admin's session stops working`.)
2. A role edited to drop a permission while its admin is signed in → their next request needing it is 403. (Task 5 test `role change applies on the next request`.)
3. The same 6-digit code submitted twice within its 30 seconds → second is refused. (Task 3 test `refuses a reused step`; Task 4 test `code reuse refused`.)
4. Suspending an already-suspended shop in a bulk action → reported as skipped, not an error, and no duplicate audit entry. (Task 6 test `bulk suspend skips already suspended`.)
5. A seller session cookie (`gbam_session`) sent to admin endpoints → 401; an admin token sent as a seller bearer → 401. (Task 4 test `seller token refused by admin endpoints`.)

---

### Task 1: Shared admin definitions

**Files:** Create `packages/shared/src/admin.ts`, `admin.test.ts`; export from index.

**Produces:**
- `ADMIN_PERMISSIONS` (readonly tuple of the 19 names in spec 1.1), `type AdminPermission`, `ADMIN_PERMISSION_LABELS: Record<AdminPermission, { area: string; label: string }>`.
- `adminPasswordSchema` (string 12–200), `adminLoginSchema {email, password}`, `adminCodeSchema` (6 digits, or a backup code `xxxx-xxxx` lowercase hex), `adminVerifySchema {challengeToken: string, code}`, `acceptInviteSchema {password, code}`, `inviteAdminSchema {name 1–80, email, roleId: uuid | null, isSuperadmin: boolean}` (refine: roleId required unless superadmin), `roleInputSchema {name 1–40, permissions: AdminPermission[] (unique)}`, `bulkActionSchema {ids: uuid[] 1–100 unique, note: string trimmed 5–500}`, `reasonSchema {reason: string trimmed 5–500}`.
- Tests: `permissions list has the 19 spec names`; `invite needs a role unless superadmin`; `bulk refuses 101 ids`; `bulk refuses a 4-char note`; `role refuses an unknown permission`.

### Task 2: Database

**Files:** `packages/db/src/schema.ts`; migration `admin_foundation`.

**Produces tables** (all `id` uuid, timestamps tz):
- `admin_roles` (name unique, permissions text[] not null default '{}', deleted_at, created_at, updated_at)
- `admin_users` (email unique lowercase, name, password_hash, totp_secret_enc text, totp_last_step bigint null, is_superadmin bool default false, role_id → admin_roles null, failed_count int default 0, locked_until, removed_at, created_at, updated_at)
- `admin_invites` (email, name, role_id null, is_superadmin, token_hash unique, totp_secret_enc null, invited_by → admin_users null, expires_at, used_at, created_at)
- `admin_sessions` (admin_id → admin_users cascade, token_hash unique, expires_at, last_used_at, user_agent, ip, created_at; index admin_id)
- `admin_backup_codes` (admin_id cascade, code_hash, used_at; index admin_id)
- `admin_audit_log` (admin_id → admin_users null, action text, target_type text null, target_id text null, note text null, before jsonb, after jsonb, ip text null, batch_id uuid null, created_at; indexes created_at, admin_id, (target_type,target_id))
- `refund_cases` (order_id → orders cascade, payment_reference text null, reason text, amount_kobo bigint, created_at, resolved_at, resolved_by → admin_users null; unique payment_reference)
- `sellers.suspended_at`, `sellers.suspended_reason`
- `contact_messages.handled_note`, `contact_messages.handled_at`
- Migration also seeds the 3 roles from spec 1.2 (`INSERT … ON CONFLICT (name) DO NOTHING`).

### Task 3: TOTP, secret encryption, backup codes

**Files:** `apps/api/src/admin/admin-crypto.ts`, `admin-crypto.test.ts`; `apps/api/src/env.ts` (`ADMIN_TOTP_KEY: optional`).

**Produces:**
- `newTotpSecret(): string` (20 random bytes, base32), `totpCode(secret: string, step: number): string`, `currentStep(nowMs: number): number`, `verifyTotp(secret: string, code: string, nowMs: number, lastUsedStep: number | null): number | null` (returns the matched step).
- `otpauthUrl(secret: string, email: string): string` → `otpauth://totp/Gbam%20Admin:{email}?secret=…&issuer=Gbam%20Admin`.
- `encryptSecret(plain: string, keyBase64: string): string` / `decryptSecret(enc: string, keyBase64: string): string` (AES-256-GCM, `iv.tag.ciphertext` base64url).
- `newBackupCodes(): string[]` (10 × `xxxx-xxxx` hex).
- Tests: `RFC 6238 test vector` (secret "12345678901234567890" base32, T=59s → 287082 for 6 digits); `accepts the previous and next step`; `refuses a reused step`; `encrypt round-trips and a wrong key fails`; `backup codes are 10 unique`.

### Task 4: Admin sign-in, sessions, guard, audit, scripts

**Files:** `apps/api/src/admin/admin-auth.service.ts`, `admin-auth.controller.ts`, `admin.guard.ts` (`AdminGuard`, `RequirePermission`, `SuperadminOnly`, `CurrentAdmin`), `audit.service.ts`, `admin.module.ts`; register in `app.module.ts`; `apps/api/src/scripts/create-superadmin.ts`, `reset-admin-totp.ts`; email templates `admin_invite`; test `admin-auth.test.ts`.

**Endpoints:**
- `GET /admin/invites/:token` → `{ email, name, otpauthUrl }` (creates and stores the encrypted secret on first view); 404 for unknown/used/expired.
- `POST /admin/invites/:token/accept` `{password, code}` → `{ sessionToken, backupCodes }` (creates/updates the admin, marks invite used).
- `POST /admin/auth/login` `{email, password}` → `{ challengeToken }` (random 32 bytes, Redis key `admin-challenge:{hash}` → adminId, 5 minutes). Same 401 for unknown email / wrong password.
- `POST /admin/auth/verify` `{challengeToken, code}` → `{ sessionToken }`.
- `POST /admin/auth/logout`, `GET /admin/me` → `{ id, name, email, isSuperadmin, role: {id,name} | null, permissions: AdminPermission[] }`.

**Guard:** token from `x-admin-token`; session valid, not expired, admin not removed; attaches `request.admin`; at most 300 requests a minute per admin (RateLimiter key `admin-rate:{adminId}`, 429 over). `@RequirePermission(p)` → 403 unless superadmin or role has p. `@SuperadminOnly()` → 403 unless superadmin.

**Audit:** `AuditService.record(db | tx, { adminId, action, targetType?, targetId?, note?, before?, after?, ip?, batchId? })`. Sign-in success/failure and logout recorded.

**Tests:** `invite → accept → signed in`; `expired invite refused`; `wrong password and unknown email give the same 401`; `5 wrong codes lock the account`; `code reuse refused`; `backup code works once`; `session expires after 12 hours`; `removed admin's session stops working`; `seller token refused by admin endpoints`; `503 without ADMIN_TOTP_KEY`.

### Task 5: Admins, roles, sessions (superadmin)

**Files:** `apps/api/src/admin/team.service.ts`, `team.controller.ts`, `sessions-admin.service.ts`; test `team.test.ts`.

**Endpoints (all `@SuperadminOnly`):** `GET/POST /admin/team` (invite → email), `PATCH /admin/team/:id` `{roleId, isSuperadmin}`, `POST /admin/team/:id/reset-authenticator`, `POST /admin/team/:id/remove`, `GET/POST /admin/roles`, `PATCH /admin/roles/:id`, `DELETE /admin/roles/:id` (refused while assigned; sets `deleted_at`, the bin), `POST /admin/roles/:id/restore` (within 30 days), `GET /admin/sessions/admins`, `GET /admin/sessions/sellers?q=`, `POST /admin/sessions/admins/:sessionId/end`, `POST /admin/sessions/admins/by-admin/:adminId/end-all`, `POST /admin/sessions/sellers/:sessionId/end` `{reason}`.

**Rules:** can't change own role/flag; last superadmin can't be removed/downgraded; can't end own current session from here. Every change audited with before/after.

**Tests:** `invite sends an email and lists the invite`; `role change applies on the next request`; `last superadmin can't be removed`; `admin can't change their own role`; `role in use can't be deleted`; `ending an admin session signs them out`; `ending a seller session needs a reason and is audited`.

### Task 6: Shops (and suspension)

**Files:** `apps/api/src/admin/shops-admin.service.ts`, `shops-admin.controller.ts`; suspension checks in `orders.service.ts` (`insertOrder`), `payments.service.ts` (`ensurePaymentLink`), `storefront.service.ts`, `tracking.service.ts` (`canPay`), `auth.service.ts` (`toPublicUser` gains `seller.suspended: boolean`); test `shops-admin.test.ts`.

**Endpoints:** `GET /admin/shops?q=&status=active|suspended|closed&hasProducts=&hasBank=&page=&sort=` (`shops.view`), `GET /admin/shops/:id` (`shops.view`), `POST /admin/shops/:id/suspend` `{reason}` and `/reopen` `{reason}` (`shops.suspend`), `POST /admin/shops/bulk/suspend|reopen` `bulkActionSchema` (`shops.suspend`), `POST /admin/shops/:id/unlock-seller`, `/resend-verification` (`sellers.help`), `PUT /admin/shops/:id/fee-waiver` `{until: ISO date | null}` (`fees.manage`). Suspend/reopen email the owner (new templates `shop_suspended`, `shop_reopened`).

**Storefront when suspended:** `list`/`product` return the shop with `suspended: true` and no products; ordering throws 409 "This shop isn't taking orders right now"; payment links refused like a closed shop.

**Tests:** `search by name, slug and email`; `suspend blocks orders and payment links`; `reopen restores ordering`; `bulk suspend skips already suspended`; `unlock clears the lockout`; `fee waiver set and cleared`; each write `writes one audit entry`.

### Task 7: Orders and refunds

**Files:** `apps/api/src/admin/orders-admin.service.ts`, `orders-admin.controller.ts`; `OrdersService.emailSupportNeedsRefund` also inserts a `refund_cases` row (`ON CONFLICT DO NOTHING`); test `orders-admin.test.ts`.

**Endpoints:** `GET /admin/orders?q=&status=&shopId=&from=&to=&hasIssue=&page=` (`orders.view`; q matches code or customer phone), `GET /admin/orders/:id` (`orders.view`; same detail as seller view plus shop), `GET /admin/refunds?status=open|resolved` (`refunds.handle`), `POST /admin/refunds/:id/resolve` `{note}` (`refunds.handle`: moves the order to `refunded` as system if it isn't already, resolves the case, audits).

**Tests:** `search by code and phone`; `needs-refund creates one case per payment`; `resolve moves the order to refunded and closes the case`; `resolving twice is refused`.

### Task 8: Support inbox and audit list

**Files:** `apps/api/src/admin/support-admin.service.ts`, `support-admin.controller.ts`, `audit.controller.ts`; test `support-audit.test.ts`.

**Endpoints:** `GET /admin/support/messages?status=new|handled&q=` and `GET /admin/support/issues?status=open|resolved` (`support.view`); `POST /admin/support/messages/:id/handle` `{note}` and `/messages/bulk/handle` `bulkActionSchema`, `POST /admin/support/issues/:id/resolve` `{note}` (`support.handle`); `GET /admin/audit?adminId=&action=&targetType=&targetId=&from=&to=&batchId=&page=` (`audit.view`).

**Tests:** `handle a message with a note`; `bulk handle`; `audit list filters by admin and batch`; `no endpoint updates or deletes audit entries` (route table check).

### Task 9: Web admin sign-in

**Files:** `apps/web/lib/admin-session.ts` (cookie `gbam_admin`, 12 h, HttpOnly, SameSite=Lax, path `/`), `apps/web/lib/admin-api.ts` (request helper sending `x-admin-token`; 401 → `/admin/login`; 403 → throws `AdminForbiddenError`), `apps/web/proxy.ts` (matcher adds `/admin/:path*`; `/admin/login` and `/admin/invite/*` pass; others need the cookie), pages `app/admin/login/page.tsx` (+ two-step form), `app/admin/invite/[token]/page.tsx` (password + QR via `qrcode.toString(url, {type: "svg"})` + code, then backup codes screen), actions + tests; `packages/db/content/legal/cookies.md` gains the admin cookie line.

**Tests:** `login asks for the code after the password`; `wrong code shows an error`; `invite page shows a QR code and the secret`; `backup codes shown once after accepting`; proxy `admin pages without the cookie go to /admin/login`.

### Task 10: Web admin shell, overview, list pattern

**Files:** `app/admin/(signed-in)/layout.tsx` (sidebar from `me.permissions`), `page.tsx` (overview), `components/admin/data-list.tsx` (search + filters in URL, pagination, row checkboxes), `components/admin/bulk-action-dialog.tsx` (note ≥ 5, confirmation text, type-the-count when `risky`), tests.

**Tests:** `sidebar shows only permitted items`; `filters update the URL`; `bulk dialog needs a note`; `risky bulk needs the count typed`; `overview shows waiting refunds`.

### Task 11: Web shops, orders, refunds pages

**Files:** `app/admin/(signed-in)/shops/page.tsx`, `shops/[id]/page.tsx`, `orders/page.tsx`, `orders/[id]/page.tsx`, `refunds/page.tsx`, actions + tests.

**Tests:** `shop page buttons follow permissions`; `suspend asks for a reason`; `orders search by code`; `refund resolve asks for the tick and a note`.

### Task 12: Web support, audit, team, roles, sessions pages

**Files:** `app/admin/(signed-in)/support/page.tsx`, `audit/page.tsx`, `team/page.tsx`, `roles/page.tsx`, `sessions/page.tsx`, actions + tests.

**Tests:** `team page invites`; `roles page ticks permissions`; `sessions page has two tabs and This device can't be ended`; `seller sign-out asks for a reason`; `audit filters by admin`.

### Task 13: Seller side of suspension

**Files:** `apps/web/app/[slug]/page.tsx` (+ product page) show "This shop isn't taking orders right now" when `suspended`; `apps/web/app/dashboard/layout.tsx` banner for a suspended shop with support email; tests.

**Tests:** `suspended shop shows the notice and no products`; `seller sees the suspension banner`.
