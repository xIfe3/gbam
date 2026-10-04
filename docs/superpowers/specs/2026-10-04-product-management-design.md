# Product management: design

Date: 2026-10-04 · Status: approved in brainstorming, awaiting spec review

## 1. Goal

Sellers add and manage their own products (photos, options, variants, price, stock) from the
dashboard, and customers browse and order them on the storefront, so the owner never edits
the database by hand.

**Success:** a new seller signs up, adds products with photos and variants, shares a product
link on WhatsApp, and a customer orders a specific variant and pays, with nobody's help.

### Decisions made with the owner

| Topic | Decision |
|---|---|
| Photos | Required: 1 to 4 per product; position 1 is the main photo. |
| Variants | Full variants: up to 3 options; each combination has its own price and stock. |
| Stock reduces | When payment is confirmed (Paystack webhook). |
| Variant photos | Optional: a variant may link to one of its product's photos. |
| Photo pipeline | Upload through our API; API resizes with `sharp`; stored in Cloudflare R2 (local folder in dev). |
| Dashboard list | List rows with thumbnail, name, price, stock, status (mockup B). |
| Add / edit | Add = 3 steps (photos + details → options → variant cards). Edit = one page with variant cards. |
| Storefront | Each product has its own page and shareable link; basket carried between pages. |

### Out of scope (later)

Reserving stock at order time, order expiry, refunds through Paystack's API, product
categories/collections, discounts, bulk import, per-variant weight/shipping, the super-admin.

## 2. Data model

All changes go in one Drizzle migration in `packages/db`.

### `products` (changed)

| Column | Notes |
|---|---|
| `id`, `seller_id`, `name`, `description`, `created_at`, `updated_at` | Unchanged. |
| `slug` | New. Text, made from the name at creation (`ankara-wrap-dress`, then `-2`, `-3` on clashes). Unique per seller: unique index on (`seller_id`, `slug`). **Never changes after creation**, so shared links keep working. `order` is reserved. |
| `status` | New. `active` / `hidden` / `archived`. Replaces `is_active` (true → `active`, false → `hidden`). |
| `version` | New. Integer, starts at 1, +1 on every save. Used to refuse a save based on a stale copy. |
| `price_kobo`, `stock`, `is_active` | Removed after the data migration (moved to variants). |

### `product_options` (new)

`id`, `product_id` (cascade delete), `name` (e.g. "Size"), `values` (text array, e.g.
`{S,M,L}`), `position`. Max 3 per product, names unique within a product, 1–20 values each,
values unique within an option.

### `product_variants` (new)

| Column | Notes |
|---|---|
| `id`, `product_id` (cascade delete), `position` | |
| `option_values` | Text array, one value per option, in option order (e.g. `{M,Red}`). Empty array for the default variant. Unique per product. |
| `title` | Display name made from the values: "M / Red". Empty for the default variant. |
| `price_kobo` | ≥ 10000 (₦100). |
| `stock` | Nullable integer ≥ 0. `null` = not tracked. |
| `image_id` | Nullable, references `product_images` (set null on delete). Must belong to the same product. |
| `is_enabled` | Seller can switch one combination off without deleting it. |
| `archived_at` | Set instead of deleting when the variant appears on an order. |

A product without options has exactly one **default variant** (`option_values = {}`), so every
order item references a variant. Max 50 variants per product.

### `product_images` (new)

`id`, `seller_id`, `product_id` (nullable until the product is saved; cascade delete),
`position`, `large_key`, `small_key` (storage keys), `width`, `height`, `created_at`.
A daily cleanup job deletes rows (and their files) with `product_id IS NULL` older than 24 h.

### `order_items` (changed)

Add `variant_id` (references `product_variants`, set null on delete) and `variant_title`
(snapshot, e.g. "M / Red"; empty for default variants). Existing `product_name` and
`unit_price_kobo` snapshots stay.

### `orders` (changed)

Add `stock_shortfall` boolean, default false: set when payment is confirmed but a tracked
variant didn't have enough stock.

### Data migration

For every existing product: insert one default variant carrying its `price_kobo` and `stock`;
set `status` from `is_active`; generate `slug`. Backfill `order_items.variant_id` with that
default variant where `product_id` matches. Then drop the old columns. Existing products keep
working with no photo (the 1-photo minimum is enforced on create and edit only).

## 3. API

### Seller endpoints

All use `SessionGuard` and require a verified email. Every query filters by the seller's id.

| Endpoint | Purpose |
|---|---|
| `POST /products/images` | Multipart upload of one photo → `{ id, smallUrl }`. |
| `DELETE /products/images/:id` | Remove an unattached photo. |
| `GET /products` | List (not archived): main photo, name, price range, total tracked stock, variant count, status. |
| `GET /products/:id` | Full product for editing: photos, options, variants, `version`. |
| `POST /products` | Create from the full product (below). |
| `PUT /products/:id` | Replace with the full product; body includes `version`. |
| `PATCH /products/:id/status` | `active` / `hidden` / `archived`. |
| `DELETE /products/:id` | Hard-delete if never ordered; otherwise archive. |

**Full product body** (one Zod schema in `@gbam/shared`, used by the API and the web form):
`name`, `description?`, `imageIds` (1–4, in display order), `options` (0–3 of
`{ name, values[] }`), `variants` (1–50 of `{ id?, optionValues[], priceKobo, stock|null,
imageId|null, isEnabled }`), and `version` on `PUT`.

**Rules checked:** every image belongs to this seller and is unattached or already on this
product; each variant's `optionValues` matches the options (one value per option, each value
exists); no duplicate combinations; with no options there is exactly one variant with
`optionValues = []`; prices ≥ ₦100; stock null or ≥ 0; a variant's `imageId` is in `imageIds`.

**Saving** runs in one transaction. On `PUT`: refuse with 409 if `version` differs; variants
are matched by `id`, new ones inserted, changed ones updated, missing ones deleted, or
archived if they appear on an order; images no longer listed are detached and deleted.

### Photo pipeline

1. A Next server action receives the file (body size limit raised to 10 MB) and forwards it
   to the API as multipart.
2. The API reads the real file type from its content: JPEG, PNG, WebP or HEIC only; ≤ 10 MB.
3. `sharp` rotates it upright (EXIF orientation), strips all metadata including GPS, and writes
   two WebP files: large (longest side 1600 px) and small (400 px).
4. Both are saved through a `PhotoStorage` interface under random keys:
   `R2PhotoStorage` (S3-compatible API) in production, `LocalPhotoStorage` (a folder, served by
   the API at `/photos/*`) in development and tests. Same pattern as `EmailClient`.
5. Public URLs come from `PHOTOS_PUBLIC_URL` (e.g. `https://photos.gbam.app`).
6. Rate limit: 60 uploads per hour per seller.

### Public endpoints

- `GET /storefront/:slug` → shop + active products: slug, name, main small photo, price range,
  `soldOut` (every enabled variant has stock 0).
- `GET /storefront/:slug/products/:productSlug` → one active product: photos (both sizes),
  options, enabled non-archived variants with price, stock state and image id.

### Orders and stock

- `createOrderSchema` items become `{ variantId, quantity }`.
- Order creation rejects (400, naming the item) a variant that is disabled, archived, belongs
  to a hidden/archived product or another seller, or has tracked stock below the quantity.
- In the transaction that marks the order paid (Paystack webhook), each tracked variant row is
  locked (`SELECT … FOR UPDATE`) and its stock reduced. If stock would go below 0 it stops at
  0, `orders.stock_shortfall` is set, and an error is logged ("STOCK SHORTFALL … NEEDS REFUND").

## 4. Web

### Storefront

- **`/[slug]`**: product grid: main photo, name, price ("from ₦12,000" when prices differ),
  "Sold out" label. Basket bar when the basket isn't empty. Clears the basket on `?paid=`.
- **`/[slug]/[productSlug]`**: gallery (swipe on phones, thumbnails on wide screens), option
  buttons, quantity, "Add to order". Choosing options updates price, stock text and photo;
  sold-out or disabled combinations are crossed out and can't be picked. Open Graph tags use
  the main photo, name and price so WhatsApp shows a preview.
- **`/[slug]/order`**: the basket: edit quantities, remove items, name + phone + note,
  "Place order" → existing order and Paystack flow.
- **Basket:** stored in the customer's browser (`localStorage`, one per shop; reads and writes
  wrapped in try/catch). On opening the basket it is checked against the current product data;
  removed, sold-out or repriced items are flagged before ordering.

### Dashboard

- Header nav: **Orders** · **Products**.
- **`/dashboard/products`**: list rows (thumbnail, name, variant count, price range, stock,
  status pill), "Add product", filters All / Showing / Hidden.
- **`/dashboard/products/new`**: 3 steps, state kept in the page until the final save:
  1. photos (upload on pick; reorder; first is main) + name + description;
  2. "Does it come in options?": no → one price and stock; yes → up to 3 options with values;
  3. variant cards: price, stock, photo, on/off; "Set one price for all" / "Set one stock for all".
- **`/dashboard/products/[id]`**: the same sections on one page, plus Hide/Show and Delete
  (confirm first).
- **Orders:** items show "Product – Variant"; orders with `stock_shortfall` show
  "Stock ran out: refund needed".

Mobile first (360 px), works on desktop (storefront product page goes two-column). Follows the
existing brand tokens, fonts, 44 px tap targets and focus rings.

## 5. Errors and security

- Upload failure → message + "Try again" on that photo only; nothing else lost.
- Validation errors → shown on the field/step, same rules as the API.
- Stale save → 409 "This product changed since you opened it. Reload to see the latest."
- Basket problems → listed on the basket page; ordering blocked until fixed.
- Stock shortfall after payment → order stays paid, flagged, logged.
- Every seller query scoped by seller id; another seller's ids return 404.
- Uploads: content-type sniffing, re-encode, random keys, size and rate limits.
- Storefront never returns hidden/archived products or disabled/archived variants.

## 6. Configuration

Production-required (added to `PRODUCTION_REQUIRED_KEYS`, `.env.production.example`):
`R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `PHOTOS_PUBLIC_URL`.
Optional in development (local folder used, `PHOTOS_PUBLIC_URL` defaults to the API's
`/photos`). R2 setup steps added to `docs/integrations-setup.md`.

## 7. Testing

Integration tests against real Postgres and Redis (db 1), as elsewhere.

- **API:** create/edit/hide/delete; ordered product archives instead of deleting; variant rule
  violations; version conflict; seller isolation; upload type/size/rate limits and GPS
  stripped; orphan cleanup; order refused for disabled/sold-out variants; stock reduced on
  payment; shortfall flagged; migration creates default variants and backfills order items.
- **Web:** product page option picking (price/photo update, sold-out disabled); basket persists
  across pages, revalidates, clears after payment; 3-step form errors and back-navigation keeps
  input; order pages show variant titles.
- `pnpm turbo run build typecheck lint test` passes before every commit.
