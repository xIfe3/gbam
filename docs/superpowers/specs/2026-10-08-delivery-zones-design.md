# Delivery address and delivery zones: design

Date: 2026-10-08
Status: approved in chat, waiting for review of this written spec

## Why

Today an order stores only the customer's name, phone, an optional note and an optional
email. There is nowhere to say where the goods go, and delivery cost is not part of what the
customer pays. Every seller has to ask for the address on WhatsApp and collect delivery money
separately. This spec adds a delivery address to every order and lets sellers charge for
delivery upfront.

## Decisions (from the brainstorm)

| Question | Decision |
|---|---|
| How delivery fees work | **Delivery zones.** The seller lists areas, each with a price. The customer picks one. |
| What the customer types | **Street address** (required) + **Nearest landmark / directions** (optional). |
| Gbam's fee on delivery | **Items only.** Gbam's 1.5% is worked out on the items subtotal, never on delivery. |
| Shops with no zones yet | **Ask for the address, no fee.** Existing shops keep working; a banner nudges them to add zones. |

## Seller side: delivery zones

A new **Delivery** section in Settings.

- A zone has a **name** (up to 60 characters), a **fee** (whole naira, ₦0 allowed) and a
  **pickup** flag.
- A **pickup** zone means the customer collects the order. The customer gives no address and
  sees the seller's **pickup note** (one per shop, up to 300 characters, e.g. "Shop 12,
  Balogun Market, after 10am").
- Up to **20 zones** per shop. The seller can add, edit, reorder and remove them.
- Removing a zone hides it from checkout. Old orders are never changed (see "Snapshots").

## Data

New table `delivery_zones`:

| Column | Type | Notes |
|---|---|---|
| id | uuid | |
| seller_id | uuid → sellers | cascade on delete |
| name | text | trimmed, 1–60 chars, unique per shop among live zones (case-insensitive) |
| fee_kobo | integer | ≥ 0, whole naira |
| is_pickup | boolean | default false |
| sort_order | integer | the order the seller chose |
| archived_at | timestamptz null | set when the seller removes it |
| created_at / updated_at | timestamptz | |

New column on `sellers`: `pickup_note text null`.

New columns on `orders` (the **snapshot**, copied when the order is placed):

| Column | Type | Notes |
|---|---|---|
| subtotal_kobo | bigint | items only. Backfilled to `total_kobo` for existing orders. |
| delivery_fee_kobo | bigint | default 0 |
| delivery_zone_name | text null | null when the shop had no zones |
| delivery_is_pickup | boolean | default false |
| delivery_address | text null | null for pickup, and for orders placed before this change |
| delivery_landmark | text null | |

`total_kobo` stays, and now always equals `subtotal_kobo + delivery_fee_kobo`.

### Snapshots

The order copies the zone's name, fee and pickup flag. Editing or removing a zone later never
changes an existing order: the customer agreed to the price they saw.

## Money

- **Subtotal**: items, priced from the database (unchanged).
- **Delivery fee**: the chosen zone's `fee_kobo`, read from the database. The browser sends
  only the zone id, so nobody can set their own price.
- **Total** = subtotal + delivery fee. Paystack charges the total. WhatsApp messages and
  emails show the total.
- **Gbam's fee**: `calculatePlatformFee` is given `subtotal_kobo` instead of `total_kobo`
  (in `PaymentsService.ensurePaymentLink`).
- **Refunds**: the whole amount paid, delivery included (unchanged behaviour).

## Checkout

### Shop with zones

1. Basket items (unchanged).
2. **Delivery**: the live zones as tappable choices showing their price, e.g.
   "Lekki / VI · ₦2,500", "Pickup from shop · Free". Nothing is preselected.
3. Delivery zone picked: **Street address** (required, 5–300 chars) and **Nearest landmark /
   directions** (optional, up to 200 chars). Pickup zone picked: the address boxes hide and
   the seller's pickup note shows.
4. A live summary: **Items ₦12,000 · Delivery ₦2,500 · Total ₦14,500**.

### Shop without zones

Only the **Street address** (required) and **landmark** (optional) boxes. No fee. Total =
items.

### What the browser sends

`createOrderSchema` gains a `delivery` object:

- `zoneId`: uuid or null (null only allowed when the shop has no live zones)
- `expectedFeeKobo`: the fee the customer saw (integer ≥ 0), or null with no zone
- `address`: string or null (required unless the zone is pickup)
- `landmark`: string or null

### Server checks (inside the existing order transaction)

1. Shop has live zones and no `zoneId` was sent → 400, field `delivery`: "Choose a delivery
   option".
2. `zoneId` isn't a live zone of this shop (removed, or another shop's) → 409, field
   `delivery`: "That delivery option isn't available any more. Please pick another."
3. Zone's current `fee_kobo` ≠ `expectedFeeKobo` → 409, field `delivery`: "Delivery to
   {name} is now ₦{fee}. Please check and confirm." The customer never pays a price they did
   not see.
4. Not pickup and no address → 400, field `address`.
5. Pickup → any address sent is ignored (stored as null).

## Where delivery shows

- **Review & pay page, tracking page, email receipt, payment-confirmed email**: Items,
  Delivery (zone name, or "Pickup"), Total.
- **Seller order page**: a **Delivery** box with zone, address, landmark and a **Copy
  address** button (for sending to a rider). Pickup orders say "Customer will pick up".
- **Seller new-order email**: the zone name and the total.
- **Dashboard**: a banner for shops with no zones: "Add delivery zones so customers pay for
  delivery when they order." with a link to Settings → Delivery. Dismissing is not needed:
  it goes away once a zone exists.

## WhatsApp

The approved templates already include the total, which now includes delivery. No template
text changes, so no new Meta approval is needed.

## Not in this change

- Delivery fees by distance or by weight.
- Free delivery over a certain amount.
- Changing the delivery fee after the order is placed.
- Tracking the rider.

## Testing

- API (integration): order with a zone stores the snapshot and total = subtotal + fee;
  changed fee → 409; removed or other shop's zone → 409; pickup needs no address; no zones →
  address required, fee 0; editing a zone does not change an existing order.
- Fees: platform fee is calculated on the subtotal only.
- Zones API: create, edit, reorder, remove; 20-zone limit; duplicate names refused; a seller
  can't touch another shop's zones.
- Shared schemas: delivery input validation.
- Web: checkout shows zones and hides address for pickup; live total; settings zone form;
  order page delivery box.
- Migration: existing orders get `subtotal_kobo = total_kobo` and `delivery_fee_kobo = 0`.
