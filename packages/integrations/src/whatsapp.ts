import { z } from "zod";

/**
 * WhatsApp Cloud API. Business-initiated messages (everything we send about orders)
 * must use a pre-approved TEMPLATE; free text only works within 24h of the customer
 * messaging us. Templates are created in Meta Business Manager, see WHATSAPP_TEMPLATES.
 */
export interface WhatsAppClient {
  sendTemplate(input: SendTemplateInput): Promise<{ messageId: string }>;
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
 */
export const WHATSAPP_TEMPLATES = {
  gbam_order_received:
    "Hi {{1}}, {{2}} has received your order {{3}} ({{4}}). You'll get payment details here shortly.",
  gbam_payment_request: "Hi {{1}}, please pay {{2}} for order {{3}} from {{4}}: {{5}}",
  gbam_order_paid: "Payment of {{1}} received for order {{2}}. Thank you! {{3}} is on it.",
  gbam_order_fulfilled: "Good news! Your order {{1}} from {{2}} is ready / on its way.",
  gbam_order_delivered: "Your order {{1}} has been delivered. Thanks for buying from {{2}}!",
  gbam_order_cancelled: "Your order {{1}} from {{2}} has been cancelled.",
  gbam_order_refunded: "Your payment for order {{1}} from {{2}} has been refunded.",
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
    const { accessToken, phoneNumberId, apiVersion } = this.config;

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

    const url = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    const res = await fetch(url, {
      method: "POST",
      headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: input.to,
        type: "template",
        template,
      }),
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
}

/** Fills {{1}}, {{2}}… the way WhatsApp will. Used by the fake and in tests. */
export function renderTemplate(template: WhatsAppTemplateName, params: string[]): string {
  return WHATSAPP_TEMPLATES[template].replace(/\{\{(\d+)\}\}/g, (_, n: string) => {
    const value = params[Number(n) - 1];
    if (value === undefined) throw new Error(`Template ${template} is missing param {{${n}}}`);
    return value;
  });
}
