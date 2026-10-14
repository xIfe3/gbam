import { describe, expect, it } from "vitest";
import { renderEmail } from "./templates.js";
import { PAYOUT_TIMING } from "@gbam/shared";

describe("renderEmail", () => {
  it("renders the verification email", () => {
    const email = renderEmail({ kind: "verify_email", to: "a@b.com", code: "123456" });
    expect(email.to).toBe("a@b.com");
    expect(email.subject).toBe("Your Gbam code: 123456");
    expect(email.text).toContain("123456");
    expect(email.text).toContain("expires in 15 minutes");
    expect(email.html).toContain("123456");
  });

  it("renders the password reset email", () => {
    const email = renderEmail({ kind: "reset_password", to: "a@b.com", code: "654321" });
    expect(email.subject).toContain("654321");
    expect(email.text).toContain("expires in 15 minutes");
  });

  it("sends contact messages to hello@gbam.app with reply-to and escapes html", () => {
    const email = renderEmail({
      kind: "contact_message",
      name: "Ada <i>",
      email: "ada@example.com",
      phone: null,
      message: 'Hello <b>bold</b> & "quotes"',
    });
    expect(email.to).toBe("hello@gbam.app");
    expect(email.replyTo).toBe("ada@example.com");
    expect(email.html).toContain("&lt;b&gt;bold&lt;/b&gt;");
    expect(email.html).toContain("Ada &lt;i&gt;");
    expect(email.html).not.toContain("<b>");
    expect(email.text).toContain("Hello <b>bold</b>");
  });

  it("wraps emails in the Gbam layout", () => {
    const email = renderEmail({ kind: "verify_email", to: "a@b.com", code: "123456" });
    expect(email.html).toContain("gbam<span");
    expect(email.html).toContain("#fff8f5"); // the blush page background
  });

  it("sends needs-refund alerts to support with the payment reference", () => {
    const email = renderEmail({
      kind: "needs_refund",
      orderCode: "GB-7K2Q",
      shopName: "Ada's Kitchen",
      slug: "ada",
      totalKobo: 1_250_000,
      reason: "The order was already cancelled.",
      paymentReference: "gbam_GB-7K2Q_abcd",
    });
    expect(email.to).toBe("support@gbam.app");
    expect(email.subject).toContain("NEEDS REFUND");
    expect(email.text).toContain("gbam_GB-7K2Q_abcd");
    expect(email.html).toContain("Ada&#39;s Kitchen");
  });

  it("tells the seller when the money reaches their bank", () => {
    const email = renderEmail({
      kind: "payment_received",
      to: "owner@example.com",
      shopName: "Shop",
      code: "GB-7K2Q",
      customerName: "Ada",
      totalKobo: 500_000,
      orderUrl: "https://gbam.app/dashboard/orders/1",
    });
    expect(email.text).toContain(PAYOUT_TIMING);
    expect(email.html).toContain(PAYOUT_TIMING);
  });

  it("escapes the customer's name in the seller's payment email", () => {
    const email = renderEmail({
      kind: "payment_received",
      to: "owner@example.com",
      shopName: "Shop",
      code: "GB-7K2Q",
      customerName: "<script>x</script>",
      totalKobo: 500_000,
      orderUrl: "https://gbam.app/dashboard/orders/1",
    });
    expect(email.html).not.toContain("<script>");
    expect(email.html).toContain("&lt;script&gt;");
    expect(email.html).toContain("https://gbam.app/dashboard/orders/1");
  });

  it("makes the support address bold in warnings", () => {
    const email = renderEmail({
      kind: "password_changed",
      to: "a@b.com",
      resetUrl: "https://gbam.app/forgot-password",
    });
    expect(email.html).toMatch(/<strong[^>]*>support@gbam\.app<\/strong>/);
    // The plain-text version has no HTML in it.
    expect(email.text).not.toContain("<strong");
  });

  it("never repeats what someone typed in the contact auto-reply", () => {
    const email = renderEmail({ kind: "contact_auto_reply", to: "someone@example.com" });
    expect(email.to).toBe("someone@example.com");
    expect(email.text).toContain("We got your message");
  });

  it("links the new-order email to the settings page so it can be turned off", () => {
    const email = renderEmail({
      kind: "new_order",
      to: "owner@example.com",
      shopName: "Shop",
      code: "GB-7K2Q",
      customerName: "Ada",
      subtotalKobo: 500_000,
      deliveryFeeKobo: 0,
      deliveryLabel: null,
      totalKobo: 500_000,
      orderUrl: "https://gbam.app/dashboard/orders/1",
      settingsUrl: "https://gbam.app/dashboard/settings",
    });
    expect(email.html).toContain("https://gbam.app/dashboard/settings");
    expect(email.text).toContain("Turn them off");
  });

  it("the new-order email has everything the seller needs to act on it", () => {
    const email = renderEmail({
      kind: "new_order",
      to: "owner@example.com",
      shopName: "Shop",
      code: "GB-7K2Q",
      customerName: "Ada",
      customerPhone: "2348031234567",
      items: [
        { name: "Jollof Rice (large)", quantity: 2, lineTotalKobo: 700_000 },
        { name: "Chapman", quantity: 1, lineTotalKobo: 200_000 },
      ],
      deliveryAddress: "12 Admiralty Way",
      deliveryLandmark: "Opposite the bank",
      note: "No pepper please",
      waitingFor: "payment",
      subtotalKobo: 900_000,
      deliveryFeeKobo: 150_000,
      deliveryLabel: "Lekki",
      totalKobo: 1_050_000,
      orderUrl: "https://gbam.app/dashboard/orders/1",
      settingsUrl: "https://gbam.app/dashboard/settings",
    });
    for (const part of [email.text, email.html]) {
      expect(part).toContain("2 × Jollof Rice (large)");
      expect(part).toContain("₦7,000");
      expect(part).toContain("1 × Chapman");
      expect(part).toContain("+2348031234567");
      expect(part).toContain("12 Admiralty Way");
      expect(part).toContain("Opposite the bank");
      expect(part).toContain("No pepper please");
      // So the seller doesn't start on an order nobody has paid for yet.
      expect(part).toContain("Waiting for Ada to pay");
    }
  });

  it("a shop that checks orders first is told to check, then request payment", () => {
    const email = renderEmail({
      kind: "new_order",
      to: "owner@example.com",
      shopName: "Shop",
      code: "GB-7K2Q",
      customerName: "Ada",
      waitingFor: "seller",
      subtotalKobo: 500_000,
      deliveryFeeKobo: 0,
      deliveryLabel: null,
      totalKobo: 500_000,
      orderUrl: "https://gbam.app/dashboard/orders/1",
      settingsUrl: "https://gbam.app/dashboard/settings",
    });
    expect(email.text).toContain("Check the order, then tap Request payment");
  });

  it("receipt shows delivery line", () => {
    const email = renderEmail({
      kind: "order_receipt",
      to: "a@b.com",
      shopName: "Shop",
      code: "GB-7K2Q",
      subtotalKobo: 1_200_000,
      deliveryFeeKobo: 250_000,
      deliveryLabel: "Lekki / VI",
      totalKobo: 1_450_000,
      trackingUrl: "https://gbam.app/track/GB-7K2Q",
    });
    expect(email.text).toContain("Items ₦12,000 · Delivery (Lekki / VI) ₦2,500 · Total ₦14,500");
    expect(email.html).toContain("Delivery (Lekki / VI)");
  });

  it("the paid email says how they paid and the payment reference", () => {
    const email = renderEmail({
      kind: "payment_confirmed",
      to: "a@b.com",
      shopName: "Shop",
      code: "GB-7K2Q",
      subtotalKobo: 1_200_000,
      deliveryFeeKobo: 0,
      deliveryLabel: null,
      totalKobo: 1_200_000,
      trackingUrl: "https://gbam.app/track/GB-7K2Q",
      paidWith: "Bank transfer",
      paymentReference: "gbam_GB-7K2Q_9f2c41ab",
    });
    expect(email.text).toContain("Paid by: Bank transfer");
    expect(email.text).toContain("Payment reference: gbam_GB-7K2Q_9f2c41ab");
    expect(email.html).toContain("Bank transfer");
    expect(email.html).toContain("gbam_GB-7K2Q_9f2c41ab");
  });

  it("the paid email leaves out how they paid when we can't tell", () => {
    const email = renderEmail({
      kind: "payment_confirmed",
      to: "a@b.com",
      shopName: "Shop",
      code: "GB-7K2Q",
      subtotalKobo: 1_200_000,
      deliveryFeeKobo: 0,
      deliveryLabel: null,
      totalKobo: 1_200_000,
      trackingUrl: "https://gbam.app/track/GB-7K2Q",
      paidWith: null,
      paymentReference: "gbam_GB-7K2Q_9f2c41ab",
    });
    expect(email.text).not.toContain("Paid by");
    expect(email.text).toContain("Payment reference: gbam_GB-7K2Q_9f2c41ab");
  });

  it("free delivery says Free", () => {
    const email = renderEmail({
      kind: "payment_confirmed",
      to: "a@b.com",
      shopName: "Shop",
      code: "GB-7K2Q",
      subtotalKobo: 1_200_000,
      deliveryFeeKobo: 0,
      deliveryLabel: "Pickup",
      totalKobo: 1_200_000,
      trackingUrl: "https://gbam.app/track/GB-7K2Q",
    });
    expect(email.text).toContain("Items ₦12,000 · Delivery (Pickup) Free · Total ₦12,000");
  });

  it("receipt without zone shows total only", () => {
    const email = renderEmail({
      kind: "order_receipt",
      to: "a@b.com",
      shopName: "Shop",
      code: "GB-7K2Q",
      subtotalKobo: 1_200_000,
      deliveryFeeKobo: 0,
      deliveryLabel: null,
      totalKobo: 1_200_000,
      trackingUrl: "https://gbam.app/track/GB-7K2Q",
    });
    expect(email.text).toContain("Total: ₦12,000");
    expect(email.text).not.toContain("Delivery");
  });
});

describe("ticket emails", () => {
  it("a new ticket goes to the live support inbox", () => {
    const email = renderEmail(
      {
        kind: "ticket_new",
        number: 1042,
        subject: "Payout missing",
        requesterName: "Ada",
        sourceLabel: "a seller",
        adminUrl: "https://gbam.app/admin/tickets/t1",
      },
      { support: "help@gbam.app", contact: "hello@gbam.app", privacy: "privacy@gbam.app" },
    );
    expect(email.to).toBe("help@gbam.app");
    expect(email.subject).toBe("Ticket #1042: Payout missing");
    expect(email.html).toContain("https://gbam.app/admin/tickets/t1");
  });

  it("a reply shows the admin's words safely, with the link to reply", () => {
    const email = renderEmail({
      kind: "ticket_reply",
      to: "ada@example.com",
      name: "Ada",
      number: 7,
      subject: "Payout missing",
      message: "Use <b>Settings</b>\nthen Payouts",
      link: "https://gbam.app/help/tickets/t1?k=secret",
    });
    expect(email.to).toBe("ada@example.com");
    expect(email.html).toContain("Use &lt;b&gt;Settings&lt;/b&gt;");
    expect(email.html).toContain("https://gbam.app/help/tickets/t1?k=secret");
    expect(email.text).toContain("Read and reply: https://gbam.app/help/tickets/t1?k=secret");
  });

  it("the assignee is told there's a reply, without the reply itself", () => {
    const email = renderEmail({
      kind: "ticket_requester_replied",
      to: "chika@gbam.app",
      number: 7,
      subject: "Payout missing",
      adminUrl: "https://gbam.app/admin/tickets/t1",
    });
    expect(email.subject).toBe("New reply on ticket #7");
    expect(email.text).toContain("https://gbam.app/admin/tickets/t1");
  });
});

describe("announcement email", () => {
  const job = {
    kind: "announcement" as const,
    to: "ada@example.com",
    subject: "Delivery zones are here",
    body: "Hello **Ada**",
    buttonLabel: "Set up delivery",
    buttonUrl: "https://gbam.app/dashboard/settings",
    unsubscribeUrl: "https://gbam.app/unsubscribe?s=1&t=2",
    oneClickUrl: "https://gbam.app/api/unsubscribe?s=1&t=2",
  };

  it("carries the unsubscribe link and one-click headers", () => {
    const email = renderEmail(job);
    expect(email.headers).toEqual({
      "List-Unsubscribe": "<https://gbam.app/api/unsubscribe?s=1&t=2>",
      "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
    });
    expect(email.html).toContain("Unsubscribe from news and tips");
    expect(email.html).toContain("https://gbam.app/unsubscribe?s=1&amp;t=2");
    expect(email.html).toContain("Set up delivery");
    expect(email.text).toContain(
      "Unsubscribe from news and tips: https://gbam.app/unsubscribe?s=1&t=2",
    );
  });

  it("a test is marked in the subject", () => {
    expect(renderEmail({ ...job, test: true }).subject).toBe("[Test] Delivery zones are here");
  });
});
