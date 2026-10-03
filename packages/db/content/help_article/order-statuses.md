---
title: Order statuses
summary: What each status means and who can change it.
category: Orders
sortOrder: 5
published: true
date: 2026-10-03
---

Every order moves through these statuses, in this order.

- **New**: the customer placed the order. Nothing is paid yet.
- **Awaiting payment**: you requested payment and the customer has their Paystack link.
- **Paid**: Paystack confirmed the payment. Only the system sets this, never you.
- **Ready / sent**: you have packed the order or sent it out.
- **Delivered**: the customer has received it.
- **Cancelled**: the order was stopped before payment.
- **Refunded**: you marked an order as refunded after payment.

## Good to know

- You can cancel only before payment.
- After payment you can mark an order **Refunded**. This only records the status. It does **not** send money back yet, so any refund to the customer is handled by you outside Gbam for now.
- Cancelled and Refunded orders are closed.
- The customer gets a WhatsApp message at the main steps. See [WhatsApp messages](/help/whatsapp-messages).
