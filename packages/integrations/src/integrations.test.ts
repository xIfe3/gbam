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
    expect(renderTemplate("order_cancelled", ["Ada", "GB-7K3Q", "Mama Ngozi"])).toBe(
      "Hi *Ada*, order *GB-7K3Q* from *Mama Ngozi* has been cancelled. " +
        "If you have already paid, please contact the seller about your payment.",
    );
  });

  it("throws when a param is missing, instead of sending {{2}} to a customer", () => {
    expect(() => renderTemplate("order_cancelled", ["Ada"])).toThrow("{{2}}");
  });

  it("every body starts and ends with words: Meta rejects a {{n}} at either end", () => {
    for (const body of Object.values(WHATSAPP_TEMPLATES)) {
      expect(body).not.toMatch(/^\{\{/);
      expect(body).not.toMatch(/\}\}\.?$/);
    }
  });

  it("has a new-order alert for sellers", () => {
    expect(renderTemplate("seller_new_order", ["Mama Ngozi", "GB-7K3Q", "₦9,000", "Ada"])).toBe(
      "Hi *Mama Ngozi*, you have a new order *GB-7K3Q* for *₦9,000* from *Ada*. " +
        "Open your Gbam dashboard to confirm it.",
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
      template: "order_cancelled",
      params: ["Ada", "GB-7K3Q", "Mama Ngozi"],
    });
    expect(sent.messageId).toBe("wamid.1");
    expect(calls[0]?.url).toBe("https://graph.facebook.com/v25.0/123/messages");
    expect(calls[0]?.body).toMatchObject({
      to: "2348031234567",
      type: "template",
      template: { name: "order_cancelled", language: { code: "en" } },
    });
  });

  it("fills in the end of the pay button's address", async () => {
    const calls = fakeFetch();
    const client = new HttpWhatsAppClient(config);
    await client.sendTemplate({
      to: "2348031234567",
      template: "order_payment_request",
      params: ["Ada", "GB-7K3Q", "Mama Ngozi", "₦9,000"],
      buttonUrlSuffix: "GB-7K3Q?k=abc",
    });
    expect(calls[0]?.body).toMatchObject({
      template: {
        components: [
          { type: "body" },
          {
            type: "button",
            sub_type: "url",
            index: "0",
            parameters: [{ type: "text", text: "GB-7K3Q?k=abc" }],
          },
        ],
      },
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
