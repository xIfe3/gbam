# Admin Phase 5 (Support tickets) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every request for help becomes a ticket with a thread. Admins reply on Gbam and keep internal notes. Sellers follow their tickets in the dashboard, and contact-form senders follow theirs through a private link.

**Architecture:** Two new tables: `support_tickets` and `ticket_messages`. `TicketsService` is the one place tickets are created and changed. The contact form, the seller "Get help" form and "Ask Gbam" on a customer problem all call it. The admin API wraps it with filters, bulk actions and the audit log. A daily `housekeeping` job closes solved tickets after 7 quiet days and empties the 30-day bin.

**Tech Stack:** NestJS 12, Drizzle + Postgres, BullMQ, Next.js 16.

**Spec:** `docs/superpowers/specs/2026-10-08-admin-design.md` section 5 (and 1.7 for lists, bulk actions and the bin).

## Global Constraints

- CLAUDE.md code style. `tickets.view` to read; `tickets.handle` for every change. Each admin change is audited in the same transaction.
- Statuses: `open`, `waiting` (on the requester), `solved`, `closed`. Priorities: `low`, `normal`, `urgent`. Sources: `contact`, `seller`, `problem_report`.
- Internal notes are never shown or emailed to requesters.
- A requester reply re-opens a `waiting` or `solved` ticket. A `closed` ticket takes no more replies. An admin reply sets `waiting`.
- Contact-form tickets have a long random `access_key` (like order tracking). The link is emailed only with an admin reply, never in the auto-reply, so the form can't be used to send someone else's words to a stranger.
- Bulk: at most 100, note of at least 5 characters, one audit entry per ticket sharing a batch id.
- Bin: `deleted_at`. Restorable for 30 days, then the daily job deletes for good. The same job purges roles that have been in the bin over 30 days and that no admin uses.

## Review Focus

1. A seller opening another shop's ticket, by id → 404. (Task 3 test `seller sees only their own tickets`.)
2. A public ticket link with a wrong key → 404, and internal notes never appear on it. (Task 3 test `public view needs the key and hides notes`.)
3. A requester replying to a closed ticket → refused, nothing emailed. (Task 2 test `closed takes no replies`.)
4. Auto-close running twice → no double events; a ticket that got a reply after being solved stays open. (Task 5 tests.)
5. Bulk action with one ticket already in the bin → the result lists it as skipped; the rest work. (Task 4 test `bulk reports skipped`.)

---

### Task 1: Tables and shared schemas

**Files:** `packages/db/src/schema.ts` (enums `ticket_status`, `ticket_priority`, `ticket_source`, `ticket_author`; tables `support_tickets`, `ticket_messages`), migration, `packages/shared/src/tickets.ts` (constants, `newTicketSchema` {subject 3–120, message 10–5000, orderCode optional}, `ticketReplySchema` {message 1–5000}, `ticketUpdateSchema` {status?, priority?, assigneeId? (uuid or null)}, `ticketBulkSchema` {ids ≤100, note ≥5, action, value?}), tests.

`support_tickets`: id, number (serial, shown as #1042), subject, source, status (default open), priority (default normal), requester_name, requester_email, seller_id (nullable, set null on delete), order_id (nullable), order_issue_id (nullable), contact_message_id (nullable), assignee_id (nullable admin), access_key (nullable unique), last_requester_reply_at, solved_at, closed_at, deleted_at, created_at, updated_at.
`ticket_messages`: id, ticket_id (cascade), author (`requester` | `admin` | `system`), admin_id (nullable), body, internal (bool), created_at.

**Tests:** shared schema tests (`subject too short`, `bulk needs a note`, `bulk at most 100`).

### Task 2: TicketsService and emails

**Files:** `apps/api/src/tickets/tickets.service.ts`, `tickets.module.ts`, email kinds `ticket_new` (to the support inbox), `ticket_reply` (to the requester, with a Reply button), `ticket_requester_replied` (to the assignee), contact form now opens a ticket in the same transaction.

**Produces:** `create(input, tx?)`, `replyAsRequester(ticketId, body)`, `replyAsAdmin(ticketId, admin, body, tx)`, `addNote(ticketId, admin, body, tx)`, `thread(ticketId, includeNotes)`, `linkFor(ticket)`.

**Tests:** `contact form opens a ticket`; `new ticket emails support`; `admin reply emails the requester and sets waiting`; `contact ticket reply email carries the private link`; `requester reply re-opens and emails the assignee`; `closed takes no replies`; `notes are never emailed`.

### Task 3: Seller and public ticket API

**Files:** `apps/api/src/tickets/tickets.controller.ts` (seller: `GET/POST /help/tickets`, `GET /help/tickets/:id`, `POST /help/tickets/:id/reply`, `POST /orders/:id/issues/:issueId/escalate`), `public-tickets.controller.ts` (`GET /tickets/:id?k=`, `POST /tickets/:id/reply?k=`, rate-limited by IP), tests.

**Tests:** `seller opens a ticket, optionally for an order`; `seller sees only their own tickets`; `escalating a problem opens one ticket (twice = same ticket)`; `public view needs the key and hides notes`; `public reply works and is rate limited`.

### Task 4: Admin ticket API

**Files:** `apps/api/src/admin/tickets-admin.service.ts`, `tickets-admin.controller.ts`, tests.

**Produces:** `GET /admin/tickets?status&priority&source&assignee(me|none|id)&q&from&to&page&bin`, `GET /admin/tickets/:id`, `POST /admin/tickets/:id/reply`, `POST /admin/tickets/:id/notes`, `PATCH /admin/tickets/:id`, `POST /admin/tickets/:id/delete`, `POST /admin/tickets/:id/restore`, `POST /admin/tickets/bulk` → `BulkResult`.

**Tests:** `needs tickets.view / tickets.handle`; `filters`; `reply, note and update are audited`; `bulk assign and close`; `bulk reports skipped`; `bin and restore`.

### Task 5: Housekeeping job

**Files:** `apps/api/src/tickets/housekeeping.service.ts`, `housekeeping.queue.ts` (daily scheduler), `housekeeping.processor.ts`, worker registration, add to `SYSTEM_QUEUE_NAMES`.

**Tests:** `solved for 7 days closes`; `a reply after solving keeps it open`; `running twice changes nothing more`; `bin older than 30 days is purged, newer kept`; `roles in the bin purged only when unused`.

### Task 6: Seller and public web pages

**Files:** `apps/web/app/dashboard/help/page.tsx` (my tickets + new ticket form), `help/[id]/page.tsx` (thread + reply), dashboard nav "Help", "Ask Gbam" on a customer problem, `apps/web/app/help/tickets/[id]/page.tsx` (public thread + reply with `?k=`), `lib/api.ts` calls, tests.

**Tests:** `new ticket form validates and opens`; `thread shows replies, never notes`; `ask Gbam escalates`; `public page needs the key`.

### Task 7: Admin ticket screens

**Files:** `apps/web/app/admin/(signed-in)/tickets/page.tsx` (filters, bulk, bin), `tickets/[id]/page.tsx` (thread, notes, reply, status/priority/assignee), nav "Tickets", overview tile "Open tickets", tests.

**Tests:** `list filters and bulk`; `detail shows notes marked internal`; `reply and note forms`; `handle-only controls hidden for view-only`; `nav shows Tickets by permission`.
