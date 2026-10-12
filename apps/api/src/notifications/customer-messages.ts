import type { WhatsAppTemplateName } from "@gbam/integrations";
import type { OrderStatus } from "@gbam/shared";

/** What a customer message needs to know about the order. */
export type OrderMessageDetails = {
  store: string;
  customerName: string;
  code: string;
  /** Already formatted, e.g. "₦9,000". */
  total: string;
  /** The order's private key: it goes in the pay button's address. */
  trackingKey: string;
};

export type CustomerMessage = {
  template: WhatsAppTemplateName;
  params: string[];
  /** Only for templates with the pay button (see payButtonSuffix). */
  buttonUrlSuffix?: string;
};

/** Sellers don't enter delivery times, so "on the way" says this instead. */
const DELIVERY_ESTIMATE = "as agreed with the seller";

/** A link that opens a WhatsApp chat with this number, e.g. https://wa.me/2348031234567. */
export function shopChatLink(whatsappPhone: string): string {
  return `https://wa.me/${whatsappPhone}`;
}

/**
 * The end of the pay button's address. The button's URL in Meta is
 * https://gbam.zephra.dev/pay/{{1}}, so this fills in "GB-7K3Q?k=…": our pay page.
 */
export function payButtonSuffix(code: string, trackingKey: string): string {
  return `${code}?k=${encodeURIComponent(trackingKey)}`;
}

/**
 * Which WhatsApp template the customer gets when their order moves to `status`, and the
 * values for its {{1}}, {{2}}, … in order (template texts: WHATSAPP_TEMPLATES).
 * `isReminder` = the 24-hour reminder or the seller's "Resend": the payment request again.
 * null = no message for this status.
 */
export function customerMessage(
  status: OrderStatus,
  order: OrderMessageDetails,
  isReminder: boolean,
): CustomerMessage | null {
  if (status === "pending") {
    return {
      template: "order_received",
      params: [order.customerName, order.store, order.code, order.total],
    };
  }
  if (status === "awaiting_payment") {
    let template: WhatsAppTemplateName = "order_payment_request";
    if (isReminder) {
      template = "payment_reminder";
    }
    return {
      template,
      params: [order.customerName, order.code, order.store, order.total],
      buttonUrlSuffix: payButtonSuffix(order.code, order.trackingKey),
    };
  }
  if (status === "paid") {
    return {
      template: "payment_received",
      params: [order.customerName, order.total, order.code, order.store],
    };
  }
  if (status === "fulfilled") {
    return {
      template: "order_out_for_delivery",
      params: [order.customerName, order.code, order.store, DELIVERY_ESTIMATE],
    };
  }
  if (status === "delivered") {
    // "On the way" already told them; each message costs gbam money.
    return null;
  }
  if (status === "cancelled") {
    return {
      template: "order_cancelled",
      params: [order.customerName, order.code, order.store],
    };
  }
  // The only status left is "refunded".
  return {
    template: "order_refunded",
    params: [order.customerName, order.store, order.code],
  };
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
