import { createHmac, timingSafeEqual } from "node:crypto";
import { estimatePaystackFee } from "@gbam/shared";
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
  /**
   * Split the payment with a seller. Paystack sends the money to the seller's
   * subaccount, minus `platformFeeKobo` (our cut) which stays in our main account.
   * The seller's share also pays Paystack's own fee ("bearer: subaccount").
   */
  split?: { subaccount: string; platformFeeKobo: number };
  metadata?: Record<string, unknown>;
};

export type InitializedTransaction = { authorizationUrl: string; reference: string };

export type VerifiedTransaction = {
  reference: string;
  status: "success" | "failed" | "abandoned" | "ongoing" | "pending" | "reversed" | (string & {});
  amountKobo: number;
  currency: string;
  /** What Paystack charged for this transaction, in kobo. null if it didn't say. */
  paystackFeeKobo: number | null;
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
  .object({
    reference: z.string(),
    status: z.string(),
    amount: z.number(),
    currency: z.string(),
    fees: z.number().nullable().optional(), // Paystack's fee in kobo
  })
  .loose(); // .loose() = keep any other fields Paystack sends (we store them as `raw`)

export class HttpPaystackClient implements PaystackClient {
  constructor(
    private readonly secretKey: string,
    private readonly baseUrl = "https://api.paystack.co",
  ) {}

  async initializeTransaction(input: InitializeTransactionInput) {
    const params: Record<string, unknown> = {
      reference: input.reference,
      amount: input.amountKobo,
      email: input.email,
      currency: "NGN",
      callback_url: input.callbackUrl,
      metadata: input.metadata,
    };
    if (input.split) {
      params.subaccount = input.split.subaccount;
      // A flat amount (kobo) for our main account. It overrides the percentage set on the
      // subaccount in the Paystack dashboard, so our code is the one source of truth.
      params.transaction_charge = input.split.platformFeeKobo;
      // Paystack's fee comes out of the seller's share, not ours.
      params.bearer = "subaccount";
    }

    const body = await this.request("/transaction/initialize", initializeData, {
      method: "POST",
      body: JSON.stringify(params),
    });
    return { authorizationUrl: body.authorization_url, reference: body.reference };
  }

  async verifyTransaction(reference: string) {
    const body = await this.request(
      `/transaction/verify/${encodeURIComponent(reference)}`,
      verifyData,
    );

    let paystackFeeKobo: number | null = null;
    if (typeof body.fees === "number") {
      paystackFeeKobo = body.fees;
    }

    return {
      reference: body.reference,
      status: body.status,
      amountKobo: body.amount,
      currency: body.currency,
      paystackFeeKobo,
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
    let splitNote = "no split";
    if (input.split) {
      splitNote =
        `split to ${input.split.subaccount}, gbam fee ${input.split.platformFeeKobo} kobo, ` +
        `seller pays Paystack fee`;
    }
    this.log(
      `[fake paystack] initialize ${input.reference} for ${input.amountKobo} kobo (${splitNote})`,
    );
    return {
      authorizationUrl: `https://checkout.paystack.com/fake-${input.reference}`,
      reference: input.reference,
    };
  }

  async verifyTransaction(reference: string) {
    const amountKobo = await this.lookupAmount(reference);
    if (amountKobo === undefined) {
      throw new PaystackError("Transaction reference not found", 404);
    }
    return {
      reference,
      status: "success",
      amountKobo,
      currency: "NGN",
      paystackFeeKobo: estimatePaystackFee(amountKobo),
      raw: { fake: true },
    };
  }
}
