# Cancel undo, Review & pay, Seller settings, Refunds: design

Date: 2026-10-07 · Status: approved in chat (owner: "yeah do that")

## 1. Cancel with Undo
- Cancel moves out of the action buttons into its own "Cancel this order" area at the bottom of the order page.
- Confirm box ("Cancel GB-…? The customer will get a WhatsApp message." Keep order / Yes, cancel), then
  "Cancelling in 5… Undo". The server is only called when the countdown ends; leaving the page or Undo means nothing happens.

## 2. Review & pay
- `/pay/<code>?k=<tracking key>`: shop header, items, total, "Pay ₦X securely".
- The button opens Paystack's official inline pop-up (`resumeTransaction(access_code)`) over our page; card details only ever go into Paystack's window.
- On success the customer goes to their tracking page, which shows "Confirming your payment…" until the webhook marks it paid, then "✓ Payment received".
- The WhatsApp payment request links to `/pay/...` instead of Paystack's page (same template variable). The key never goes to Paystack.
- No new setting needed: the pop-up's `resumeTransaction` only needs the access code, which is the last part of the
  checkout link we already save. If the pop-up can't open, the button falls back to Paystack's hosted page.
- A closed shop takes no new payments (the pay button disappears and the API refuses a link).

## 3. Seller settings (`/dashboard/settings`)
- Shop: business name, WhatsApp number (unique). Shop link never changes.
- Getting paid: change bank account → Paystack resolves the name → password → the Paystack subaccount is updated;
  past payments unaffected. The owner is emailed about every change.
- Security: change password (current password required); signs out other devices.
- Delete my account: type shop name + password → shop hidden at once, user signed out, deletion request emailed to privacy@gbam.app (records kept as the privacy policy says).

## 4. Refunds
- "Mark refunded" on paid/fulfilled/delivered orders and on cancelled orders that have a successful payment (state machine gains cancelled → refunded; the API refuses a refund for an order with no successful payment).
- Before marking: refund steps with the payment reference (copy button). Sellers don't own the Paystack account
  (Gbam does), so the steps are "send it back by bank transfer" or "email support@gbam.app with the reference".
  "Mark refunded" needs a tick: "The customer has their money back".
- Marking sends the existing "refunded" WhatsApp message and shows on the tracking page. Automatic refunds later, after testing split refunds on the live account.

## Tests
Each piece gets component/HTTP tests; full `pnpm turbo run build typecheck lint test` before merge; one final independent review.
