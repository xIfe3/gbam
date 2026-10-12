import type { WhatsAppTemplateName } from "@gbam/integrations";
import type { OrderStatus } from "@gbam/shared";

/** What a customer message needs to know about the order. */
export type OrderMessageDetails = {
  store: string;
  customerName: string;
  code: string;
  /** Already formatted, e.g. "₦9,000". */
  total: string;
  /** Our review-and-pay page for this order. */
  payLink: string;
  /** A link that opens a WhatsApp chat with the shop (see shopChatLink). */
  shopChat: string;
};

/** A link that opens a WhatsApp chat with this number, e.g. https://wa.me/2348031234567. */
export function shopChatLink(whatsappPhone: string): string {
  return `https://wa.me/${whatsappPhone}`;
}

/**
 * Which WhatsApp template the customer gets when their order moves to `status`, and the
 * values for its {{1}}, {{2}}, … in order (template texts: WHATSAPP_TEMPLATES).
 * null = no message for this status.
 */
export function customerMessage(
  status: OrderStatus,
  order: OrderMessageDetails,
): { template: WhatsAppTemplateName; params: string[] } | null {
  if (status === "pending") {
    return {
      template: "gbam_order_received",
      params: [order.store, order.customerName, order.code, order.total, order.shopChat],
    };
  }
  if (status === "awaiting_payment") {
    return {
      template: "gbam_payment_request",
      params: [
        order.store,
        order.customerName,
        order.total,
        order.code,
        order.payLink,
        order.shopChat,
      ],
    };
  }
  if (status === "paid") {
    return {
      template: "gbam_order_paid",
      params: [order.store, order.total, order.code, order.shopChat],
    };
  }
  if (status === "fulfilled") {
    return { template: "gbam_order_fulfilled", params: [order.store, order.code, order.shopChat] };
  }
  if (status === "delivered") {
    // "Ready or on its way" already told them; each message costs gbam money.
    return null;
  }
  if (status === "cancelled") {
    return { template: "gbam_order_cancelled", params: [order.store, order.code, order.shopChat] };
  }
  // The only status left is "refunded".
  return { template: "gbam_order_refunded", params: [order.store, order.code, order.shopChat] };
}

const AUTO_REPLY_START = "Hi! This number only sends order updates, so messages here aren't read.";

/**
 * The reply a customer gets when they message gbam's WhatsApp number. `shop` is the shop
 * they last ordered from, or null if we can't tell.
 */
export function autoReplyText(shop: { store: string; shopChat: string } | null): string {
  if (shop === null) {
    return `${AUTO_REPLY_START} Please message the shop you ordered from on their own WhatsApp.`;
  }
  return `${AUTO_REPLY_START} To chat with ${shop.store}, tap ${shop.shopChat}`;
}
