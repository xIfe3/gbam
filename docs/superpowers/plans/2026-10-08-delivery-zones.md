# Delivery Zones Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every order gets a delivery address, and sellers can charge for delivery upfront through delivery zones.

**Architecture:** A `delivery_zones` table per seller, edited from Settings. The storefront sends the
zones to checkout; the customer picks one and the API re-reads its price inside the order
transaction and copies a snapshot (name, fee, pickup, address, landmark) onto the order.
`total = subtotal + delivery`, and Gbam's fee is worked out on the subtotal.

**Tech Stack:** NestJS 12, Drizzle (Postgres), Zod (packages/shared), Next.js 16 server actions, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-delivery-zones-design.md`

## Global Constraints

- Code style: CLAUDE.md "plain over clever" (if/else, for loops, no `!`, no nested ternaries, comment new concepts).
- Money is integer kobo. Zone fees are whole naira (fee_kobo divisible by 100), ≥ 0.
- Limits: 20 live zones per shop; zone name 1–60 chars; pickup note ≤ 300; address 5–300; landmark ≤ 200.
- The browser sends only `zoneId` + `expectedFeeKobo`; the price always comes from the database.
- Old orders never change when a zone is edited or removed (snapshot columns).
- Gbam's fee: `calculatePlatformFee(subtotalKobo, …)`.
- Run `pnpm turbo run build typecheck lint test` before calling a task done; tests use Redis db 1.

## Review Focus

1. A shop deletes its last zone while a customer has checkout open → the order must be refused with "That delivery option isn't available any more…", not placed with no fee. (Task 4 test `zone removed while checking out`.)
2. A customer picks a pickup zone but the form still carries an address they typed earlier → stored as null. (Task 4 test `pickup ignores a typed address`.)
3. Two zones named "Lekki" and "lekki " → refused as duplicates. (Task 3 test `duplicate names refused ignoring case and spaces`.)
4. An old order (placed before this change, `delivery_address` null, zone null) opens in the dashboard, tracking and pay pages without crashing and shows no delivery box. (Task 8 test `old order without delivery`.)
5. Fee ₦0 delivery zone (free delivery, not pickup) → address still required, fee line shows "Free". (Task 4 test `free delivery zone still needs address`; Task 7 test.)

---

### Task 1: Shared delivery schemas

**Files:**
- Create: `packages/shared/src/delivery.ts`, `packages/shared/src/delivery.test.ts`
- Modify: `packages/shared/src/index.ts`, `packages/shared/src/schemas.ts` (`createOrderSchema`)

**Interfaces:**
- Produces:
  - `DELIVERY_LIMITS = { maxZones: 20, nameMax: 60, pickupNoteMax: 300, addressMin: 5, addressMax: 300, landmarkMax: 200 }`
  - `deliveryZoneInputSchema`: `{ id?: uuid, name: string(trimmed 1–60), feeKobo: int ≥0, multiple of 100, isPickup: boolean }`
  - `deliverySettingsSchema`: `{ zones: deliveryZoneInputSchema[] (max 20, unique names case-insensitive after trim), pickupNote: string | null (trimmed, ≤300, "" → null) }`; types `DeliveryZoneInput`, `DeliverySettingsInput`
  - `orderDeliverySchema`: `{ zoneId: uuid | null, expectedFeeKobo: int ≥0 | null, address: string | null (trimmed, "" → null, ≤300), landmark: string | null (trimmed, "" → null, ≤200) }`
  - `createOrderSchema` gains `delivery: orderDeliverySchema` (required).
- [ ] Step 1: tests — `accepts a valid zone list`; `duplicate names refused ignoring case and spaces` (["Lekki", " lekki"] → error on `zones`); `refuses 21 zones`; `refuses a fee that isn't whole naira` (150050); `blank pickup note becomes null`; `orderDelivery blank address and landmark become null`; `address longer than 300 refused`.
- [ ] Step 2: run `pnpm --filter @gbam/shared test` → FAIL (module missing).
- [ ] Step 3: implement; export from index.
- [ ] Step 4: tests pass; `pnpm --filter @gbam/shared build`.
- [ ] Step 5: commit `feat(shared): delivery zone and order delivery schemas`.

### Task 2: Database

**Files:**
- Modify: `packages/db/src/schema.ts`
- Create: migration via `pnpm --filter @gbam/db drizzle-kit generate --name delivery_zones`, then hand-add the backfill.

**Interfaces:**
- Produces: table `deliveryZones` (id, sellerId → sellers cascade, name, feeKobo integer, isPickup boolean default false, sortOrder integer, archivedAt nullable, createdAt, updatedAt; index on sellerId); `sellers.pickupNote` text null; `orders.subtotalKobo` (bigint, not null), `orders.deliveryFeeKobo` (bigint not null default 0), `orders.deliveryZoneName` text null, `orders.deliveryIsPickup` boolean not null default false, `orders.deliveryAddress` text null, `orders.deliveryLandmark` text null; relation `sellers → deliveryZones`.
- Migration order for `subtotal_kobo`: add nullable → `UPDATE orders SET subtotal_kobo = total_kobo` → set NOT NULL.
- [ ] Step 1: edit schema; generate; edit SQL for the backfill.
- [ ] Step 2: `pnpm db:migrate`; check with psql that existing orders have subtotal = total.
- [ ] Step 3: build db; run existing API order tests (they must still pass once Task 4 supplies subtotal; until then `insertOrder` sets `subtotalKobo: totalKobo`).
- [ ] Step 4: commit `feat(db): delivery zones, pickup note, order delivery snapshot`.

### Task 3: Seller delivery settings API + storefront zones

**Files:**
- Create: `apps/api/src/settings/delivery.service.ts`, `apps/api/src/settings/delivery.test.ts`
- Modify: `apps/api/src/settings/settings.controller.ts`, `settings.module.ts`, `apps/api/src/products/storefront.service.ts` (`list` returns zones)

**Interfaces:**
- Produces:
  - `DeliveryService.get(sellerId): Promise<DeliverySettings>` where `DeliverySettings = { zones: { id, name, feeKobo, isPickup }[] (live, by sortOrder), pickupNote: string | null }`
  - `DeliveryService.save(sellerId, input: DeliverySettingsInput): Promise<DeliverySettings>` — in one transaction: zones with an `id` belonging to this seller are updated; new ones inserted; live zones missing from the list get `archivedAt = now`; `sortOrder` = list position. An `id` from another shop → 404.
  - `GET /settings/delivery`, `PUT /settings/delivery` (SessionGuard, ZodPipe(deliverySettingsSchema)).
  - Storefront `list(slug)` response: `store` gains `delivery: { zones: {id,name,feeKobo,isPickup}[], pickupNote: string | null }`.
- [ ] Step 1: tests — `saves, reorders and removes zones`; `removed zone is archived not deleted`; `another shop's zone id → NotFoundException`; `duplicate names refused ignoring case and spaces` (schema-level, via service input); `storefront lists only live zones in order`.
- [ ] Step 2–4: fail → implement → pass.
- [ ] Step 5: commit `feat(api): seller delivery zones and pickup note`.

### Task 4: Orders take delivery

**Files:**
- Modify: `apps/api/src/orders/orders.service.ts` (`insertOrder`), `apps/api/src/payments/payments.service.ts` (fee on subtotal)
- Test: `apps/api/src/orders/delivery-orders.test.ts`, `apps/api/src/payments/payments.service.test.ts` (fee case)

**Interfaces:**
- Consumes: `orderDeliverySchema` (Task 1), `deliveryZones` (Task 2).
- Rules inside the existing transaction, after items are priced (spec "Server checks"):
  1. Live zones exist and `zoneId` null → `BadRequestException({ field: "delivery", message: "Choose a delivery option" })`.
  2. `zoneId` not a live zone of this seller → `ConflictException({ field: "delivery", message: "That delivery option isn't available any more. Please pick another." })`.
  3. `fee_kobo !== expectedFeeKobo` → `ConflictException({ field: "delivery", message: "Delivery to {name} is now {formatNaira(fee)}. Please check and confirm." })`.
  4. Not pickup and no address → `BadRequestException({ field: "address", message: "Enter the delivery address" })`.
  5. Pickup → address and landmark stored null.
  - Order row: `subtotalKobo`, `deliveryFeeKobo`, `totalKobo = subtotal + fee`, snapshot columns.
- [ ] Step 1: tests — `order with a zone stores snapshot and total`; `changed fee is refused with the new price`; `zone removed while checking out`; `another shop's zone refused`; `pickup ignores a typed address`; `free delivery zone still needs address`; `no zones: address required, fee 0`; `editing a zone later does not change the order`; payments: `platform fee is calculated on the subtotal only`.
- [ ] Step 2: update existing test helpers/calls (`createFromStorefront` inputs in all API tests) to pass `delivery: { zoneId: null, expectedFeeKobo: null, address: "12 Test Street", landmark: null }`.
- [ ] Step 3–4: implement → all API tests pass.
- [ ] Step 5: commit `feat(api): delivery fee and address on orders; Gbam fee on items only`.

### Task 5: Delivery in API responses and emails

**Files:**
- Modify: `apps/api/src/tracking/tracking.service.ts` (public order view), `apps/api/src/email/templates.ts` (`order_receipt`, `payment_confirmed`, `new_order` get `subtotalKobo`, `deliveryFeeKobo`, `deliveryLabel: string | null`), `apps/api/src/orders/orders.service.ts` (fill them), tests in `templates.test.ts` and `tracking` tests.

**Interfaces:**
- Produces: tracking view gains `subtotalKobo`, `deliveryFeeKobo`, `delivery: { zoneName, isPickup, address, landmark, pickupNote } | null` (null when the order has no zone and no address). `deliveryLabel` = zone name, "Pickup" for pickup, null when no zone.
- Email copy: a line "Items ₦X · Delivery (Lekki) ₦Y · Total ₦Z"; "Free" when fee 0; omitted delivery part when `deliveryLabel` null and fee 0.
- [ ] Steps: tests (`receipt shows delivery line`, `receipt without zone shows total only`, tracking `includes delivery for a zone order`, `old order without delivery` → `delivery: null`) → implement → pass → commit `feat(api): delivery on tracking and emails`.

### Task 6: Settings → Delivery (web)

**Files:**
- Create: `apps/web/app/dashboard/settings/delivery-form.tsx`, test `delivery-form.test.tsx`
- Modify: `apps/web/lib/api.ts` (`getDeliverySettings`, `saveDeliverySettings`, types), `apps/web/app/dashboard/settings/actions.ts` (`saveDeliveryAction`), `actions.test.ts`, `page.tsx` (Delivery section after "Getting paid")

**Interfaces:**
- `saveDeliveryAction(prev: FormState, formData: FormData): Promise<FormState>` reads `zones` (hidden JSON field built by the form: `{id?, name, fee (naira text), isPickup}[]`) and `pickupNote`; converts fee with `parseNairaInput`; validates with `deliverySettingsSchema`; field errors keyed `zones` / `pickupNote`.
- Form: rows with Name, Fee (₦), "Pickup" checkbox, ↑/↓ reorder, Remove; "Add zone" (disabled at 20); pickup note textarea shown when any zone is pickup; Save.
- [ ] Steps: tests (`adds and removes rows`, `pickup note appears only with a pickup zone`, action `converts naira and saves`, action `shows a bad fee on the zones field`) → implement → pass → commit `feat(web): delivery zones in settings`.

### Task 7: Checkout delivery (web)

**Files:**
- Modify: `apps/web/app/[slug]/order/page.tsx` (pass `store.delivery`), `basket-view.tsx`, `basket-view.test.tsx`, `apps/web/app/[slug]/actions.ts` (+ its test), `apps/web/lib/api.ts` (`Storefront.store.delivery`)

**Interfaces:**
- `BasketView` props gain `delivery: { zones: {id,name,feeKobo,isPickup}[], pickupNote: string | null }`.
- Form fields: radio group `zoneId` (only when zones exist, none preselected), hidden `expectedFeeKobo` (fee of the picked zone), `address`, `landmark` (hidden for pickup; required otherwise), live summary "Items · Delivery · Total", submit label uses the total.
- `placeOrder` builds `delivery` for `createOrderSchema`; API 409 with `field: "delivery"` shows next to the zones; `values` returned on error include `zoneId`, `address`, `landmark`.
- Success state `totalKobo` already returned by the API (now includes delivery).
- [ ] Steps: tests (`shows zones with prices, none picked`, `pickup hides address and shows pickup note`, `total updates with the picked zone`, `free zone shows Free`, `no zones: address only`, action `sends zone id and expected fee`, action `puts a delivery 409 on the delivery field`) → implement → pass → commit `feat(web): delivery choice and address at checkout`.

### Task 8: Delivery on pay, tracking and dashboard pages

**Files:**
- Modify: `apps/web/app/pay/[code]/page.tsx`, `apps/web/app/track/[code]/page.tsx`, `apps/web/app/dashboard/orders/[id]/page.tsx` (Delivery box + `CopyLinkButton` reused as "Copy address"), `apps/web/app/dashboard/page.tsx` (banner when no zones), `apps/web/lib/api.ts` types; tests beside each.

**Interfaces:**
- Consumes: Task 5 tracking fields; seller order detail already returns all order columns.
- Dashboard banner copy: "Add delivery zones so customers pay for delivery when they order." linking `/dashboard/settings#delivery`; shown when `getDeliverySettings().zones.length === 0`.
- [ ] Steps: tests (`pay page shows items, delivery, total`, `track page shows pickup note for pickup`, `seller order shows address with copy button`, `old order without delivery` renders no delivery box, `dashboard shows the banner only without zones`) → implement → pass → full `pnpm turbo run build typecheck lint test` → commit `feat(web): delivery on pay, tracking and order pages; zones banner`.
