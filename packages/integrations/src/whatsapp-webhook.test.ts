import { describe, expect, it } from "vitest";
import {
  readWhatsAppWebhook,
  signMetaPayload,
  verifyMetaSignature,
  whatsappWebhookSchema,
} from "./whatsapp-webhook";

describe("verifyMetaSignature", () => {
  const secret = "app-secret";
  const body = JSON.stringify({ object: "whatsapp_business_account", entry: [] });

  it("accepts a correctly signed body", () => {
    expect(verifyMetaSignature(body, signMetaPayload(body, secret), secret)).toBe(true);
  });

  it("rejects tampering, the wrong secret, and missing or malformed headers", () => {
    const signature = signMetaPayload(body, secret);
    expect(verifyMetaSignature(body + " ", signature, secret)).toBe(false);
    expect(verifyMetaSignature(body, signMetaPayload(body, "other"), secret)).toBe(false);
    expect(verifyMetaSignature(body, undefined, secret)).toBe(false);
    expect(verifyMetaSignature(body, "md5=abc", secret)).toBe(false);
  });
});

describe("readWhatsAppWebhook", () => {
  it("pulls out status updates, including the failure reason", () => {
    const body = whatsappWebhookSchema.parse({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                statuses: [
                  { id: "wamid.A", status: "delivered", recipient_id: "2348000000000" },
                  {
                    id: "wamid.B",
                    status: "failed",
                    errors: [
                      {
                        code: 131026,
                        title: "Message undeliverable",
                        error_data: { details: "Recipient is not on WhatsApp" },
                      },
                    ],
                  },
                  { id: "wamid.C", status: "some_new_status" },
                ],
              },
            },
          ],
        },
      ],
    });

    const { statusUpdates } = readWhatsAppWebhook(body);
    expect(statusUpdates).toEqual([
      { messageId: "wamid.A", status: "delivered", errorCode: null, errorMessage: null },
      {
        messageId: "wamid.B",
        status: "failed",
        errorCode: 131026,
        errorMessage: "Recipient is not on WhatsApp",
      },
    ]);
  });

  it("pulls out incoming customer messages", () => {
    const body = whatsappWebhookSchema.parse({
      object: "whatsapp_business_account",
      entry: [
        {
          changes: [
            {
              field: "messages",
              value: {
                messages: [
                  { from: "2348011112222", id: "wamid.IN", type: "text", text: { body: "Hi" } },
                ],
              },
            },
          ],
        },
      ],
    });
    expect(readWhatsAppWebhook(body).incomingMessages).toEqual([
      { from: "2348011112222", messageId: "wamid.IN", text: "Hi" },
    ]);
  });
});
