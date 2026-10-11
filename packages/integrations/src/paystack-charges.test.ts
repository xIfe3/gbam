import { afterEach, describe, expect, it, vi } from "vitest";
import { FakePaystackClient, HttpPaystackClient, PaystackError } from "./paystack";

type Call = { url: string; init: RequestInit | undefined };

/** Replaces the global fetch with one that answers with `reply` once. */
function stubFetch(reply: { status: number; body: unknown }): Call[] {
  const calls: Call[] = [];
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  return calls;
}

function sentBody(calls: Call[]): Record<string, unknown> {
  const first = calls[0];
  if (!first || typeof first.init?.body !== "string") {
    throw new Error("No request body was sent");
  }
  return JSON.parse(first.init.body) as Record<string, unknown>;
}

/** The error a promise rejects with (fails the test if it resolves). */
async function errorFrom(promise: Promise<unknown>): Promise<unknown> {
  try {
    await promise;
  } catch (error) {
    return error;
  }
  throw new Error("Expected the call to fail");
}

const BASE = {
  reference: "gbam_GB-7K3Q_9f2c41ab",
  amountKobo: 500_000,
  email: "ada@example.com",
  split: { subaccount: "ACCT_seller", platformFeeKobo: 7_500 },
  metadata: { orderCode: "GB-7K3Q" },
};

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpPaystackClient.chargeBankTransfer", () => {
  it("asks for a one-off account with our split and expiry, and returns the account", async () => {
    const calls = stubFetch({
      status: 200,
      body: {
        status: true,
        message: "Charge attempted",
        data: {
          reference: BASE.reference,
          status: "pending_bank_transfer",
          display_text: "Please make a transfer to the account specified",
          account_name: "PAYSTACK CHECKOUT",
          account_number: "1260367879",
          bank: { slug: "wema-bank", name: "Wema Bank", id: 20 },
          account_expires_at: "2026-10-11T06:07:16.000Z",
          amount: 500000,
        },
      },
    });
    const expiresAt = new Date("2026-10-11T06:07:16.000Z");

    const charge = await new HttpPaystackClient("sk_test_x").chargeBankTransfer({
      ...BASE,
      expiresAt,
    });

    expect(calls[0]?.url).toBe("https://api.paystack.co/charge");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(sentBody(calls)).toEqual({
      reference: BASE.reference,
      amount: 500_000,
      email: "ada@example.com",
      currency: "NGN",
      metadata: { orderCode: "GB-7K3Q" },
      subaccount: "ACCT_seller",
      transaction_charge: 7_500,
      bearer: "subaccount",
      bank_transfer: { account_expires_at: "2026-10-11T06:07:16.000Z" },
    });
    expect(charge).toEqual({
      reference: BASE.reference,
      bankName: "Wema Bank",
      accountNumber: "1260367879",
      accountName: "PAYSTACK CHECKOUT",
      expiresAt,
    });
  });

  it("fails clearly when Paystack doesn't hand out an account", async () => {
    stubFetch({
      status: 200,
      body: { status: true, message: "Charge attempted", data: { status: "failed" } },
    });
    const error = await errorFrom(
      new HttpPaystackClient("sk_test_x").chargeBankTransfer({ ...BASE, expiresAt: new Date() }),
    );
    expect(error).toBeInstanceOf(PaystackError);
  });
});

describe("HttpPaystackClient.chargeUssd", () => {
  it("asks for the bank's USSD code with our split, and returns the code to dial", async () => {
    const calls = stubFetch({
      status: 200,
      body: {
        status: true,
        message: "Charge attempted",
        data: {
          reference: BASE.reference,
          status: "pay_offline",
          display_text: "Please dial *737*33*4*26945# on your mobile phone",
          ussd_code: "*737*33*4*26945#",
        },
      },
    });

    const charge = await new HttpPaystackClient("sk_test_x").chargeUssd({
      ...BASE,
      bankType: "737",
    });

    expect(sentBody(calls)).toMatchObject({
      reference: BASE.reference,
      amount: 500_000,
      subaccount: "ACCT_seller",
      bearer: "subaccount",
      ussd: { type: "737" },
    });
    expect(charge).toEqual({ reference: BASE.reference, ussdCode: "*737*33*4*26945#" });
  });

  it("a bank Paystack doesn't support is a PaystackError", async () => {
    stubFetch({ status: 400, body: { status: false, message: "Charge attempted" } });
    const error = await errorFrom(
      new HttpPaystackClient("sk_test_x").chargeUssd({ ...BASE, bankType: "822" }),
    );
    expect(error).toBeInstanceOf(PaystackError);
  });
});

describe("FakePaystackClient direct charges", () => {
  it("hands out a pretend account and USSD code, so dev works without keys", async () => {
    const fake = new FakePaystackClient(async () => undefined, () => undefined);
    const expiresAt = new Date(Date.now() + 30 * 60_000);
    const transfer = await fake.chargeBankTransfer({ ...BASE, expiresAt });
    expect(transfer.reference).toBe(BASE.reference);
    expect(transfer.accountNumber).toMatch(/^\d{10}$/);
    expect(transfer.expiresAt).toEqual(expiresAt);
    const ussd = await fake.chargeUssd({ ...BASE, bankType: "919" });
    expect(ussd.ussdCode).toMatch(/^\*919\*/);
  });
});
