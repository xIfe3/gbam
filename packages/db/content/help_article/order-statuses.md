---
title: Order statuses
summary: What each status means and who can change it.
category: Orders
sortOrder: 5
published: true
date: 2026-10-07
---

Every order moves through these statuses, in this order.

- **New**: the customer placed the order. Nothing is paid yet.
- **Awaiting payment**: you requested payment and the customer has their payment link.
- **Paid**: Paystack confirmed the payment. Only the system sets this, never you.
- **Ready / sent out**: you have packed the order or sent it out.
- **Delivered**: the customer has received it.
- **Cancelled**: the order was stopped before payment.
- **Refunded**: you gave the customer their money back and marked it refunded.

## Good to know

- You can cancel only before payment, and you get 5 seconds to undo it.
- After payment, an order can be refunded instead. See [refund an order](/help/refund-an-order).
- A cancelled order can still be marked refunded if the customer had already paid for it.
- Refunded orders are closed.
- The customer gets a WhatsApp message at the main steps, and can see the status on their [tracking page](/help/how-customers-track-orders). See [WhatsApp messages](/help/whatsapp-messages).
