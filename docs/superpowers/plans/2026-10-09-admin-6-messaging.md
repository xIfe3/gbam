# Admin Phase 6 (Messaging) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins with `messages.send` email announcements to sellers ("news and tips", always with a one-click unsubscribe) and post in-app notifications to a bell in the seller dashboard. Gbam also posts some notifications automatically.

**Architecture:** One shared audience resolver turns a filter into a list of shops. The resolver always leaves out suspended and closed shops, plus unsubscribed ones for email. Announcements are drafts until sent or scheduled. A queue job then writes one `announcement_recipients` row per seller and sends in small throttled batches, marking each row sent or failed. Notifications are written straight to `seller_notifications`: either from an admin "campaign" or by the system.

**Tech Stack:** NestJS 12, Drizzle, BullMQ, Resend (headers for List-Unsubscribe), Next.js 16.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-design.md` section 6 (and 1.7 for confirmation and the bin).

## Global Constraints

- CLAUDE.md code style. Every admin change is audited.
- **Audience:** empty filters means every seller. Filters: `shopId`, `verified`, `hasProducts`, `hasBank`, `noOrderDays`, `signedUpFrom`, `signedUpTo`. Suspended and closed shops are never included. For announcements, sellers with `news_emails = false` are left out too.
- **Sending:** sending or scheduling needs the typed recipient count to match the current count.
- **Unsubscribe:** the token is HMAC-SHA256 of the seller id with `UNSUBSCRIBE_SIGNING_KEY`. Every announcement carries the link and the `List-Unsubscribe` + `List-Unsubscribe-Post: List-Unsubscribe=One-Click` headers. Without the key, announcements can't be sent (503 with a clear message).
- **Body format:** paragraphs, `**bold**`, `[text](https://…)` links, `- ` lists, and one optional button (label + https URL). Everything else is shown as plain text. All of it is escaped.
- **No tracking:** no open or click tracking.
- **Service emails:** these always send (orders, payments, security, account, tickets).
- **Notifications:** types are `info`, `warning` and `action`. A notification has a title (≤ 80), body (≤ 300), an optional internal link (`/dashboard…`) and an optional end date. Automatic ones: Gbam replied to a ticket, shop suspended or reopened, payout account changed.

## Review Focus

1. A seller who unsubscribed, or a suspended/closed shop → never emailed by an announcement, even if they matched the filters when it was scheduled. (Task 4 test `resolved at send time`.)
2. The send job is interrupted and runs again → nobody gets the announcement twice. (Task 4 test `rerun sends nobody twice`.)
3. A forged or wrong unsubscribe token → refused, nothing changed. (Task 2 test.)
4. Body text holding `<script>` or a `javascript:` link → escaped, link dropped. (Task 3 test.)
5. A seller reading another seller's notification by id → 404. (Task 5 test.)

---

### Task 1: Tables, shared schemas, env, email headers

**Files:** `packages/db/src/schema.ts` (`sellers.news_emails`, `announcements`, `announcement_recipients`, `notification_campaigns`, `seller_notifications`, enums), migration, `packages/shared/src/messaging.ts` (`audienceSchema`, `announcementSchema`, `sendAnnouncementSchema`, `notificationSchema`, constants), `emailSettingsSchema` gains `newsEmails`, `packages/integrations/src/email.ts` (`headers?`), `apps/api/src/env.ts` (`UNSUBSCRIBE_SIGNING_KEY`), tests.

### Task 2: Audience, unsubscribe and the News setting

**Files:** `apps/api/src/messaging/audience.service.ts` (`count(audience, forEmail)`, `sellers(audience, forEmail)`), `unsubscribe.ts` (`unsubscribeToken`, `checkUnsubscribeToken`), `unsubscribe.controller.ts` (`POST /email/unsubscribe {s,t}`), settings service and controller (`newsEmails`), tests.

**Tests:** `filters narrow the audience`; `suspended and closed never included`; `unsubscribed left out of email only`; `valid token unsubscribes`; `forged token refused`; `email settings save newsEmails`.

### Task 3: Announcements API

**Files:** `apps/api/src/messaging/announcement-body.ts` (`renderBody(body) → {html, text}`), email kind `announcement`, `apps/api/src/admin/announcements-admin.service.ts` and `.controller.ts`: `GET/POST /admin/announcements`, `GET/PATCH /admin/announcements/:id`, `POST /admin/announcements/preview`, `POST /admin/announcements/:id/test`, `POST /admin/announcements/:id/send {confirmCount, scheduledAt?}`, `POST /admin/announcements/:id/cancel`, `POST /admin/announcements/:id/delete|restore`, tests.

**Tests:** `body formatting is escaped and limited`; `needs messages.send`; `drafts can be edited, sent ones can't`; `send needs the right count`; `schedule and cancel`; `test goes only to me`; `no signing key → 503`.

### Task 4: Announcement sender job

**Files:** `apps/api/src/messaging/announcements.queue.ts`, `announcement-sender.service.ts` (`run(announcementId)`), `announcements.processor.ts`, worker, `SYSTEM_QUEUE_NAMES`, housekeeping purges the bin (announcements and campaigns).

**Tests:** `sends to everyone in the audience with unsubscribe headers`; `resolved at send time`; `rerun sends nobody twice`; `a failed send is counted and others continue`; `cancelled announcement sends nothing`.

### Task 5: Seller notifications

**Files:** `apps/api/src/messaging/seller-notifications.service.ts` (`notify(sellerId, input, tx?)`, `listFor(sellerId)`, `markRead`, `markAllRead`), `seller-notifications.controller.ts` (`GET /notifications/mine`, `POST /notifications/mine/:id/read`, `POST /notifications/mine/read-all`), admin `notifications-admin.service/controller` (`GET/POST /admin/notifications`, delete/restore), hooks in tickets reply, shop suspend/reopen, payout change, tests.

**Tests:** `admin campaign reaches the audience`; `seller sees only their own, newest first, ended ones hidden`; `mark read and mark all read`; `another seller's notification is 404`; `ticket reply creates a notification`; `binned campaign disappears from bells`.

### Task 6: Seller web: bell, News setting, unsubscribe page

**Files:** `apps/web/components/dashboard/notification-bell.tsx`, dashboard layout, settings email form (`newsEmails`), `apps/web/app/unsubscribe/page.tsx` + action, `apps/web/app/api/unsubscribe/route.ts` (one-click POST), tests.

### Task 7: Admin web: Announcements and Notifications

**Files:** `apps/web/app/admin/(signed-in)/announcements/page.tsx`, `announcements/new`, `announcements/[id]` (edit, preview in a sandboxed iframe, test, send/schedule with typed count, counts), `notifications/page.tsx` (compose + list + bin), audience fields component, nav items, tests.
