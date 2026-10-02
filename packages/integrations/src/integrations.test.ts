import { describe, expect, it } from "vitest";
import { signPaystackPayload, verifyPaystackSignature } from "./paystack";
import { WHATSAPP_TEMPLATES, renderTemplate, type WhatsAppTemplateName } from "./whatsapp";

describe("verifyPaystackSignature", () => {
  const secret = "sk_test_abc";
  const body = JSON.stringify({ event: "charge.success", data: { reference: "ref_1" } });

  it("accepts a correctly signed body", () => {
    expect(verifyPaystackSignature(body, signPaystackPayload(body, secret), secret)).toBe(true);
  });

  it("rejects a tampered body", () => {
    const signature = signPaystackPayload(body, secret);
    const tampered = body.replace("ref_1", "ref_2");
    expect(verifyPaystackSignature(tampered, signature, secret)).toBe(false);
  });

  it("rejects the wrong secret, a missing signature and garbage", () => {
    expect(verifyPaystackSignature(body, signPaystackPayload(body, "sk_other"), secret)).toBe(
      false,
    );
    expect(verifyPaystackSignature(body, undefined, secret)).toBe(false);
    expect(verifyPaystackSignature(body, "not-hex", secret)).toBe(false);
  });
});

describe("WhatsApp templates", () => {
  it("renders params into the body", () => {
    expect(renderTemplate("gbam_order_cancelled", ["GB-7K3Q", "Mama Ngozi"])).toBe(
      "Your order GB-7K3Q from Mama Ngozi has been cancelled.",
    );
  });

  it("throws when a param is missing, instead of sending {{2}} to a customer", () => {
    expect(() => renderTemplate("gbam_order_cancelled", ["GB-7K3Q"])).toThrow("{{2}}");
  });

  it("uses names Meta accepts (lowercase, digits, underscores)", () => {
    for (const name of Object.keys(WHATSAPP_TEMPLATES) as WhatsAppTemplateName[]) {
      expect(name).toMatch(/^[a-z0-9_]+$/);
    }
  });
});
