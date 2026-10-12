import { renderTemplate } from "@gbam/integrations";
import { describe, expect, it } from "vitest";
import { autoReplyText, customerMessage, shopChatLink } from "./customer-messages.js";

const ORDER = {
  store: "Mama Ngozi Kitchen",
  customerName: "Ada",
  code: "GB-7K3Q",
  total: "₦9,000",
  payLink: "https://gbam.app/pay/GB-7K3Q?k=abc",
  shopChat: "https://wa.me/2348000000001",
};

/** The message the customer would read for this status, or null when none is sent. */
function textFor(status: Parameters<typeof customerMessage>[0]) {
  const message = customerMessage(status, ORDER);
  if (message === null) {
    return null;
  }
  return renderTemplate(message.template, message.params);
}

describe("customer WhatsApp messages", () => {
  it("names the shop first and links to the shop's own WhatsApp", () => {
    expect(textFor("paid")).toBe(
      "Order update from Mama Ngozi Kitchen: payment of ₦9,000 received for order GB-7K3Q. " +
        "Thank you! Chat with the shop at https://wa.me/2348000000001 if you have questions.",
    );
  });

  it("the payment request carries the pay link and the shop's chat link", () => {
    const text = textFor("awaiting_payment");
    expect(text).toContain("https://gbam.app/pay/GB-7K3Q?k=abc");
    expect(text).toContain("https://wa.me/2348000000001");
    expect(text).toContain("₦9,000");
  });

  it("sends no separate 'delivered' message: 'ready or on its way' already covered it", () => {
    expect(textFor("delivered")).toBeNull();
    expect(textFor("fulfilled")).toContain("ready or on its way");
  });

  it("never claims gbam sent the refund: the shop marked it refunded", () => {
    const text = textFor("refunded");
    expect(text).toContain("the shop has marked your order GB-7K3Q as refunded");
    expect(text).toContain("https://wa.me/2348000000001");
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
