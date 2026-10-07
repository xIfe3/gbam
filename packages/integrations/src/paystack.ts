import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { estimatePaystackFee } from "@gbam/shared";
import { z } from "zod";

/**
 * Thin typed client for the Paystack endpoints we use: payments, and payout setup
 * (bank list, account-name check, subaccount creation).
 * Business logic never talks to Paystack directly; it goes through PaystackClient,
 * so tests and keyless dev use FakePaystackClient instead.
 */
export interface PaystackClient {
  initializeTransaction(input: InitializeTransactionInput): Promise<InitializedTransaction>;
  verifyTransaction(reference: string): Promise<VerifiedTransaction>;
  /** Nigerian banks a seller can be paid into. */
  listBanks(): Promise<Bank[]>;
  /** Asks the bank whose account this is. Fails if the number does not exist at that bank. */
  resolveAccount(input: ResolveAccountInput): Promise<{ accountName: string }>;
  /** A Paystack "subaccount" = a seller's bank account that split payments are paid into. */
  createSubaccount(input: CreateSubaccountInput): Promise<{ subaccountCode: string }>;
  /** Points an existing subaccount at a different bank account (past payments are unaffected). */
  updateSubaccount(subaccountCode: string, input: CreateSubaccountInput): Promise<void>;
}

/** `code` is how Paystack names the bank everywhere else (e.g. "058" for GTBank). */
export type Bank = { name: string; code: string };

export type ResolveAccountInput = { accountNumber: string; bankCode: string };

export type CreateSubaccountInput = {
  businessName: string;
  bankCode: string;
  accountNumber: string;
};

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
  meta: z.unknown().optional(),
});

/**
 * Hides any run of 6+ digits (e.g. an account number Paystack might quote back in an
 * error), so error messages are safe to log.
 */
function maskLongNumbers(text: string): string {
  return text.replace(/\d{6,}/g, "[number hidden]");
}

// One bank in GET /bank. `is_deleted` can be null, so only `true` counts as deleted.
const bankData = z.object({
  name: z.string(),
  code: z.string(),
  active: z.boolean(),
  is_deleted: z.boolean().nullable().optional(),
});
const bankListData = z.array(bankData);
// With use_cursor=true, `meta.next` says where the next page starts (null on the last page).
const bankListMeta = z.object({ next: z.string().nullable().optional() }).loose();

const resolveData = z.object({ account_name: z.string().min(1) }).loose();

const subaccountData = z.object({ subaccount_code: z.string().min(1) }).loose();

// Safety limit on bank-list pages (about 3 pages of 100 banks today).
const MAX_BANK_PAGES = 20;

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

  async listBanks() {
    const banks: Bank[] = [];
    let cursor: string | null = null;
    // Paystack hands the list out in pages; each reply says where the next one starts.
    for (let page = 0; page < MAX_BANK_PAGES; page++) {
      const query = new URLSearchParams({
        country: "nigeria",
        currency: "NGN",
        use_cursor: "true",
        perPage: "100",
      });
      if (cursor !== null) {
        query.set("next", cursor);
      }
      const reply = await this.requestWithMeta(`/bank?${query.toString()}`, bankListData);
      for (const bank of reply.data) {
        // Skip banks Paystack has switched off: payouts to them would fail.
        if (bank.active && bank.is_deleted !== true) {
          banks.push({ name: bank.name, code: bank.code });
        }
      }

      cursor = null;
      const meta = bankListMeta.safeParse(reply.meta);
      if (meta.success && typeof meta.data.next === "string" && meta.data.next !== "") {
        cursor = meta.data.next;
      }
      if (cursor === null) {
        // Pages don't come back in alphabetical order; sellers look for their bank by name.
        banks.sort((a, b) => a.name.localeCompare(b.name));
        return banks;
      }
    }
    throw new PaystackError("Paystack /bank returned too many pages");
  }

  async resolveAccount(input: ResolveAccountInput) {
    const query = new URLSearchParams({
      account_number: input.accountNumber,
      bank_code: input.bankCode,
    });
    const body = await this.request(`/bank/resolve?${query.toString()}`, resolveData);
    return { accountName: body.account_name };
  }

  async createSubaccount(input: CreateSubaccountInput) {
    const params = {
      business_name: input.businessName,
      settlement_bank: input.bankCode, // Paystack wants the bank CODE here, not its name
      account_number: input.accountNumber,
      // 0 = by default the subaccount keeps everything. Our cut is set on each payment
      // instead (transaction_charge in initializeTransaction).
      percentage_charge: 0,
    };
    const body = await this.request("/subaccount", subaccountData, {
      method: "POST",
      body: JSON.stringify(params),
    });
    return { subaccountCode: body.subaccount_code };
  }

  async updateSubaccount(subaccountCode: string, input: CreateSubaccountInput) {
    const params = {
      business_name: input.businessName,
      settlement_bank: input.bankCode,
      account_number: input.accountNumber,
    };
    // encodeURIComponent: the code goes into the URL path, so it must not add "/" or "?".
    await this.request(`/subaccount/${encodeURIComponent(subaccountCode)}`, subaccountData, {
      method: "PUT",
      body: JSON.stringify(params),
    });
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
    const reply = await this.requestWithMeta(path, dataSchema, init);
    return reply.data;
  }

  /** Like request(), but also returns the reply's `meta` part (paging details). */
  private async requestWithMeta<D extends z.ZodType>(
    path: string,
    dataSchema: D,
    init: RequestInit = {},
  ): Promise<{ data: z.output<D>; meta: unknown }> {
    // Error messages name only the endpoint, never the query string: it can hold a
    // seller's bank account number (GET /bank/resolve), which must never reach the logs.
    let endpoint = path;
    const queryStart = path.indexOf("?");
    if (queryStart !== -1) {
      endpoint = path.slice(0, queryStart);
    }

    let res: Response;
    try {
      res = await fetch(`${this.baseUrl}${path}`, {
        ...init, // method and body, when given
        headers: {
          authorization: `Bearer ${this.secretKey}`,
          "content-type": "application/json",
        },
        signal: AbortSignal.timeout(15_000), // give up after 15 seconds
      });
    } catch {
      // Network failure or timeout. The original error can quote the full URL, so drop it.
      throw new PaystackError(`Paystack ${endpoint} did not answer`);
    }

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
        return { data: data.data, meta: envelope.data.meta };
      }
    }

    // Something went wrong. Use Paystack's own message if it sent one.
    let message = `Paystack ${endpoint} failed (${res.status})`;
    const errorBody = z.object({ message: z.string() }).safeParse(json);
    if (errorBody.success) {
      message = maskLongNumbers(errorBody.data.message);
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

  async listBanks() {
    // A copy, so a caller changing the list can't change the fake's own.
    return FAKE_BANKS.map((bank) => ({ ...bank }));
  }

  /** `0000000000` fails like an unknown account would at the real Paystack; anything else works. */
  async resolveAccount(input: ResolveAccountInput) {
    if (input.accountNumber === FAKE_UNRESOLVABLE_ACCOUNT) {
      throw new PaystackError(
        "Could not resolve account name. Check parameters or try again.",
        422,
      );
    }
    return { accountName: "TEST ACCOUNT" };
  }

  async createSubaccount(input: CreateSubaccountInput) {
    const subaccountCode = `ACCT_fake_${randomBytes(6).toString("hex")}`;
    // Only the last 4 digits: account numbers never go in logs.
    this.log(
      `[fake paystack] subaccount ${subaccountCode} for "${input.businessName}" ` +
        `(bank ${input.bankCode}, account ending ${input.accountNumber.slice(-4)})`,
    );
    return { subaccountCode };
  }

  async updateSubaccount(subaccountCode: string, input: CreateSubaccountInput) {
    this.log(
      `[fake paystack] subaccount ${subaccountCode} now pays into bank ${input.bankCode}, ` +
        `account ending ${input.accountNumber.slice(-4)}`,
    );
  }
}

/** The fake's bank list (real Paystack codes, so dev data looks like the real thing). */
const FAKE_BANKS: Bank[] = [
  { name: "Access Bank", code: "044" },
  { name: "Guaranty Trust Bank", code: "058" },
  { name: "Zenith Bank", code: "057" },
];

/** The one account number the fake refuses to resolve, for trying out the error path. */
export const FAKE_UNRESOLVABLE_ACCOUNT = "0000000000";
