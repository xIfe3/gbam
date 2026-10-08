# Admin Phase 2 (Platform Controls) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins change platform values (fee, unpaid-order timings, inbox addresses, WhatsApp number, sign-ups open) without a deploy, and a superadmin can switch on maintenance mode (Full, or Pause orders) while payments keep being recorded.

**Architecture:** One `platform_settings` row per key (jsonb), read through `PlatformSettingsService` with a 30-second in-memory cache; everything that used a constant asks the service. Maintenance is a setting too: an API global guard refuses blocked requests with 503 `{ code: "MAINTENANCE" }`, and the web proxy (Node runtime) checks a public endpoint (cached 10 s) and rewrites blocked pages to `/maintenance`.

**Tech Stack:** NestJS 12, Drizzle, Zod, Next.js 16 proxy, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-design.md` section 2.

## Global Constraints

- CLAUDE.md code style.
- Defaults equal today's values: fee 150 basis points capped at 100 000 kobo; reminder 24 h, cancel 48 h; support@, hello@, privacy@gbam.app; WhatsApp number from `GBAM_WHATSAPP_NUMBER`; sign-ups open; founding waiver 90 days.
- Validation: fee 0–500 basis points, cap 0–1 000 000 kobo; reminder 1–168 h and < cancel; cancel 2–336 h; emails valid; WhatsApp digits 10–15 or empty.
- Fee changes affect only payment links created afterwards (the fee is stored per payment).
- Maintenance never blocks `/webhooks/*`, `/health`, `/admin/*`, `/platform/public`, or the worker.
- Every settings and maintenance change is audited with before/after.

## Review Focus

1. A Paystack webhook arrives during Full maintenance → still 200 and the order is marked paid. (Task 4 test `webhooks pass in full maintenance`.)
2. An admin is signed in during Full maintenance → admin pages and API keep working. (Task 4 test `admin routes pass`; Task 5 test `admin pages are not rewritten`.)
3. The API is unreachable when the web proxy checks maintenance → the site stays up (fail open). (Task 5 test `fails open when the status can't be loaded`.)
4. Reminder hours set ≥ cancel hours → refused with a clear message. (Task 1 test `reminder must come before cancel`.)
5. Settings saved twice within 30 s on another process → each process sees the new value within 30 s; the process that saved sees it at once. (Task 3 test `saving clears this process's cache`.)

---

### Task 1: Shared settings definitions and fee rates

**Files:** `packages/shared/src/platform-settings.ts` (+ test), `packages/shared/src/fees.ts` (+ test), index export.

**Produces:**
- `platformSettingsSchema` (all fields above, `.refine` reminder < cancel), `type PlatformSettings`, `DEFAULT_PLATFORM_SETTINGS`.
- `maintenanceSchema = { level: "off" | "full" | "pause", message: string ≤ 300 | null, backBy: ISO datetime | null }`, `type Maintenance`.
- `PublicPlatformInfo = { whatsappNumber: string | null, signupsOpen: boolean, feePercentBasisPoints, feeCapKobo, maintenance: Maintenance }`.
- `calculatePlatformFee(subtotalKobo, feeWaivedUntil, now = new Date(), rates = PLATFORM_FEE)`.
- Tests: `defaults match today's values`; `reminder must come before cancel`; `fee above 5% refused`; `fee uses the given rates`.

### Task 2: Database

**Files:** schema + migration `platform_settings`: `key text primary key`, `value jsonb not null`, `updated_by → admin_users null`, `updated_at`.

### Task 3: PlatformSettingsService and its users

**Files:** `apps/api/src/platform/platform-settings.service.ts`, `platform.module.ts` (global), `platform.controller.ts` (`GET /platform/public`), `apps/api/src/admin/settings-admin.controller.ts` (`GET/PATCH /admin/settings` with `settings.manage`, `PUT /admin/maintenance` superadmin); users: `payments.service.ts` (rates), `order-expiry.service.ts` (hours), `auth.service.ts` (`signup` refuses 403 `{ code: "SIGNUPS_CLOSED" }` when closed), `email.processor.ts` (passes inboxes to `renderEmail(job, inboxes)`); tests.

**Produces:** `PlatformSettingsService.get(): Promise<PlatformSettings>`, `.maintenance(): Promise<Maintenance>`, `.update(partial, actor, ip)`, `.setMaintenance(input, actor, ip)`, `.publicInfo()`. Stored keys: `"settings"` and `"maintenance"`.

**Tests:** `get returns defaults when nothing is stored`; `update validates, saves, audits before/after`; `saving clears this process's cache`; `fee change applies to the next payment link`; `expiry uses the stored hours`; `signups closed refuses signup`; `inbox change routes the contact email`; `non-superadmin can't set maintenance`.

### Task 4: Maintenance guard (API)

**Files:** `apps/api/src/platform/maintenance.guard.ts` (registered as `APP_GUARD` in AppModule), test.

**Rules:** off → allow. Always allow paths starting `/admin`, `/webhooks`, `/health`, `/platform/public`. full → everything else 503. pause → 503 for: `POST /storefront/*/orders`, `/track/*/pay*`, `/auth/*` except `GET /auth/me`… (all seller sign-in/sign-up), and any request carrying a seller `Authorization` header. Body: `{ statusCode: 503, code: "MAINTENANCE", level, message, backBy }`.

**Tests:** `off lets everything through`; `full blocks the storefront`; `webhooks pass in full maintenance`; `admin routes pass`; `pause blocks placing an order but not viewing the shop`; `pause blocks seller sign-in and dashboard calls`.

### Task 5: Web maintenance gate and public settings

**Files:** `apps/web/lib/platform-info.ts` (fetch `/platform/public`, 10 s module cache, fail open), `apps/web/proxy.ts` (matcher widened to all pages except `_next`, static files, `api`; rewrite to `/maintenance` per rules; existing dashboard/admin logic unchanged), `apps/web/app/maintenance/page.tsx`, contact page WhatsApp from public info, pricing fee calculator and seller money breakdown use the live rates, signup page shows "Sign-ups are paused" when closed; tests.

**Rules (web):** full → every page except `/admin*` and `/maintenance` shows the maintenance page. pause → `/[slug]/order`, `/pay/*`, `/login`, `/signup*`, `/forgot-password`, `/reset-password`, `/dashboard*` show it; shops and tracking stay visible.

**Tests:** `full rewrites a shop page`; `admin pages are not rewritten`; `pause rewrites checkout but not the shop`; `fails open when the status can't be loaded`; `maintenance page shows the message and back-by time`; `contact page uses the stored number`.

### Task 6: Admin settings and maintenance screens

**Files:** `apps/web/app/admin/(signed-in)/settings/page.tsx` (+ actions, form), `maintenance/page.tsx` (superadmin), nav items ("Settings" → `settings.manage`, "Maintenance" → superadmin), admin-api calls; tests.

**Tests:** `settings form shows current values and saves`; `bad values show field errors`; `maintenance needs the level and a confirmation`; `nav shows Settings only with settings.manage`.
