import { describe, expect, it } from "vitest";
import { renderEmail } from "./templates.js";

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
      totalKobo: 500_000,
      orderUrl: "https://gbam.app/dashboard/orders/1",
      settingsUrl: "https://gbam.app/dashboard/settings",
    });
    expect(email.html).toContain("https://gbam.app/dashboard/settings");
    expect(email.text).toContain("Turn them off");
  });
});
