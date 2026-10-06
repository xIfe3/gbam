# Order Tracking Implementation Plan

> Executed inline (superpowers:executing-plans), owner's choice.

**Goal:** Customers find, pay for, and report problems with an order without an account; sellers see and resolve problems.
**Spec:** `docs/superpowers/specs/2026-10-06-order-tracking-design.md`

## Global Constraints
- CLAUDE.md plain-code rules; brand tokens; 360 px; 44 px targets.
- Same "not found" answer for every failed lookup; rate limits as in the spec.
- The tracking view never exposes customer name/phone, payment raw data or internal ids.
- `pnpm turbo run build typecheck lint test` green before merge.

### Task 1: Data
`orders.tracking_key` (unique, backfilled), `orders.customer_email`, `order_issues` table + `issue_reason` enum; migration 0010. Test: migration backfills a key for existing orders.

### Task 2: API
`TrackingModule` (lookup, view, pay, issues) with rate limits; order creation returns `trackingKey`, accepts optional email and queues `order_receipt`; `issue_reported` email to the seller; seller `issues` on order detail, `openIssues` on list, resolve endpoint. HTTP integration tests per spec.

### Task 3: Web
`/track` + `/track/[code]`; order-placed screen (big code, copy link, remember); checkout email field; "Track an order" footer links; dashboard pill + Customer problems box. Component tests per spec.
