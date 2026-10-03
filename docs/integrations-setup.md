# Connecting real Paystack and WhatsApp

Without keys, the app uses fakes that log what they would have done: `[fake whatsapp] → …`
and `[fake paystack] …` in the `pnpm dev` output. Add keys to `.env` to switch to the real
services. Nothing else changes.

## Testing payments locally without keys

1. `pnpm dev`, place an order on `localhost:3000/mama-ngozi`.
2. In the dashboard, tap **Request payment**. The worker creates a payment link and
   "sends" it (see the `[fake whatsapp]` line).
3. `pnpm simulate:payment GB-XXXX` sends a correctly signed Paystack webhook.
4. Refresh the order: it's **Paid**, with `awaiting_payment → paid · system` in its history.

## Paystack

1. Create an account at paystack.com. In **Settings → API Keys & Webhooks**, copy the
   **test secret key** (`sk_test_…`) into `.env` as `PAYSTACK_SECRET_KEY`.
2. Set the **webhook URL** to `https://<your-api-domain>/webhooks/paystack`.
   Locally, Paystack can't reach `localhost`. Expose it with a tunnel, e.g.
   `cloudflared tunnel --url http://localhost:4000` or `ngrok http 4000`, and use that URL.
3. Use Paystack's test cards on the checkout page to pay.
4. **Paying sellers directly:** create a subaccount per seller (Paystack → Subaccounts) and
   store its code in `sellers.paystack_subaccount_code`. Payments for that seller's orders
   then split to their bank account automatically. Without it, money lands in your account.

How we stay safe:

- Webhooks are rejected unless the `x-paystack-signature` HMAC matches.
- We never trust the webhook body: the worker re-fetches the transaction from Paystack
  and checks the amount before marking an order paid.
- A payment for an order the seller already cancelled is logged as `NEEDS REFUND`.

Paystack needs an email per transaction; customers only give a phone number, so we send
`<phone>@customers.gbam.app`. Paystack receipts to that address won't arrive. Collect real
emails later if receipts matter.

## Fees: who gets what

Rules live in `packages/shared/src/fees.ts`. Edit `PLATFORM_FEE` there to change them.

- **gbam fee:** 1.5% of each order, capped at ₦1,000. Sent to Paystack per payment as
  `transaction_charge`, which overrides the percentage on the subaccount. Keep the
  subaccount's own percentage at 0 in the dashboard, so the code is the only source.
- **Paystack fee:** paid from the seller's share (`bearer: "subaccount"`), so gbam never
  loses money on a sale.
- **Founding sellers:** no gbam fee until a date. Set `sellers.fee_waived_until`, e.g.
  three months from now:
  `update sellers set fee_waived_until = now() + interval '3 months' where slug = '...';`
- Each payment stores `platform_fee_kobo` (your cut) and `paystack_fee_kobo` (Paystack's
  real fee, once paid). The order page shows the seller the breakdown.

### Paying a real test transaction without a tunnel

1. Request payment on an order, open the Paystack link, and pay with a Paystack test card.
2. Run `pnpm simulate:payment GB-XXXX`. It sends the signed webhook Paystack would have
   sent; the worker then checks with Paystack, sees the real payment, and marks it paid.

## WhatsApp Cloud API

1. In Meta for Developers, create an app with the **WhatsApp** product and add a phone
   number. Copy the **Phone number ID** → `WHATSAPP_PHONE_NUMBER_ID`.
2. Create a **System User** access token with `whatsapp_business_messaging` permission
   → `WHATSAPP_ACCESS_TOKEN`. (The temporary token on the getting-started page expires
   after 24 hours.)
3. Create these **message templates** in WhatsApp Manager → Message templates.
   Category **Utility**, language **English (en)**, names and bodies exactly as below.
   Meta must approve each one before sends succeed. Until then sends fail with error
   132001, and the job stops retrying instead of looping.

| Name                   | Body                                                                                            |
| ---------------------- | ----------------------------------------------------------------------------------------------- |
| `gbam_order_received`  | Hi {{1}}, {{2}} has received your order {{3}} ({{4}}). You'll get payment details here shortly. |
| `gbam_payment_request` | Hi {{1}}, please pay {{2}} for order {{3}} from {{4}}: {{5}}                                    |
| `gbam_order_paid`      | Payment of {{1}} received for order {{2}}. Thank you! {{3}} is on it.                           |
| `gbam_order_fulfilled` | Good news! Your order {{1}} from {{2}} is ready / on its way.                                   |
| `gbam_order_delivered` | Your order {{1}} has been delivered. Thanks for buying from {{2}}!                              |
| `gbam_order_cancelled` | Your order {{1}} from {{2}} has been cancelled.                                                 |
| `gbam_order_refunded`  | Your payment for order {{1}} from {{2}} has been refunded.                                      |

The source of truth is `WHATSAPP_TEMPLATES` in
`packages/integrations/src/whatsapp.ts`. If you change a body there, change it in Meta too.

## Production

`NODE_ENV=production` refuses to start without `PAYSTACK_SECRET_KEY`,
`WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`, so production can never silently
run on the fakes. Use the **live** Paystack key (`sk_live_…`) there.
