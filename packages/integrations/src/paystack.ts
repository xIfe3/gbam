import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

/**
 * Thin typed client for the two Paystack endpoints we use.
 * Business logic never talks to Paystack directly; it goes through PaystackClient,
 * so tests and keyless dev use FakePaystackClient instead.
 */
export interface PaystackClient {
  initializeTransaction(input: InitializeTransactionInput): Promise<InitializedTransaction>;
  verifyTransaction(reference: string): Promise<VerifiedTransaction>;
}

export type InitializeTransactionInput = {
  reference: string;
  amountKobo: number;
  email: string;
  callbackUrl?: string;
  /** Seller's subaccount, so Paystack splits the money to them directly. */
  subaccount?: string;
  metadata?: Record<string, unknown>;
};

export type InitializedTransaction = { authorizationUrl: string; reference: string };

export type VerifiedTransaction = {
  reference: string;
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "reversed" | (string & {});
  amountKobo: number;
  currency: string;
  raw: unknown;
};

export class PaystackError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = "PaystackError";
  }
}

const paystackEnvelope = z.object({
  status: z.literal(true),
  message: z.string(),
  data: z.unknown(),
});

const initializeData = z.object({ authorization_url: z.url(), reference: z.string() });

const verifyData = z
  .object({ reference: z.string(), status: z.string(), amount: z.number(), currency: z.string() })
  .loose();

export class HttpPaystackClient implements PaystackClient {
  constructor(
    private readonly secretKey: string,
    private readonly baseUrl = "https://api.paystack.co",
  ) {}

  async initializeTransaction(input: InitializeTransactionInput) {
    const body = await this.request("/transaction/initialize", initializeData, {
      method: "POST",
      body: JSON.stringify({
        reference: input.reference,
        amount: input.amountKobo,
        email: input.email,
        currency: "NGN",
        callback_url: input.callbackUrl,
        subaccount: input.subaccount,
        metadata: input.metadata,
      }),
    });
    return { authorizationUrl: body.authorization_url, reference: body.reference };
  }

  async verifyTransaction(reference: string) {
    const body = await this.request(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      verifyData,
    );
    return {
      reference: body.reference,
      status: body.status,
      amountKobo: body.amount,
      currency: body.currency,
      raw: body,
    };
  }

  /**
   * Calls a Paystack endpoint and returns the `data` part of its reply.
   * Paystack always answers as { status: true/false, message: "...", data: {...} }.
   * `dataSchema` describes what `data` must look like; anything else is an error.
   */
  private async request<D extends z.ZodType>(
    path: string,
    dataSchema: D,
    init: RequestInit = {},
  ): Promise<z.output<D>> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      ...init, // method and body, when given
      headers: {
        authorization: `Bearer ${this.secretKey}`,
        "content-type": "application/json",
      },
      signal: AbortSignal.timeout(15_000), // give up after 15 seconds
    });

    let json: unknown = null;
    try {
      json = await res.json();
    } catch {
      // Not JSON (e.g. an HTML error page). Handled as a failure below.
    }

    const envelope = paystackEnvelope.safeParse(json);
    if (res.ok && envelope.success) {
      const data = dataSchema.safeParse(envelope.data.data);
      if (data.success) {
        return data.data;
      }
    }

    // Something went wrong. Use Paystack's own message if it sent one.
    let message = `Paystack ${path} failed (${res.status})`;
    const errorBody = z.object({ message: z.string() }).safeParse(json);
    if (errorBody.success) {
      message = errorBody.data.message;
    }
    throw new PaystackError(message, res.status);
  }
}

/**
 * Paystack signs every webhook with HMAC-SHA512 of the raw body, keyed by your secret key.
 * MUST be checked against the exact raw bytes: re-serialised JSON won't match.
 */
export function verifyPaystackSignature(
  rawBody: Buffer | string,
  signature: string | undefined,
  secretKey: string,
): boolean {
  if (!signature) return false;
  const expected = createHmac("sha512", secretKey).update(rawBody).digest("hex");
  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(signature, "hex");
  // Constant-time compare so an attacker can't guess the signature byte by byte.
  return a.length === b.length && timingSafeEqual(a, b);
}

export function signPaystackPayload(rawBody: string, secretKey: string): string {
  return createHmac("sha512", secretKey).update(rawBody).digest("hex");
}

export const paystackWebhookSchema = z.object({
  event: z.string(),
  data: z.object({ reference: z.string() }).loose(),
});

/**
 * Used when PAYSTACK_SECRET_KEY is unset (local dev, tests). Behaves as if every
 * transaction was paid in full. Drive it with `pnpm simulate:payment <order code>`.
 *
 * Real Paystack remembers each transaction's amount across processes; the fake can't,
 * so `lookupAmount` plays that role (wired to our payments table).
 */
export class FakePaystackClient implements PaystackClient {
  constructor(
    private readonly lookupAmount: (reference: string) => Promise<number | undefined>,
    private readonly log: (message: string) => void = console.log,
  ) {}

  async initializeTransaction(input: InitializeTransactionInput) {
    this.log(`[fake paystack] initialize ${input.reference} for ${input.amountKobo} kobo`);
    return {
      authorizationUrl: `https://checkout.paystack.com/fake-${input.reference}`,
      reference: input.reference,
    };
  }

  async verifyTransaction(reference: string) {
    const amountKobo = await this.lookupAmount(reference);
    if (amountKobo === undefined) throw new PaystackError("Transaction reference not found", 404);
    return { reference, status: "success", amountKobo, currency: "NGN", raw: { fake: true } };
  }
}
