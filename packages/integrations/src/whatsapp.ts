import { z } from "zod";

/**
 * WhatsApp Cloud API. Business-initiated messages (everything we send about orders)
 * must use a pre-approved TEMPLATE; free text only works within 24h of the customer
 * messaging us. Templates are created in Meta Business Manager, see WHATSAPP_TEMPLATES.
 */
export interface WhatsAppClient {
  sendTemplate(input: SendTemplateInput): Promise<{ messageId: string }>;
  /**
   * Plain text, no template. Meta only allows this within 24 hours of the person messaging
   * us, so it's used only to answer a customer who just wrote to gbam's number.
   */
  sendText(to: string, text: string): Promise<{ messageId: string }>;
}

export type SendTemplateInput = {
  /** "2348031234567" */
  to: string;
  template: WhatsAppTemplateName;
  /** Values for {{1}}, {{2}}, … in order. */
  params: string[];
  languageCode?: string;
};

/**
 * Every template the app sends. Create each one in Meta Business Manager
 * (WhatsApp Manager → Message templates) with category "Utility", language "English",
 * and exactly this name and body. Meta must approve them before real sends work.
 *
 * Customer messages say which shop they're from first, and end with a link to chat with
 * the shop itself: replies to gbam's number aren't read (see autoReplyText). Meta rejects
 * a template that starts or ends with a {{n}}, so each one starts and ends with words.
 */
export const WHATSAPP_TEMPLATES = {
  // Only for shops that check each order first; other shops send the payment request at once.
  gbam_order_received:
    "Order update from {{1}}: hi {{2}}, we've received your order {{3}} ({{4}}). " +
    "The shop will check it and send your payment link here. " +
    "Chat with the shop at {{5}} if you have questions.",
  gbam_payment_request:
    "Order update from {{1}}: hi {{2}}, please pay {{3}} for order {{4}} here: {{5}} . " +
    "Chat with the shop at {{6}} if you have questions.",
  gbam_order_paid:
    "Order update from {{1}}: payment of {{2}} received for order {{3}}. " +
    "Thank you! Chat with the shop at {{4}} if you have questions.",
  // Also covers "delivered": no separate delivered message is sent (each one costs money).
  gbam_order_fulfilled:
    "Order update from {{1}}: good news, your order {{2}} is ready or on its way. " +
    "Chat with the shop at {{3}} if you have questions.",
  gbam_order_cancelled:
    "Order update from {{1}}: your order {{2}} has been cancelled. " +
    "Chat with the shop at {{3}} if you have questions.",
  // "Refunded" is a status the seller sets; gbam doesn't move the money, so it doesn't claim to.
  gbam_order_refunded:
    "Order update from {{1}}: the shop has marked your order {{2}} as refunded. " +
    "If the money hasn't reached you, chat with the shop at {{3}} about it.",
  // To the SELLER: a new order came in.
  gbam_seller_new_order:
    "New Gbam order {{1}}: {{2}} from {{3}}. See it at {{4}} on your Gbam dashboard.",
  // To the SELLER: an order they need to check (shops that approve orders first) is waiting.
  gbam_seller_order_waiting:
    "Order {{1}} ({{2}}) is still waiting for you. " +
    "Open {{3}} and tap Request payment so the customer can pay.",
} as const;

export type WhatsAppTemplateName = keyof typeof WHATSAPP_TEMPLATES;

export class WhatsAppError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    /** Meta error code, e.g. 132001 = template doesn't exist. */
    readonly code?: number,
  ) {
    super(message);
    this.name = "WhatsAppError";
  }
}

const sendResponse = z.object({ messages: z.array(z.object({ id: z.string() })).min(1) });
const errorResponse = z.object({
  error: z.object({ message: z.string(), code: z.number().optional() }),
});

export class HttpWhatsAppClient implements WhatsAppClient {
  constructor(
    private readonly config: { accessToken: string; phoneNumberId: string; apiVersion: string },
  ) {}

  async sendTemplate(input: SendTemplateInput) {
    let languageCode = "en";
    if (input.languageCode) {
      languageCode = input.languageCode;
    }

    // The {{1}}, {{2}}, ... values, in the shape Meta's API expects.
    const parameters = [];
    for (const text of input.params) {
      parameters.push({ type: "text", text });
    }

    const template: Record<string, unknown> = {
      name: input.template,
      language: { code: languageCode },
    };
    if (parameters.length > 0) {
      template.components = [{ type: "body", parameters }];
    }

    return this.send({
      messaging_product: "whatsapp",
      to: input.to,
      type: "template",
      template,
    });
  }

  async sendText(to: string, text: string) {
    return this.send({ messaging_product: "whatsapp", to, type: "text", text: { body: text } });
  }

  /** Posts one message to Meta and returns its id, or throws a WhatsAppError. */
  private async send(body: Record<string, unknown>) {
    const { accessToken, phoneNumberId, apiVersion } = this.config;
    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000), // give up after 15 seconds
    });

    const json = await readJson(res);

    if (!res.ok) {
      let message = `WhatsApp send failed (${res.status})`;
      let code: number | undefined = undefined;
      const error = errorResponse.safeParse(json);
      if (error.success) {
        message = error.data.error.message;
        code = error.data.error.code;
      }
      throw new WhatsAppError(message, res.status, code);
    }

    const parsed = sendResponse.parse(json);
    const firstMessage = parsed.messages[0];
    if (!firstMessage) {
      throw new WhatsAppError("WhatsApp accepted the request but returned no message id");
    }
    return { messageId: firstMessage.id };
  }
}

/** Reads a response body as JSON, or returns null if it isn't valid JSON. */
async function readJson(res: Response): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

/** Used when WhatsApp credentials are unset: prints the rendered message instead. */
export class FakeWhatsAppClient implements WhatsAppClient {
  constructor(private readonly log: (message: string) => void = console.log) {}

  async sendTemplate({ to, template, params }: SendTemplateInput) {
    this.log(`[fake whatsapp] → +${to}: ${renderTemplate(template, params)}`);
    return { messageId: `fake-${Date.now()}` };
  }

  async sendText(to: string, text: string) {
    this.log(`[fake whatsapp] → +${to}: ${text}`);
    return { messageId: `fake-${Date.now()}` };
  }
}

/** Fills {{1}}, {{2}}… the way WhatsApp will. Used by the fake and in tests. */
export function renderTemplate(template: WhatsAppTemplateName, params: string[]): string {
  return WHATSAPP_TEMPLATES[template].replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    const value = params[Number(n) - 1];
    if (value === undefined) throw new Error(`Template ${template} is missing param {{${n}}}`);
    return value;
  });
}
