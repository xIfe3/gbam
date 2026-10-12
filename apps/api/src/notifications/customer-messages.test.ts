import { renderTemplate } from "@gbam/integrations";
import { describe, expect, it } from "vitest";
import {
  autoReplyText,
  customerMessage,
  payButtonSuffix,
  shopChatLink,
} from "./customer-messages.js";

const ORDER = {
  store: "Mama Ngozi Kitchen",
  customerName: "Ada",
  code: "GB-7K3Q",
  total: "₦9,000",
  trackingKey: "abc",
};

/** The message the customer would read, or null when none is sent. */
function textFor(status: Parameters<typeof customerMessage>[0], isReminder = false) {
  const message = customerMessage(status, ORDER, isReminder);
  if (message === null) {
    return null;
  }
  return renderTemplate(message.template, message.params);
}

describe("customer WhatsApp messages (the templates approved in Meta)", () => {
  it("asks for payment with the pay button pointing at this order", () => {
    const message = customerMessage("awaiting_payment", ORDER, false);
    expect(message?.template).toBe("order_payment_request");
    expect(textFor("awaiting_payment")).toBe(
      "Hi Ada, your order GB-7K3Q from Mama Ngozi Kitchen is ready for payment. " +
        "Total: ₦9,000. Tap the button below to pay securely with Paystack.",
    );
    // The button's URL in Meta is https://gbam.zephra.dev/pay/{{1}}: we fill in the end.
    expect(message?.buttonUrlSuffix).toBe("GB-7K3Q?k=abc");
  });

  it("a reminder (24 hours, or the seller's Resend) uses the reminder template, same button", () => {
    const message = customerMessage("awaiting_payment", ORDER, true);
    expect(message?.template).toBe("payment_reminder");
    expect(message?.buttonUrlSuffix).toBe("GB-7K3Q?k=abc");
    expect(textFor("awaiting_payment", true)).toContain("is still waiting for payment");
  });

  it("confirms payment", () => {
    expect(textFor("paid")).toBe(
      "Hi Ada, we have received your payment of ₦9,000 for order GB-7K3Q from " +
        "Mama Ngozi Kitchen. The seller has been notified and will prepare your order.",
    );
  });

  it("says it's on its way, with the delivery time left to the seller", () => {
    expect(textFor("fulfilled")).toBe(
      "Hi Ada, your order GB-7K3Q from Mama Ngozi Kitchen is on the way. " +
        "Estimated delivery: as agreed with the seller. Thank you",
    );
  });

  it("sends no 'delivered' message: 'on the way' already covered it", () => {
    expect(customerMessage("delivered", ORDER, false)).toBeNull();
  });

  it("never claims gbam sent a refund: the shop marked it refunded", () => {
    expect(textFor("refunded")).toContain(
      "Mama Ngozi Kitchen* has marked your order *GB-7K3Q* as refunded",
    );
  });

  it("only payment messages carry a button", () => {
    expect(customerMessage("paid", ORDER, false)?.buttonUrlSuffix).toBeUndefined();
    expect(customerMessage("cancelled", ORDER, false)?.buttonUrlSuffix).toBeUndefined();
  });
});

describe("pay button", () => {
  it("is the order code and its private key, as the end of the pay page address", () => {
    expect(payButtonSuffix("GB-7K3Q", "k/ey")).toBe("GB-7K3Q?k=k%2Fey");
  });
});

describe("shop chat link", () => {
  it("is a wa.me link to the seller's WhatsApp number", () => {
    expect(shopChatLink("2348000000001")).toBe("https://wa.me/2348000000001");
  });
});

describe("auto-reply to a customer who messages gbam's number", () => {
  it("points them to the shop they last ordered from", () => {
    expect(autoReplyText({ store: "Mama Ngozi Kitchen", shopChat: "https://wa.me/234800" })).toBe(
      "Hi! This number only sends order updates, so messages here aren't read. " +
        "To chat with Mama Ngozi Kitchen, tap https://wa.me/234800",
    );
  });

  it("gives a general answer when we can't tell which shop", () => {
    expect(autoReplyText(null)).toBe(
      "Hi! This number only sends order updates, so messages here aren't read. " +
        "Please message the shop you ordered from on their own WhatsApp.",
    );
  });
});
