import { afterEach, describe, expect, it, vi } from "vitest";
import { signPaystackPayload, verifyPaystackSignature } from "./paystack";
import {
  HttpWhatsAppClient,
  WHATSAPP_TEMPLATES,
  renderTemplate,
  type WhatsAppTemplateName,
} from "./whatsapp";

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
    expect(
      renderTemplate("gbam_order_cancelled", ["Mama Ngozi", "GB-7K3Q", "https://wa.me/234800"]),
    ).toBe(
      "Order update from Mama Ngozi: your order GB-7K3Q has been cancelled. " +
        "Chat with the shop at https://wa.me/234800 if you have questions.",
    );
  });

  it("throws when a param is missing, instead of sending {{2}} to a customer", () => {
    expect(() => renderTemplate("gbam_order_cancelled", ["Mama Ngozi"])).toThrow("{{2}}");
  });

  it("every body starts and ends with words: Meta rejects a {{n}} at either end", () => {
    for (const body of Object.values(WHATSAPP_TEMPLATES)) {
      expect(body).not.toMatch(/^\{\{/);
      expect(body).not.toMatch(/\}\}\.?$/);
    }
  });

  it("has a new-order alert for sellers", () => {
    expect(
      renderTemplate("gbam_seller_new_order", [
        "GB-7K3Q",
        "₦9,000",
        "Ada",
        "https://gbam.app/dashboard/orders/1",
      ]),
    ).toBe(
      "New Gbam order GB-7K3Q: ₦9,000 from Ada. " +
        "See it at https://gbam.app/dashboard/orders/1 on your Gbam dashboard.",
    );
  });

  it("uses names Meta accepts (lowercase, digits, underscores)", () => {
    for (const name of Object.keys(WHATSAPP_TEMPLATES) as WhatsAppTemplateName[]) {
      expect(name).toMatch(/^[a-z0-9_]+$/);
    }
  });
});

describe("HttpWhatsAppClient", () => {
  const config = { accessToken: "token", phoneNumberId: "123", apiVersion: "v25.0" };

  /** Replaces fetch for one test: records the request, answers like Meta does. */
  function fakeFetch() {
    const calls: { url: string; body: unknown }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: { body: string }) => {
      calls.push({ url, body: JSON.parse(init.body) });
      return new Response(JSON.stringify({ messages: [{ id: "wamid.1" }] }), { status: 200 });
    });
    return calls;
  }

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("sends a template with its values in order", async () => {
    const calls = fakeFetch();
    const client = new HttpWhatsAppClient(config);
    const sent = await client.sendTemplate({
      to: "2348031234567",
      template: "gbam_order_cancelled",
      params: ["Mama Ngozi", "GB-7K3Q", "https://wa.me/234800"],
    });
    expect(sent.messageId).toBe("wamid.1");
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v25.0/123/messages");
    expect(calls[0]?.body).toMatchObject({
      to: "2348031234567",
      type: "template",
      template: { name: "gbam_order_cancelled", language: { code: "en" } },
    });
  });

  it("sends plain text (a reply to a customer who wrote to us)", async () => {
    const calls = fakeFetch();
    const client = new HttpWhatsAppClient(config);
    const sent = await client.sendText("2348031234567", "Hi! This number only sends updates.");
    expect(sent.messageId).toBe("wamid.1");
    expect(calls[0]?.body).toEqual({
      messaging_product: "whatsapp",
      to: "2348031234567",
      type: "text",
      text: { body: "Hi! This number only sends updates." },
    });
  });
});
