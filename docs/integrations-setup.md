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

Paystack needs an email per transaction. If the customer left one at checkout we send it;
otherwise we send `<phone>@customers.gbam.app` (nothing arrives there). Gbam emails its own
receipts, so turn off Paystack's customer receipts in the dashboard to avoid two.

**Our own pay screens (transfer and USSD).** The /pay page asks the API
(`POST /track/:code/pay/direct`) for a one-off transfer account or a USSD code through
Paystack's Charge API, with the same seller split as a card checkout. Cards still go
through Paystack's pop-up, so card numbers never touch gbam. The money arrives through the
same `charge.success` webhook. USSD works for GTBank (737), UBA (919) and Zenith (966):
the ones Paystack accepted in test mode (October 2026).

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

## WhatsApp webhook (delivery status: sent / delivered / read / failed)

Meta calls `POST /webhooks/whatsapp` to report what happened to each message; the
dashboard's order page shows it under **WhatsApp messages**.

1. In `.env`:
   - `WHATSAPP_APP_SECRET`: Meta app → **App settings → Basic → App secret** (Show).
   - `WHATSAPP_WEBHOOK_VERIFY_TOKEN`: any random string (one is already generated).
2. Give your laptop a public address: `ngrok http 4000`. Your free ngrok domain is fixed:
   `https://reverse-agreeing-unpainted.ngrok-free.dev`.
3. Meta app → Use cases → Connect on WhatsApp → **Step 2. Production setup → Configure
   Webhooks**:
   - Callback URL: `https://reverse-agreeing-unpainted.ngrok-free.dev/webhooks/whatsapp`
   - Verify token: the value of `WHATSAPP_WEBHOOK_VERIFY_TOKEN`
   - **Verify and save**, then subscribe to the **messages** webhook field.
4. Watch requests arrive at `http://127.0.0.1:4040` (ngrok's inspector).

While the Meta app is **unpublished**, only the dashboard's **Test** events are delivered;
real delivery statuses start once the app is published.

While ngrok runs, your dev API is reachable from the internet. Stop it (Ctrl+C) when
you're done testing.

## Production

`NODE_ENV=production` refuses to start without `PAYSTACK_SECRET_KEY`,
`WHATSAPP_ACCESS_TOKEN` and `WHATSAPP_PHONE_NUMBER_ID`, so production can never silently
run on the fakes. Use the **live** Paystack key (`sk_live_…`) there.

## Error alerts (Sentry)

Sentry emails you when something breaks: an API error, a background job that failed for
good (a payment confirmation, an email, a WhatsApp message), or a page that crashed in a
visitor's browser. Without it, errors only sit in the Railway logs where nobody sees them.

With no DSN set, nothing is sent (local development and tests stay quiet).

1. Sign up at https://sentry.io (the free plan is enough to start).
2. Create a project. Pick **Node.js** as the platform; one project for all of Gbam is fine.
3. Copy the project's **DSN** (Settings → Client Keys). It looks like
   `https://abc123@o456.ingest.sentry.io/789`.
4. In Railway, set these variables:
   - API service and worker service: `SENTRY_DSN=<the DSN>`
   - Web service: `SENTRY_DSN=<the DSN>` and `NEXT_PUBLIC_SENTRY_DSN=<the same DSN>`.
     The `NEXT_PUBLIC_` one is copied into the browser code **when the site is built**, so
     redeploy the web service after adding it.
5. In Sentry → Alerts, check that "email me on new issues" is on.

What is never sent: request bodies, cookies and headers (so no passwords, codes or session
tokens), the logged-in user, and any email address, phone number or tracking-link key in an
error message (they are replaced with `[email]`, `[phone]` and `[key]`).

Only unexpected errors are reported. A 404, a wrong password or a refused order change is the
app working correctly, so those are not. A background job that fails once and then succeeds
on retry is not reported either; only its final failure is.

## Product photos (Cloudflare R2)

In dev you need nothing: with the R2 values empty, photos are saved under `apps/api/uploads/photos`
and served by the API at `http://localhost:4000/photos`. Production uses R2 and refuses to start
without all five values.

1. In the Cloudflare dashboard go to **R2 → Create bucket** (e.g. `gbam-photos`).
2. Open the bucket → **Settings → Custom Domains → Connect domain** and add `photos.gbam.app`.
   This is the public address browsers load photos from.
3. Go to **R2 → Manage API tokens → Create API token**. Give it **Object Read & Write**, limited
   to that one bucket. Copy the Access Key ID and Secret Access Key (shown once).
4. Your Account ID is on the R2 overview page.
5. Set these in `.env.production`:

```
R2_ACCOUNT_ID=<account id>
R2_ACCESS_KEY_ID=<access key id>
R2_SECRET_ACCESS_KEY=<secret access key>
R2_BUCKET=gbam-photos
PHOTOS_PUBLIC_URL=https://photos.gbam.app
```
