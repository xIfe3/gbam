# Order tracking: design

Date: 2026-10-06 · Status: approved in chat

## Goal

A customer can find their order again without an account: see where it is, finish paying,
message the seller, or report a problem. Sellers see and resolve reported problems.

## Decisions (owner)

| Topic | Decision |
|---|---|
| Page can | Timeline + items/total (A), WhatsApp the seller + report a problem (B), Pay now while awaiting payment (C). |
| Getting there | `/track` form (order code + last 4 phone digits) and a private link `/track/<code>?k=<key>` that opens straight in. |
| Without WhatsApp | (1) big code + Copy tracking link on the order-placed screen; (2) the phone remembers its orders (localStorage, "Your orders on this phone"); (3) optional email at checkout → receipt with code + link. SMS later. |
| Problem alerts | Dashboard label + email to the seller now; WhatsApp to seller once a Meta template is approved. |
| Reasons | Paid but it shows unpaid · Haven't received my order · Wrong or damaged item · Something else (+ note ≤ 500). |

## Data

- `orders.tracking_key` text, unique, NOT NULL: 32 random bytes, base64url. Existing orders get one in the migration.
  Kept in plain text (not hashed) because later notifications must be able to rebuild the link; it only opens its own order.
- `orders.customer_email` text, nullable.
- `order_issues`: `id`, `order_id` (cascade), `reason` enum (`paid_not_marked`, `not_received`, `wrong_or_damaged`, `other`), `note` text nullable, `created_at`, `resolved_at` nullable.

Order codes are unique per shop only (`orders_seller_code_uq`), so the private link finds the
order by its key (unique everywhere) and checks the code in the URL matches; the `/track` form
matches code + last 4 phone digits and, in the unlikely case of two shops sharing both, opens
the newest.

## API

Public (rate-limited by visitor IP via the existing trusted x-client-ip):
- `POST /track/lookup` `{ code, phoneLast4 }` → `{ code, key }` or 404 "We couldn't find an order with that code and phone number" (same answer for every miss). 10 per 15 min per IP.
- `GET /track/:code?key=` (order found by key, code must match) → `{ shop: { slug, businessName, whatsappPhone }, order: { code, status, totalKobo, createdAt, items[{ productName, variantTitle, unitPriceKobo, quantity }], events[{ toStatus, createdAt }] }, issues[{ reason, createdAt, resolved }], canPay }`. Wrong key → 404. Never returns customer phone/name, payments raw, or internal ids.
- `POST /track/:code/pay?key=` → `{ url }` via `PaymentsService.ensurePaymentLink` only when status is `awaiting_payment` (else 409).
- `POST /track/:code/issues?key=` `{ reason, note? }` → 201; max 3 per order per hour (429); emails the seller's owner account.

Order creation: `createOrderSchema` gets optional `customer.email`; the response includes `trackingKey`; when an email is given an `order_receipt` email job is queued.

Seller (SessionGuard): `GET /orders/:id` includes `issues`; `GET /orders` items include `openIssues` count; `PATCH /orders/:id/issues/:issueId/resolve`.

## Web

- `/track` (form + "Your orders on this phone"), `/track/[code]` (needs `?k=`; timeline, items, total, Pay now, WhatsApp seller, report form).
- Order-placed screen: big code, Copy tracking link, screenshot hint; saves `{ code, key, shopSlug, businessName, placedAt }` to localStorage `gbam-my-orders` (try/catch, newest first, max 20).
- Checkout: optional Email field.
- Footers: "Track an order" on shop pages and the marketing footer.
- Dashboard: "Problem reported" pill on orders with open issues; "Customer problems" box with Mark resolved on the order page.
- Tracking link base comes from `NEXT_PUBLIC_SITE_URL` (web) / `WEB_URL` (API, for emails).

## Out of scope

SMS; WhatsApp template changes (needs Meta approval; owner action); refunds.

## Tests

Lookup needs both code and last 4 digits and answers identically on misses; the key opens only its own order; pay only when awaiting payment; issue rate limit + seller email; seller isolation on issues; receipt email queued only with an email; browser order list survives storage errors; full `pnpm turbo run build typecheck lint test`.
