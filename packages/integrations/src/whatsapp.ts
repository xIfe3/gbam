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
  /**
   * For a template with a dynamic URL button: the end of the button's address, e.g.
   * "GB-7K3Q?k=abc" for https://gbam.zephra.dev/pay/{{1}}.
   */
  buttonUrlSuffix?: string;
  languageCode?: string;
};

/**
 * Every template the app sends. Each must exist in Meta (WhatsApp Manager → Message
 * templates) with category "Utility", language "English", and exactly this name and body,
 * and Meta must approve it before real sends work. Meta rejects a template that starts or
 * ends with a {{n}}, so each one starts and ends with words.
 *
 * order_payment_request and payment_reminder also have a "Visit website" button whose URL in
 * Meta is dynamic: https://gbam.zephra.dev/pay/{{1}}. We send the end of that address
 * (see TEMPLATES_WITH_PAY_BUTTON and SendTemplateInput.buttonUrlSuffix).
 */
export const WHATSAPP_TEMPLATES = {
  // ---- To customers (approved in Meta) ----
  order_payment_request:
    "Hi {{1}}, your order {{2}} from {{3}} is ready for payment. Total: {{4}}. " +
    "Tap the button below to pay securely with Paystack.",
  payment_reminder:
    "Hi *{{1}}*, order *{{2}}* from *{{3}}* for *{{4}}* is still waiting for payment. " +
    "Tap the button below to complete it. Please ignore this if you have already paid.",
  payment_received:
    "Hi {{1}}, we have received your payment of {{2}} for order {{3}} from {{4}}. " +
    "The seller has been notified and will prepare your order.",
  order_out_for_delivery:
    "Hi {{1}}, your order {{2}} from {{3}} is on the way. Estimated delivery: {{4}}. Thank you",
  order_cancelled:
    "Hi *{{1}}*, order *{{2}}* from *{{3}}* has been cancelled. " +
    "If you have already paid, please contact the seller about your payment.",

  // ---- To customers (still to submit to Meta) ----
  // Only for shops that check each order first; other shops ask for payment straight away.
  order_received:
    "Hi *{{1}}*, *{{2}}* has received your order *{{3}}* for *{{4}}*. " +
    "The seller will check it and send your payment link here shortly.",
  // "Refunded" is a status the seller sets; gbam doesn't move the money, so it doesn't claim to.
  order_refunded:
    "Hi *{{1}}*, *{{2}}* has marked your order *{{3}}* as refunded. " +
    "If the money hasn't reached you, please contact the seller.",

  // ---- To sellers ----
  // Approved in Meta.
  seller_new_order:
    "Hi *{{1}}*, you have a new order *{{2}}* for *{{3}}* from *{{4}}*. " +
    "Open your Gbam dashboard to confirm it.",
  // Still to submit: the 30-minute reminder for shops that check each order first.
  seller_order_waiting:
    "Hi *{{1}}*, order *{{2}}* for *{{3}}* is still waiting for you. " +
    "Open your Gbam dashboard and tap Request payment so the customer can pay.",
} as const;

/** Templates with the dynamic "pay" button: they need SendTemplateInput.buttonUrlSuffix. */
export const TEMPLATES_WITH_PAY_BUTTON: readonly WhatsAppTemplateName[] = [
  "order_payment_request",
  "payment_reminder",
];

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
    // "components" are the parts of the template we fill in: the body's {{n}} values, and
    // the end of the button's address when the template has a dynamic URL button.
    const components: Record<string, unknown>[] = [];
    if (parameters.length > 0) {
      components.push({ type: "body", parameters });
    }
    if (input.buttonUrlSuffix !== undefined) {
      components.push({
        type: "button",
        sub_type: "url",
        index: "0",
        parameters: [{ type: "text", text: input.buttonUrlSuffix }],
      });
    }
    if (components.length > 0) {
      template.components = components;
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

  async sendTemplate({ to, template, params, buttonUrlSuffix }: SendTemplateInput) {
    let button = "";
    if (buttonUrlSuffix !== undefined) {
      button = ` [Pay button → /pay/${buttonUrlSuffix}]`;
    }
    this.log(`[fake whatsapp] → +${to}: ${renderTemplate(template, params)}${button}`);
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
