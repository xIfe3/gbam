import { z } from "zod";

/** Sends one transactional email (verification codes, password resets, contact form). */
export interface EmailClient {
  send(input: SendEmailInput): Promise<{ id: string }>;
}

export type SendEmailInput = {
  to: string;
  subject: string;
  text: string;
  html: string;
  /** Where replies go, e.g. the person who filled in the contact form. */
  replyTo?: string;
  /** Extra email headers, e.g. List-Unsubscribe on announcements. */
  headers?: Record<string, string>;
};

export class EmailError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "EmailError";
  }
}

const sendResponse = z.object({ id: z.string() });
const errorResponse = z.object({ message: z.string() });

/** Resend (https://resend.com): POST /emails with a Bearer API key. */
export class ResendEmailClient implements EmailClient {
  constructor(
    private readonly apiKey: string,
    /** "Gbam <no-reply@gbam.app>": the domain must be verified in Resend. */
    private readonly from: string,
  ) {}

  async send(input: SendEmailInput) {
    const body: Record<string, unknown> = {
      from: this.from,
      to: [input.to],
      subject: input.subject,
      text: input.text,
      html: input.html,
    };
    if (input.replyTo) {
      body.reply_to = input.replyTo;
    }
    if (input.headers) {
      body.headers = input.headers;
    }

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15_000), // give up after 15 seconds
    });

    const json = await readJson(res);

    if (!res.ok) {
      let message = `Email send failed (${res.status})`;
      const error = errorResponse.safeParse(json);
      if (error.success) {
        message = error.data.message;
      }
      throw new EmailError(message, res.status);
    }

    const parsed = sendResponse.parse(json);
    return { id: parsed.id };
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

/** Used when RESEND_API_KEY is unset: prints the email instead of sending it. */
export class FakeEmailClient implements EmailClient {
  constructor(private readonly log: (message: string) => void = console.log) {}

  async send({ to, subject, text }: SendEmailInput) {
    this.log(`[fake email] → ${to}: ${subject}\n${text}`);
    return { id: `fake-${Date.now()}` };
  }
}
