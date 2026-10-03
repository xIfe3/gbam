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
});
