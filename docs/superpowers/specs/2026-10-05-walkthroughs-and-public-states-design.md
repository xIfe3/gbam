# Walkthroughs and public loading/empty states: design

Date: 2026-10-05 · Status: approved in brainstorming, awaiting spec review

## 1. Goal

1. New sellers get short guided tours of the confusing parts of gbam (dashboard, product
   editor with options/variants, orders). A tour never appears by itself again once the
   seller finishes or skips it, and an unfinished tour resumes on the step where they left.
2. Customers get one small tip on how to order.
3. Every public page (help, blog, FAQ, changelog, legal, auth forms) shows a loading state
   while it loads and a friendly empty state when it has nothing to show.

### Decisions made with the owner

| Topic | Decision |
|---|---|
| Who | Sellers (three tours) and customers (one tip card). |
| Seller tours | Several short tours, each shown the first time the seller reaches that part (option A). |
| Look | Bottom card with step dots, Skip / Back / Next (Done on last); the explained element glows green (mockup B). No spotlight. |
| Monotonic rule | Once a tour is completed or skipped it never shows automatically again, on any device. |
| Resume | The current step is saved on every Back/Next; reopening resumes there, on any device. Back and Next both move the saved step. |
| Replay | A "?" button in the dashboard header replays the current page's tour from step 1. Replay never saves anything. |
| Customers | No accounts, so "seen" is remembered in the browser (localStorage), one flag for all gbam shops. |
| Build | Own small component, no tour library. Progress in a `seller_tours` table. |

### Out of scope

Tours for customers beyond the single tip; analytics on tour drop-off; admin-editable tour
text (copy lives in code until the CMS project).

## 2. Data

New table `seller_tours`:

| Column | Notes |
|---|---|
| `seller_id` | references `sellers`, cascade delete |
| `tour` | text: `dashboard` \| `editor` \| `order` |
| `current_step` | integer ≥ 1 |
| `outcome` | nullable: `completed` \| `skipped`; null while in progress |
| `created_at`, `updated_at` | timestamps |

Unique index on (`seller_id`, `tour`).

Shared constant in `@gbam/shared`: `TOUR_STEPS = { dashboard: 4, editor: 5, order: 3 }` and
`tourNameSchema`.

## 3. API (SessionGuard, verified email; every query scoped to the seller)

| Endpoint | Behaviour |
|---|---|
| `GET /tours` | `{ [tour]: { step: number, outcome: "completed" \| "skipped" \| null } }` for tours the seller has started. |
| `PUT /tours/:tour/step` body `{ step }` | Upsert the row with `current_step = step` **only while `outcome` is null**; a finished tour is left unchanged (still 200). Step must be 1..TOUR_STEPS[tour] (400 otherwise). Unknown tour → 400. |
| `POST /tours/:tour/finish` body `{ outcome }` | Upsert with `outcome` **only if `outcome` is null** (`… ON CONFLICT … DO UPDATE … WHERE seller_tours.outcome IS NULL`), so concurrent finishes leave exactly one final outcome. Never changes an existing outcome. |

There is no endpoint that clears or deletes a tour row.

## 4. Web

### Tour component

- `TourCard` (client): bottom card, step dots "N of M", title, 1–2 sentences, Skip tour,
  Back, Next / Done. 44px buttons, Esc = skip, `role="dialog"` with label, focus moved to
  the card, announced to screen readers. Does not block the page.
- Steps name a target via `data-tour="<id>"`; the target gets a green glow ring and is
  scrolled into view. A missing target just shows the text.
- `useTour(tour, initial)`: holds the step; Next/Back call a server action that saves the step
  (fire-and-forget: a failed save never blocks moving); Skip / Done call finish.
- Resume: start at the saved step, clamped to the tour's current length.
- Auto-show only when the tour has no outcome. Replay mode (from "?") starts at 1 and makes no
  server calls.

### Tours and triggers

| Tour | Shown on | Steps (copy may be polished during build) |
|---|---|---|
| dashboard | `/dashboard`, first visit after onboarding (email verified) | Your orders land here · Products tab · Copy your shop link and share it on WhatsApp · Add your first product |
| editor | `/dashboard/products/new` and `/dashboard/products/[id]` | Add 1–4 photos, the first is the main one · Name, price, short description · Sizes or colours? Turn on options · Each combination has its own price and stock; switch off what you don't sell · Leave stock blank if you don't count it |
| order | `/dashboard/orders/[id]` | Request payment sends the customer a Paystack link on WhatsApp · It turns Paid by itself · Mark it sent when it's on the way |

The dashboard layout loads `GET /tours` once per render (alongside the current user) and
passes the state down.

### "?" help button

In the dashboard header: replays the current page's tour; on pages without one, links to
`/help`.

### Customer tip

On the storefront product page: one card "Pick your options → Add to order → Place order.
You'll get updates on WhatsApp." with **Got it**. Stored as `gbam-tip-ordering=seen` in
localStorage (all access in try/catch; on failure the tip simply shows each time). Never shown
again in that browser once dismissed.

### Public loading states (`loading.tsx` + shared skeleton components)

Help centre, help article, blog list, blog post, FAQ, changelog, legal page.

### Public empty and error states

- Blog with no posts: "No posts yet" + link to How it works.
- Changelog empty: "Nothing new yet. Updates will show up here."
- Help centre / category with no articles: "No articles here yet. Email support@gbam.app and
  we'll help you directly."
- FAQ empty: same pattern with a contact link.
- Content API failure on these pages: a calm "We couldn't load this right now" card with Try
  again (an `error.tsx` for the content routes), not the global error page.

### Auth and contact forms

Audit every submit button (login, signup, verify, get-paid, forgot/reset password, contact):
each shows a pending label and is disabled while submitting; fix any that don't.

## 5. Testing

- API (integration, real Postgres/Redis db 1): step save while in progress; back and forward;
  finish completed/skipped; step/finish after finish change nothing; step out of range → 400;
  unknown tour → 400; concurrent finishes → one outcome; seller isolation; unverified → 403.
- Web: tour resumes on the saved step; Next/Back call save; Skip/Done call finish; replay makes
  no calls; auto-show suppressed after outcome; customer tip hidden after Got it and when
  storage throws it still renders; each new loading screen announces itself; each empty state
  and the content error card render; auth submit buttons show pending.
- `pnpm turbo run build typecheck lint test` passes before every commit.
