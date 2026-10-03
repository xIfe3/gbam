/**
 * Meta → us: the WhatsApp webhook.
 *
 * Meta sends two kinds of events here:
 *   - statuses: what happened to a message WE sent (sent, delivered, read, failed)
 *   - messages: a customer wrote to OUR number (we only log these for now)
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Meta signs every webhook: header `X-Hub-Signature-256: sha256=<hex>`, where hex is
 * HMAC-SHA256 of the raw body using your App Secret (App settings → Basic).
 * Like Paystack, it must be checked against the exact raw bytes.
 */
export function verifyMetaSignature(
  rawBody: Buffer | string,
  signatureHeader: string | undefined,
  appSecret: string,
): boolean {
  if (!signatureHeader || !signatureHeader.startsWith("sha256=")) {
    return false;
  }
  const received = Buffer.from(signatureHeader.slice("sha256=".length), "hex");
  const expected = createHmac("sha256", appSecret).update(rawBody).digest();
  // Constant-time compare so an attacker can't guess the signature byte by byte.
  if (received.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(received, expected);
}

export function signMetaPayload(rawBody: string, appSecret: string): string {
  const hex = createHmac("sha256", appSecret).update(rawBody).digest("hex");
  return `sha256=${hex}`;
}

/** The statuses Meta reports for a message we sent, in the order they happen. */
export const WHATSAPP_DELIVERY_STATUSES = ["sent", "delivered", "read", "failed"] as const;
export type WhatsAppDeliveryStatus = (typeof WHATSAPP_DELIVERY_STATUSES)[number];

const statusSchema = z.object({
  id: z.string(), // the message id ("wamid...") Meta gave us when we sent it
  status: z.string(),
  recipient_id: z.string().optional(),
  errors: z
    .array(
      z
        .object({
          code: z.number(),
          title: z.string().optional(),
          message: z.string().optional(),
          error_data: z.object({ details: z.string().optional() }).optional(),
        })
        .loose(),
    )
    .optional(),
});

const incomingMessageSchema = z
  .object({
    from: z.string(),
    id: z.string(),
    type: z.string(),
    text: z.object({ body: z.string() }).optional(),
  })
  .loose();

/** Meta's envelope: entry[] → changes[] → value { statuses?, messages? }. */
export const whatsappWebhookSchema = z.object({
  object: z.string(),
  entry: z.array(
    z.object({
      changes: z.array(
        z.object({
          field: z.string(),
          value: z
            .object({
              statuses: z.array(statusSchema).optional(),
              messages: z.array(incomingMessageSchema).optional(),
            })
            .loose(),
        }),
      ),
    }),
  ),
});

export type WhatsAppStatusUpdate = {
  messageId: string;
  status: WhatsAppDeliveryStatus;
  errorCode: number | null;
  errorMessage: string | null;
};

export type WhatsAppIncomingMessage = { from: string; messageId: string; text: string | null };

function isDeliveryStatus(value: string): value is WhatsAppDeliveryStatus {
  for (const status of WHATSAPP_DELIVERY_STATUSES) {
    if (status === value) {
      return true;
    }
  }
  return false;
}

/** Flattens Meta's nested envelope into simple lists we can loop over. */
export function readWhatsAppWebhook(body: z.output<typeof whatsappWebhookSchema>) {
  const statusUpdates: WhatsAppStatusUpdate[] = [];
  const incomingMessages: WhatsAppIncomingMessage[] = [];

  for (const entry of body.entry) {
    for (const change of entry.changes) {
      const statuses = change.value.statuses || [];
      for (const status of statuses) {
        if (!isDeliveryStatus(status.status)) {
          continue; // a status we don't track (Meta adds new ones occasionally)
        }
        const known = status.status;

        let errorCode: number | null = null;
        let errorMessage: string | null = null;
        if (status.errors && status.errors.length > 0) {
          const firstError = status.errors[0];
          if (firstError) {
            errorCode = firstError.code;
            // Use the most specific explanation Meta gave us.
            if (firstError.error_data && firstError.error_data.details) {
              errorMessage = firstError.error_data.details;
            } else if (firstError.message) {
              errorMessage = firstError.message;
            } else if (firstError.title) {
              errorMessage = firstError.title;
            }
          }
        }

        statusUpdates.push({ messageId: status.id, status: known, errorCode, errorMessage });
      }

      const messages = change.value.messages || [];
      for (const message of messages) {
        let text: string | null = null;
        if (message.text) {
          text = message.text.body;
        }
        incomingMessages.push({ from: message.from, messageId: message.id, text });
      }
    }
  }

  return { statusUpdates, incomingMessages };
}
