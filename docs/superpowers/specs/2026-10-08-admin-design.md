# Gbam admin area: design

Date: 2026-10-08
Status: approved in chat section by section, waiting for review of this written spec

## Why

Gbam has no admin screens. To handle a refund alert, reopen a shop, help a locked-out seller
or change a setting, someone has to edit the database by hand. As the team grows (the
superadmin plus 1–5 staff soon), each person should only see and do what their job needs,
and every action should be traceable.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| Who uses it | The superadmin (owner) plus 1–5 staff soon |
| Where it lives | **Inside the existing apps**: pages at `/admin` in apps/web, an admin module in apps/api. No new service. |
| Roles model | **Custom roles**: a fixed list of permissions in code; the superadmin builds roles by ticking permissions; each admin has one role |
| Admin sign-in | **Password + authenticator app** (TOTP), with backup codes |
| Power over shops | **Look, plus specific logged fixes.** No editing a seller's products or prices, no signing in as a seller |
| Sessions page | Superadmin only; admins and sellers in separate tabs; can sign out admins, and sellers with a reason |
| Maintenance | **Two levels**: Full, and Pause orders |
| Analytics | **Built into Gbam** (no cookies, no third party) |
| Uptime | **An outside service** (UptimeRobot or Better Stack), shown on the System page |
| Ticket replies | **On a Gbam page** (seller dashboard, or a private ticket link), not by replying to email |
| Announcements | **Sellers only**, never customers |
| Marketing pages | **Text and images editable in fixed layouts**, not a page builder |
| Scope | All 7 phases designed and built together, in the order below |

## Phases (build order)

1. **Foundation**: accounts, roles, sign-in, sessions, audit log, list/bulk-action pattern,
   shops, orders, refunds, basic support inbox
2. **Platform controls**: settings, maintenance mode
3. **Numbers**: money, analytics, active right now
4. **System health**: status, Sentry errors, background jobs, uptime
5. **Support tickets**
6. **Messaging**: email announcements, in-app notifications
7. **Content editor**: help/FAQ/blog/changelog/legal, and marketing pages

Each phase is reviewed and committed before the next starts.

---

## 1. Foundation

### 1.1 Permissions

A fixed list in `packages/shared` (so the API and web agree). Each is one thing an admin can do.

| Permission | Allows | Phase |
|---|---|---|
| `shops.view` | Search shops; see details, owner, orders, products, payout account (last 4 digits) | 1 |
| `shops.suspend` | Suspend or reopen a shop | 1 |
| `sellers.help` | Unlock a locked-out seller; resend their verification email | 1 |
| `orders.view` | Search any order; see its history, payments, WhatsApp results, problem reports | 1 |
| `refunds.handle` | Work the "needs refund" list; mark a refund done | 1 |
| `support.view` | See contact messages and customer problem reports | 1 |
| `support.handle` | Mark them handled with a note | 1 |
| `audit.view` | See the audit log | 1 |
| `fees.manage` | Give or end a founding-seller fee waiver | 1 |
| `settings.manage` | Change platform settings | 2 |
| `money.view` | Money overview | 3 |
| `analytics.view` | Analytics and "active right now" | 3 |
| `system.view` | System page: status, errors, jobs, uptime | 4 |
| `system.manage` | Retry failed background jobs | 4 |
| `tickets.view` | See tickets | 5 |
| `tickets.handle` | Reply, assign, change status, close | 5 |
| `messages.send` | Send email announcements and in-app notifications | 6 |
| `content.edit` | Create and edit content drafts | 7 |
| `content.publish` | Publish, schedule, unpublish, restore content | 7 |

### 1.2 Roles

- A role is a name plus a set of permissions. The superadmin creates, edits and deletes roles.
- Each admin has exactly **one** role. A mix of permissions = a new role.
- A role still assigned to someone can't be deleted.
- Seeded roles (editable):
  - **Support**: shops.view, sellers.help, orders.view, support.view, support.handle,
    tickets.view, tickets.handle
  - **Finance**: orders.view, refunds.handle, money.view, fees.manage
  - **Operations**: shops.view, shops.suspend, sellers.help, orders.view, system.view

### 1.3 Superadmin

- A flag on the admin account, not a role. Has every permission, plus superadmin-only
  actions: add/remove admins, change roles, create/edit roles, make another superadmin,
  sessions page, maintenance mode.
- The **last superadmin** can't be removed or downgraded.
- An admin can't change their own role or superadmin flag.
- The **first superadmin** is created by a one-off server command
  (`node dist/scripts/create-superadmin.js <email>`), which emails them an invite. No web page
  can create a superadmin from nothing.
- A second command resets a superadmin's authenticator (for a lost phone and lost backup codes).

### 1.4 Admin accounts and sign-in

Separate from sellers: new tables, their own session cookie (`gbam_admin`, path `/`,
HttpOnly, Secure, SameSite=Lax). A seller session can never reach admin endpoints, and the
same email can have both kinds of account.

**Invite flow**
1. Superadmin enters name, email, role (+ superadmin tick).
2. An invite email with a link (single use, expires in 48 hours).
3. The invitee sets a password (at least 12 characters, same Argon2id hashing as sellers)
   and scans a QR code with an authenticator app.
4. They type the current 6-digit code to confirm.
5. They're shown **10 backup codes** once (stored hashed; each works once).

**Sign in** at `/admin/login`: email + password, then the 6-digit code (or a backup code).
- 5 wrong tries (password or code) lock the account for 15 minutes; per-IP limits as for sellers.
- A code that already worked is refused within its 30-second window (stored last used step).
- Sessions last **12 hours** (absolute). Last-active is updated at most every 5 minutes.
- The TOTP secret is **encrypted** (AES-256-GCM) with `ADMIN_TOTP_KEY` from the environment.

**Recovery**
- Lost phone: sign in with a backup code, or superadmin clicks **Reset authenticator**
  (emails a new setup link; existing sessions end).
- An admin leaves: **Remove** signs them out everywhere and blocks sign-in. The account row
  is kept (marked removed) so the audit log still names them.

### 1.5 Sessions page (superadmin only)

Two tabs.

**Admins**: admin, role, device (from the user agent, e.g. "Chrome on Android"), IP (shown
shortened, `102.89.x.x`; full in details), signed in, last active, **Sign out**. Per admin:
**Sign out everywhere**. The current session is labelled **This device** and can't be ended here.

**Sellers**: shop, email, device, IP, signed in, last active (shown as "active today" /
"3 days ago": seller sessions only update about once a day), search by shop or email.
**Sign out** asks for a reason, recorded in the audit log.

### 1.6 Audit log

- Table `admin_audit_log`: id, admin_id, action (e.g. `shop.suspend`), target_type,
  target_id, note, before (jsonb), after (jsonb), ip, batch_id (null unless bulk), created_at.
- **Append-only**: no update or delete endpoints, for anyone. Kept at least 2 years.
- Recorded: every admin change; sign-in, failed sign-in, sign-out; session terminations;
  role/permission changes; settings and maintenance changes; announcements sent; content
  published; job retries.
- Written **in the same database transaction** as the change, so a change can't happen
  without its log entry.
- Never stores passwords, codes, secrets or full payment payloads in before/after.

### 1.7 List pages, bulk actions, delete

**Every list**: search box; filters for that page; filters and sorting kept in the URL;
50 rows per page; newest first by default; sortable columns.

**Bulk actions**: tick rows → pick an action.
- At most 100 items per action.
- A **note** (at least 5 characters) is always required and goes in the audit log.
- A **confirmation dialog** says exactly what will happen.
- Riskier actions (delete, sign out everyone, send to all) also require typing the count.
- The result lists what worked and what was skipped and why.
- One audit entry per item, sharing a `batch_id`.

**Delete**
- Orders, payments and refunds are **never** deleted (business and tax records).
- Shops are suspended or closed, never erased (erasing personal data stays the separate
  privacy step).
- Content, announcements, notifications, tickets and roles go to a **bin for 30 days**
  (`deleted_at`), restorable by anyone with that area's permission; a daily job removes them
  for good after 30 days.

### 1.8 Screens

The admin uses the Gbam look: sidebar on desktop, menu on phones. Only items the admin's role
allows are shown; the API refuses everything else regardless.

| Screen | Needs | Content |
|---|---|---|
| Overview | any admin | What needs attention (refunds waiting, open support/tickets, suspended shops); today's sales/orders if `money.view` |
| Shops | `shops.view` | Search by name, slug, email; filters: status, signed up, has products, has bank account, fee waiver. Shop page: details, owner, status, payout (last 4), product count, recent orders, waiver. Actions by permission: Suspend/Reopen (reason), Unlock seller, Resend verification, Fee waiver |
| Orders | `orders.view` | Search by code, phone, shop; filters: status, date, shop, has problem report. Order page: items, delivery, status timeline (who/when), payments, WhatsApp results, problem reports |
| Refunds | `refunds.handle` | Needs-refund list: order, shop, amount, Paystack reference, reason. **Mark refunded** with a confirm tick |
| Support | `support.view` | Contact messages and problem reports; mark handled with a note (`support.handle`). Replaced by Tickets in phase 5 for contact messages |
| Audit log | `audit.view` | Filter by admin, action, target, date; open a batch |
| Admins | superadmin | Add/invite, change role, reset authenticator, remove |
| Roles | superadmin | Create/edit by ticking permissions; delete if unassigned |
| Sessions | superadmin | 1.5 |

### 1.9 Shop suspension

- `sellers.suspended_at` + `suspended_reason`.
- A suspended shop: storefront shows "This shop isn't taking orders right now"; no new
  orders or payment links (same checks as a closed shop); the seller can still sign in and
  sees a banner explaining it and how to contact support.
- Paid orders can still be fulfilled and refunded.
- Reopen clears both fields. Both actions notify the seller (email + in-app once phase 6 exists).

### 1.10 Needs-refund list

Today a needs-refund case is an email to support@ only. Add a table `refund_cases` (order,
payment reference, reason, amount, created_at, resolved_at, resolved_by) written by
`OrdersService.emailSupportNeedsRefund`, so the Refunds screen has a list to work.
**Mark refunded** moves the order to `refunded` (system actor, with the existing paid check),
resolves the case, and writes the audit entry.

---

## 2. Platform controls

### 2.1 Settings (`settings.manage`)

Table `platform_settings` (key, value jsonb, updated_by, updated_at), validated by a Zod
schema per key. Cached in memory for 30 seconds.

| Setting | Default (today's value) |
|---|---|
| Gbam fee percent and cap | current values in `packages/shared/src/fees.ts` |
| Founding waiver default length | current value |
| Unpaid order reminder / cancel after (hours) | 24 / 48 |
| Support, contact, privacy emails | support@, hello@, privacy@gbam.app |
| Gbam WhatsApp number (contact page) | `GBAM_WHATSAPP_NUMBER` |
| New seller sign-ups | open |

- Every change is validated (fee 0–5%, hours 1–168, etc.) and audited with before/after.
- Fee changes apply only to payment links created after the change (the fee is already
  stored per payment).

### 2.2 Maintenance mode (superadmin only)

Two levels, chosen when switching on, with an optional message and "back by" time:

| | Full | Pause orders |
|---|---|---|
| Public pages and shops | Maintenance page | Visible |
| New orders, payment links, Pay now | Off | Off ("Ordering is paused for a short while") |
| Seller sign-in and dashboard | Off | Off |
| `/admin` | Works | Works |
| Paystack and WhatsApp webhooks, worker | **Keep running** | **Keep running** |

- Stored in `platform_settings`; read by the web proxy and an API guard (cached 10 seconds).
- Switching on or off needs confirmation and is audited.

---

## 3. Numbers

### 3.1 Money (`money.view`)

Date range (today, 7 days, 30 days, custom; Lagos time): sales (paid order totals), items
subtotal, delivery collected, Gbam fees, Paystack fees, refunds, paid order count; a
per-shop table; a sales-by-day chart. All from `payments` and `orders`.

### 3.2 Analytics (`analytics.view`)

- **Seller funnel** (by sign-up week): signed up → verified → first product → bank account
  → first paid order.
- **Active shops**: with a paid order in the last 7 / 30 days.
- **Orders**: placed, paid, expired, cancelled; paid rate; average order value; top shops.
- **Shoppers**: storefront visits; visit → order → paid, per shop and overall.

### 3.3 Visit counting and "active right now"

- Pages send a small beacon (`POST /api/beat`) on load and every 60 seconds while visible:
  page kind (storefront / product / checkout / dashboard), shop id if any, and a random id
  made per browser tab (kept in memory, not a cookie).
- No cookies, no IP addresses stored, no user ids. No third party, so no cookie banner.
- Redis: "active" sorted sets with members expiring after 2 minutes; daily visit counters per
  shop and page kind (`HINCRBY`). A nightly job copies the day's counters into a
  `daily_visits` table so history survives Redis.
- **Active right now** (refreshes every 5 seconds): sellers in the dashboard, shoppers on
  storefronts (top shops), admins signed in.
- Bots: requests with a bot user agent are ignored; one tab id can count once per minute.

---

## 4. System health (`system.view`)

- **Status**: API (it's answering), database and Redis (a ping each), worker (writes a
  heartbeat to Redis every 30 seconds; red if older than 2 minutes).
- **Errors**: latest unresolved Sentry issues via the Sentry API (title, events, last seen,
  link). Needs `SENTRY_AUTH_TOKEN` (read-only), `SENTRY_ORG`, `SENTRY_PROJECT`.
- **Background jobs**: per queue (emails, notifications, payments, order expiry, photo
  cleanup, and the new ones): waiting, active, failed, delayed. Failed jobs list name, error
  (scrubbed) and time, **never the job data** (it can hold codes and emails). **Retry**
  (`system.manage`, audited).
- **Uptime**: UptimeRobot or Better Stack checks the website and the API `/health` every
  minute and alerts the owner directly. The System page shows current status and 30-day
  uptime % via the service's API (`UPTIME_API_KEY`).

---

## 5. Support tickets (`tickets.view`, `tickets.handle`)

**Sources**: the contact form (each message becomes a ticket); a **Get help** button in the
seller dashboard (linked to their shop, optionally an order); **escalating** a customer
problem report (which otherwise stays with the seller, as now).

**A ticket**: subject, requester (seller, or name + email for contact-form tickets), status
(open, waiting on customer, solved, closed), priority (low, normal, urgent), assignee,
linked shop/order, a thread of messages, and internal notes (admins only).

**Replies**: an admin reply emails the requester with the message and a **Reply** button.
Sellers reply in their dashboard (Help → their tickets). Contact-form requesters get a
private ticket link (a long random key, like order tracking). No inbound email.

**List**: filters for status, assignee, priority, source, date; bulk assign / change status /
close (with a note). Auto-close after 7 days in "solved" with no reply.

**Alerts**: a new ticket emails support@; a reply on an assigned ticket emails the assignee.

---

## 6. Messaging (`messages.send`)

### 6.1 Email announcements (sellers only)

1. **Audience**: all sellers, or filters (verified, has products, has bank account, no order
   in N days, signed up between dates), or one shop. Suspended and closed shops are always
   excluded, and so are sellers who unsubscribed.
2. **Compose**: subject; body with simple formatting (bold, links, lists, one button),
   rendered in the branded email layout.
3. **Preview** and **Send a test to myself**.
4. **Send now** or **schedule**; confirm by typing the recipient count.
5. Sent through the email queue in batches (respecting the provider's rate limit); the
   announcement page shows sent/failed counts. No open tracking.

**Unsubscribe**: announcements are "news and tips". Every one has an unsubscribe link (a
signed one-click link, plus the `List-Unsubscribe` header) and sellers can switch them off
in Settings → Emails. Service emails (payments, security, account, tickets) always send.

### 6.2 In-app notifications

- A **bell** in the seller dashboard: unread count, a list, click to mark read, "Mark all read".
- Admins send them to the same audiences as announcements: type (info, warning, action
  needed), title, short text, optional link, optional end date.
- The system creates some automatically: ticket reply, shop suspended/reopened, payout
  account changed.

---

## 7. Content editor (`content.edit`, `content.publish`)

### 7.1 Help, FAQ, blog, changelog, legal

- List with filters: type, status (draft, published, scheduled), category.
- Editor: Markdown with a formatting toolbar and live preview; images (uploaded to R2, like
  product photos); title, slug, summary, category, SEO description.
- **Save draft**, **Preview**, **Publish now** or **Publish at**; **Unpublish**.
- Every publish saves a version (`content_versions`); versions can be compared and restored.
- **The database becomes the master copy.** `sync-content` changes to insert-only: it adds
  entries missing from the database and never overwrites existing ones. The Markdown files
  become starting content.

### 7.2 Marketing pages (text and images in fixed layouts)

- Pages: home, features, pricing, about, how it works, use cases, mission, security.
- Each page gets a typed field list in code (e.g. home: hero title, hero subtitle, hero
  photo, button labels, feature cards…). The layout stays in code; the admin edits only
  those fields, so the design can't break.
- Stored as a `marketing_page` content entry (fields in jsonb, validated by the page's
  Zod schema), with the same draft / preview / publish / versions as 7.1.
- Defaults are today's text, so nothing changes until someone publishes an edit.
- Pages read their fields at request time with a short cache, so a publish shows within a
  minute without a deploy.

---

## Security summary

- Every admin endpoint uses an `AdminGuard` (valid admin session, not removed) plus a
  `@RequirePermission(...)` check; superadmin-only endpoints check the flag. A role change
  applies on the next request.
- Admin pages render on the server and check the session before showing anything.
- Admin actions are rate-limited per admin.
- Audit entries are written in the same transaction as the change.
- No admin can see full bank account numbers, card details, passwords, codes or secrets.
- Admin cookies are separate from seller cookies.

## New environment variables

`ADMIN_TOTP_KEY` (32 random bytes, base64), `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`,
`SENTRY_PROJECT`, `UPTIME_API_KEY`, `UNSUBSCRIBE_SIGNING_KEY`.

## Not in this design

- Signing in as a seller or editing a seller's products.
- Emailing customers.
- A drag-and-drop page builder.
- Replying to tickets by email.
- Third-party analytics, session replays, heatmaps.
- Exporting data to CSV (can be added later per screen).

## Testing

- **Permissions**: every admin endpoint is tested for "allowed role passes, other role gets
  403, no session gets 401"; superadmin-only endpoints refuse non-superadmins; the last
  superadmin can't be removed; an admin can't change their own role.
- **Sign-in**: wrong password/code lockout; code reuse refused; backup code works once;
  expired invite refused; 12-hour expiry; removed admin can't sign in; seller cookie refused.
- **Audit**: each action writes exactly one entry (or one per item with a shared batch id);
  no endpoint can change or delete entries.
- **Bulk actions**: 100 limit; note required; partial results reported.
- **Suspension, maintenance**: storefront and checkout blocked as specified; webhooks still
  confirm payments during both maintenance levels.
- **Settings**: validation; fee change affects only new payment links.
- **Analytics**: beacon counting, bot filtering, nightly copy.
- **Tickets, announcements, notifications, content**: create/reply/assign flows; unsubscribe
  excluded from audiences; content versions and restore; `sync-content` no longer
  overwrites edited entries.
