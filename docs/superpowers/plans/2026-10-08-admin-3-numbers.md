# Admin Phase 3 (Numbers) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Admins see money (sales, fees, refunds by day and by shop), analytics (seller funnel, active shops, orders, shopper visits) and who is active right now, without any third-party tracking.

**Architecture:** Money and most analytics are SQL over existing tables (Lagos-time days). Visits come from a first-party beacon: pages post to a Next route (`/api/beat`) that forwards to `POST /beat` on the API, which counts in Redis (active sorted sets with a 2-minute window, daily visit hashes). A worker job copies the daily hashes into `daily_visits` every 15 minutes so history survives Redis.

**Tech Stack:** NestJS 12, Drizzle (SQL), Redis (ioredis), BullMQ, Next.js 16 route handler, inline SVG charts (no chart library).

**Spec:** `docs/superpowers/specs/2026-10-08-admin-design.md` section 3.

## Global Constraints

- CLAUDE.md code style. Days are Lagos days (`Africa/Lagos`, UTC+1).
- No cookies, no IP addresses or user ids stored for visits; the tab id is random, kept in `sessionStorage`, sent only with beacons.
- Beacons from bot user agents are ignored; one tab counts once a minute (Redis `SET NX EX 60`).
- `money.view` for money; `analytics.view` for analytics and active-now.
- Charts follow the dataviz skill (loaded before the chart task).

## Review Focus

1. A shop with no paid orders in the range → appears with zeros or not at all, never breaks totals. (Task 1 test `empty range gives zeros`.)
2. A beacon flood from one tab → still counts once a minute. (Task 3 test `one tab counts once a minute`.)
3. A refunded order → counted in sales on its paid day and in refunds on its refunded day. (Task 1 test `refunds counted on the refund day`.)
4. The copy job runs twice for the same day → counts aren't doubled. (Task 4 test `copying twice doesn't double`.)
5. Beacon endpoint called with a made-up shop slug → ignored, no error. (Task 3 test `unknown shop ignored`.)

---

### Task 1: Money API

**Files:** `apps/api/src/admin/money-admin.service.ts`, `numbers-admin.controller.ts` (`GET /admin/money?from=&to=`, `money.view`), test.

**Produces:** `{ totals: { salesKobo, itemsKobo, deliveryKobo, gbamFeesKobo, paystackFeesKobo, refundsKobo, paidOrders }, byDay: { day: "YYYY-MM-DD", salesKobo, paidOrders }[] (every day in range, zeros filled), byShop: { shopId, shopName, salesKobo, paidOrders, gbamFeesKobo }[] (top 50 by sales) }`. A sale = a successful payment, dated by the order's `paid` event; a refund = an order's `refunded` event, amount = its successful payment. Range defaults to the last 30 days; at most 366 days.

**Tests:** `totals and per-shop for paid orders`; `empty range gives zeros`; `refunds counted on the refund day`; `needs money.view`.

### Task 2: Analytics API (database part)

**Files:** `apps/api/src/admin/analytics-admin.service.ts`, controller route `GET /admin/analytics?from=&to=` (`analytics.view`), test.

**Produces:** `{ funnel: { week: "YYYY-MM-DD", signedUp, verified, firstProduct, bankAccount, firstPaidOrder }[], activeShops: { last7: number, last30: number }, orders: { placed, paid, expired, cancelled, paidRate, averageOrderKobo }, topShops: { shopId, shopName, paidOrders }[], visits: { day, storefront, product, checkout }[], visitFunnel: { visits, orders, paid } }`. "expired" = cancelled by the system actor.

**Tests:** `funnel counts a new seller through each step`; `active shops counts paid orders in the window`; `expired vs cancelled`; `visits read from daily_visits`.

### Task 3: Beacon and active-now (API)

**Files:** `apps/api/src/platform/beat.controller.ts` (`POST /beat`, public, `{ tabId: 16–64 url-safe chars, kind: "storefront"|"product"|"checkout"|"dashboard"|"admin", shop?: slug, first: boolean }`), `apps/api/src/platform/visits.service.ts`, admin route `GET /admin/active` (`analytics.view`); test.

**Rules:** bot user agents (`bot|crawl|spider|slurp|preview|monitor` case-insensitive) → 204 and nothing counted. `SET beat:{tabId} NX EX 60` gates counting. Active: `ZADD active:{kind} now "{tabId}|{slug}"`, entries older than 120 s removed on read. Visits: when `first`, `HINCRBY visits:{lagosDay} "{sellerId or 'none'}:{kind}" 1`, key expires after 3 days. Unknown shop slug → counted under none for active, not for visits.

**Produces:** `GET /admin/active` → `{ sellersInDashboard, shoppers, checkout, admins, topShops: { slug, count }[] }`.

**Tests:** `a beat shows in active now`; `one tab counts once a minute`; `bots are ignored`; `unknown shop ignored`; `active entries expire after 2 minutes`.

### Task 4: Copy visits to the database

**Files:** db `daily_visits` (day date, seller_id null → sellers cascade, kind text, visits int; unique (day, seller_id, kind) with NULLS NOT DISTINCT), migration; `apps/api/src/platform/visits-copy.queue.ts` + processor (every 15 min, copies today and yesterday, upsert = replace the count), worker registration; test.

**Tests:** `copies the day's counters`; `copying twice doesn't double`.

### Task 5: Web beacon

**Files:** `apps/web/app/api/beat/route.ts` (forwards to the API with the visitor IP header; always 204), `apps/web/components/beacon.tsx` (client: on mount + every 60 s while the tab is visible), used in the storefront page, product page, order page, dashboard layout and admin layout; tests.

**Tests:** `sends a first beat then one a minute while visible`; `no beats while hidden`; `route forwards and always answers 204`.

### Task 6: Admin Money and Analytics screens

**Files:** `app/admin/(signed-in)/money/page.tsx`, `analytics/page.tsx`, `components/admin/bar-chart.tsx` (inline SVG, per the dataviz skill), `components/admin/active-now.tsx` (client, refreshes every 5 s via a server action), range picker (today / 7 / 30 days / custom via `?from=&to=`), nav items (Money → money.view, Analytics → analytics.view), overview tile "Today's sales" for money.view; tests.

**Tests:** `money page shows totals and the per-shop table`; `range presets set from/to`; `bar chart labels each day and has a text summary`; `active now refreshes`; `nav shows Money and Analytics by permission`.
