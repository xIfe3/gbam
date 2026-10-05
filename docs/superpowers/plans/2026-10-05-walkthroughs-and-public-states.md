# Walkthroughs and Public States Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Three resumable, never-repeating seller tours (dashboard, editor, order) with a "?" replay, a one-time customer ordering tip, and loading/empty/error states on every public content page.

**Architecture:** A `seller_tours` table (one row per seller per tour, step + final outcome) behind a small NestJS `ToursModule`; the web gets a `TourCard` bottom card driven by a `useTour` hook, with progress saved through server actions. Public content routes get `loading.tsx` skeletons and the existing `ContentUnavailable` card gains Try again.

**Tech Stack:** NestJS 12, Drizzle + Postgres, Zod 4 (`@gbam/shared`), Next.js 16 App Router, Tailwind 4, vitest.

**Spec:** `docs/superpowers/specs/2026-10-05-walkthroughs-and-public-states-design.md`

## Global Constraints

- CLAUDE.md plain-code rules (async/await + try/catch, if/else, for loops, no `!`, no `??=`, "why" comments for new concepts).
- Brand tokens only; 360 px, 44 px tap targets, visible focus rings; reuse `components/brand/skeleton.tsx` and `empty-state.tsx`.
- `TOUR_STEPS = { dashboard: 4, editor: 5, order: 3 }` lives in `@gbam/shared`; nothing else hard-codes step counts.
- A tour row's `outcome`, once set, is never changed by any code path; there is no delete endpoint.
- Replay ("?") never calls the API.
- Customer tip key: localStorage `gbam-tip-ordering` = `"seen"`; every access in try/catch.
- `pnpm turbo run build typecheck lint test` passes before each commit.

## Review Focus

1. Two devices finishing the same tour at once → exactly one outcome stored (SQL `ON CONFLICT … WHERE outcome IS NULL`). Test in Task 2.
2. A step save arriving after the tour was finished (slow network) must not reopen it. Test in Task 2.
3. Saved step larger than a shortened tour → resume on the last step, never crash. Test in Task 3.
4. Save fails (offline) → the tour still moves. Test in Task 3.
5. localStorage throws (private mode) → customer tip still renders and Got it hides it for the session. Test in Task 5.

---

### Task 1: Shared tour constants + `seller_tours` table

**Files:** `packages/shared/src/tours.ts` (+ test), `packages/shared/src/index.ts`, `packages/db/src/schema.ts`, generated migration `packages/db/migrations/0009_*.sql`.

**Produces:** `TOUR_NAMES = ["dashboard","editor","order"] as const`, `type TourName`, `TOUR_STEPS: Record<TourName, number>`, `tourNameSchema`, `tourOutcomeSchema = z.enum(["completed","skipped"])`, `tourStepSchema(tour)` (int 1..TOUR_STEPS[tour]); table `sellerTours` (`id`, `sellerId` cascade, `tour` text, `currentStep` int default 1, `outcome` text nullable, `createdAt`, `updatedAt`) with unique (`seller_id`,`tour`).

- [ ] Failing tests: `tourStepSchema("editor")` accepts 1 and 5, rejects 0 and 6; `tourNameSchema` rejects `"nope"`.
- [ ] Implement, `pnpm db:generate`, `pnpm db:migrate`; tests pass; commit.

### Task 2: API `ToursModule`

**Files:** `apps/api/src/tours/tours.service.ts`, `tours.controller.ts`, `tours.module.ts`, `tours.test.ts`; register in `app.module.ts`.

**Produces:** `GET /tours` → `Record<TourName, { step: number; outcome: "completed"|"skipped"|null }>` (only started tours); `PUT /tours/:tour/step` `{ step }` → `{ step, outcome }`; `POST /tours/:tour/finish` `{ outcome }` → `{ step, outcome }`. SessionGuard (verified), `@CurrentSellerId()`.

- `saveStep`: `INSERT … ON CONFLICT (seller_id, tour) DO UPDATE SET current_step = $step, updated_at = now() WHERE seller_tours.outcome IS NULL`, then select the row.
- `finish`: `INSERT … (outcome) ON CONFLICT DO UPDATE SET outcome = $outcome, updated_at = now() WHERE seller_tours.outcome IS NULL`, then select.

- [ ] Failing HTTP tests: step save + back/forward; finish completed; step after finish leaves step and outcome unchanged *(RF2)*; second finish (skipped after completed) keeps `completed`; `Promise.all` of two finishes → one outcome *(RF1)*; step 0 / step 6 on editor → 400; unknown tour → 400; seller B can't see A's tours; unverified → 403.
- [ ] Implement; tests pass; full check; commit.

### Task 3: Web tour engine

**Files:** `apps/web/lib/api.ts` (`getTours`, `saveTourStep`, `finishTour` + `TourState` type), `apps/web/app/dashboard/tours/actions.ts` (+ test), `apps/web/app/dashboard/tours/use-tour.ts`, `tour-card.tsx` (+ test), `tour-steps.ts` (copy + `target` ids).

**Produces:** `useTour({ tour, steps, initialStep, autoStart, replay })` → `{ open, step, next, back, skip, done, start }`; `TourCard` (bottom card, `role="dialog"`, dots "N of M", Skip tour / Back / Next / Done, Esc = skip, focus on open, glow + scrollIntoView on `[data-tour="<target>"]` via a `data-tour-active` attribute styled in globals.css).

- [ ] Failing tests: resumes at `initialStep`; saved step > steps.length → last step *(RF3)*; Next/Back call `saveTourStepAction` with the new step; a rejected save still advances *(RF4)*; Skip → `finishTourAction("skipped")`, Done → `"completed"`; replay calls nothing; Esc skips; target gets `data-tour-active`.
- [ ] Implement; tests pass; full check; commit.

### Task 4: Wire the three seller tours + "?" button

**Files:** `apps/web/app/dashboard/layout.tsx` (fetch tours with currentUser; provide via `ToursProvider` context), `apps/web/app/dashboard/tours/tours-provider.tsx`, `help-button.tsx`; add `data-tour` attributes on the dashboard nav/orders list/copy link/add product, editor photo picker/details/options toggle/variant cards/stock, order status actions; mount `<PageTour tour="…">` on `/dashboard`, `/dashboard/products/new`, `/dashboard/products/[id]`, `/dashboard/orders/[id]`.

- [ ] Failing tests: page auto-opens its tour when state has no outcome; does not when completed/skipped; "?" replays the current page's tour from step 1; "?" on a page without a tour links to `/help`.
- [ ] Implement; tests pass; full check; commit.

### Task 5: Customer ordering tip

**Files:** `apps/web/app/[slug]/[product]/ordering-tip.tsx` (+ test), render in `product-view.tsx`.

- [ ] Failing tests: shows when no flag; Got it hides and writes `"seen"`; not shown when flag is `"seen"`; storage throwing → renders and Got it still hides *(RF5)*; not shown before hydration (no flash).
- [ ] Implement; tests pass; full check; commit.

### Task 6: Public loading, empty and error states

**Files:** `loading.tsx` for `(marketing)/help`, `help/[slug]`, `blog`, `blog/[slug]`, `faq`, `changelog`, `legal/[doc]` (shared `ArticleSkeleton`, `ListSkeleton` in skeleton.tsx); empty states via `EmptyState` in blog, changelog, help, faq pages; `ContentUnavailable` gets a client Try again button (`router.refresh()`).

- [ ] Failing tests: each loading screen announces itself; each page's empty state text when the API returns `[]`; `ContentUnavailable` renders Try again which calls `router.refresh`.
- [ ] Implement; tests pass; full check; commit.

### Task 7: Form pending audit

Login, signup, verify (incl. resend), get-paid, forgot/reset already use `SubmitButton`; verify the resend/ghost buttons and the contact form button show a pending state and disable while submitting; fix any that don't, with a test each. Full check; commit.
