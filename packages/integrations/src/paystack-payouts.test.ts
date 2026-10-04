import { afterEach, describe, expect, it, vi } from "vitest";
import { FakePaystackClient, HttpPaystackClient, PaystackError } from "./paystack";

const ACCOUNT = "0123456789";

type Call = { url: string; init: RequestInit | undefined };

/** Replaces the global fetch with one that answers from `replies`, in order. */
function stubFetch(replies: { status: number; body: unknown }[]): Call[] {
  const calls: Call[] = [];
  let index = 0;
  vi.stubGlobal("fetch", async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    const reply = replies[index];
    index = index + 1;
    if (!reply) {
      throw new Error("Unexpected fetch call");
    }
    return new Response(JSON.stringify(reply.body), { status: reply.status });
  });
  return calls;
}

function bank(name: string, code: string, extra: Record<string, unknown> = {}) {
  return { id: 1, name, slug: name.toLowerCase(), code, active: true, is_deleted: false, ...extra };
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

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("HttpPaystackClient.listBanks", () => {
  it("asks for Nigerian NGN banks, follows the cursor, drops inactive/deleted ones, sorts by name", async () => {
    const calls = stubFetch([
      {
        status: 200,
        body: {
          status: true,
          message: "Banks retrieved",
          data: [bank("Zenith Bank", "057"), bank("Old Bank", "999", { active: false })],
          meta: { next: "abc=", previous: null, perPage: 100 },
        },
      },
      {
        status: 200,
        body: {
          status: true,
          message: "Banks retrieved",
          data: [bank("Access Bank", "044"), bank("Gone Bank", "998", { is_deleted: true })],
          meta: { next: null, previous: "abc=", perPage: 100 },
        },
      },
    ]);
    const client = new HttpPaystackClient("sk_test_x", "https://paystack.test");

    const banks = await client.listBanks();

    expect(banks).toEqual([
      { name: "Access Bank", code: "044" },
      { name: "Zenith Bank", code: "057" },
    ]);
    expect(calls).toHaveLength(2);
    const first = new URL(calls[0]?.url ?? "");
    expect(first.pathname).toBe("/bank");
    expect(first.searchParams.get("country")).toBe("nigeria");
    expect(first.searchParams.get("currency")).toBe("NGN");
    expect(first.searchParams.get("use_cursor")).toBe("true");
    const second = new URL(calls[1]?.url ?? "");
    expect(second.searchParams.get("next")).toBe("abc=");
  });
});

describe("HttpPaystackClient.resolveAccount", () => {
  it("calls GET /bank/resolve with account_number and bank_code", async () => {
    const calls = stubFetch([
      {
        status: 200,
        body: {
          status: true,
          message: "Account number resolved",
          data: { account_number: ACCOUNT, account_name: "ADA OBI", bank_id: 9 },
        },
      },
    ]);
    const client = new HttpPaystackClient("sk_test_x", "https://paystack.test");

    expect(await client.resolveAccount({ accountNumber: ACCOUNT, bankCode: "058" })).toEqual({
      accountName: "ADA OBI",
    });
    const url = new URL(calls[0]?.url ?? "");
    expect(url.pathname).toBe("/bank/resolve");
    expect(url.searchParams.get("account_number")).toBe(ACCOUNT);
    expect(url.searchParams.get("bank_code")).toBe("058");
    expect(calls[0]?.init?.method ?? "GET").toBe("GET");
  });

  it("fails with the status and never puts the account number in the error", async () => {
    stubFetch([
      { status: 422, body: { status: false, message: "Could not resolve account name." } },
    ]);
    const client = new HttpPaystackClient("sk_test_x", "https://paystack.test");

    const error = await errorFrom(
      client.resolveAccount({ accountNumber: ACCOUNT, bankCode: "058" }),
    );

    expect(error).toBeInstanceOf(PaystackError);
    expect((error as PaystackError).status).toBe(422);
    expect(String((error as Error).message)).not.toContain(ACCOUNT);
  });

  it("keeps the account number out of the error when the reply is not JSON", async () => {
    vi.stubGlobal("fetch", async () => new Response("<html>bad gateway</html>", { status: 502 }));
    const client = new HttpPaystackClient("sk_test_x", "https://paystack.test");

    const error = await errorFrom(
      client.resolveAccount({ accountNumber: ACCOUNT, bankCode: "058" }),
    );

    expect(error).toBeInstanceOf(PaystackError);
    expect((error as PaystackError).status).toBe(502);
    expect(String((error as Error).message)).not.toContain(ACCOUNT);
  });

  it("turns a network failure into a PaystackError without the URL", async () => {
    vi.stubGlobal("fetch", async (url: string) => {
      throw new TypeError(`fetch failed for ${url}`);
    });
    const client = new HttpPaystackClient("sk_test_x", "https://paystack.test");

    const error = await errorFrom(
      client.resolveAccount({ accountNumber: ACCOUNT, bankCode: "058" }),
    );

    expect(error).toBeInstanceOf(PaystackError);
    expect((error as PaystackError).status).toBeUndefined();
    expect(String((error as Error).message)).not.toContain(ACCOUNT);
  });
});

describe("HttpPaystackClient.createSubaccount", () => {
  it("POSTs /subaccount with the bank code and a 0% charge, and returns subaccount_code", async () => {
    const calls = stubFetch([
      {
        status: 201,
        body: {
          status: true,
          message: "Subaccount created",
          data: { subaccount_code: "ACCT_6uujpqtzmnufzkw", account_number: ACCOUNT, id: 55 },
        },
      },
    ]);
    const client = new HttpPaystackClient("sk_test_x", "https://paystack.test");

    const result = await client.createSubaccount({
      businessName: "Mama's Kitchen",
      bankCode: "058",
      accountNumber: ACCOUNT,
    });

    expect(result).toEqual({ subaccountCode: "ACCT_6uujpqtzmnufzkw" });
    expect(calls[0]?.url).toBe("https://paystack.test/subaccount");
    expect(calls[0]?.init?.method).toBe("POST");
    expect(JSON.parse(String(calls[0]?.init?.body))).toEqual({
      business_name: "Mama's Kitchen",
      settlement_bank: "058",
      account_number: ACCOUNT,
      percentage_charge: 0,
    });
  });

  it("fails when Paystack does not return a subaccount code", async () => {
    stubFetch([{ status: 200, body: { status: true, message: "ok", data: {} } }]);
    const client = new HttpPaystackClient("sk_test_x", "https://paystack.test");

    await expect(
      client.createSubaccount({ businessName: "Shop", bankCode: "058", accountNumber: ACCOUNT }),
    ).rejects.toBeInstanceOf(PaystackError);
  });
});

describe("FakePaystackClient payouts", () => {
  const logs: string[] = [];
  const fake = new FakePaystackClient(
    async () => undefined,
    (message) => {
      logs.push(message);
    },
  );

  it("lists 3 sample banks", async () => {
    const banks = await fake.listBanks();
    expect(banks).toHaveLength(3);
    for (const item of banks) {
      expect(item.name).not.toBe("");
      expect(item.code).not.toBe("");
    }
  });

  it("fails to resolve 0000000000 and resolves anything else to TEST ACCOUNT", async () => {
    const error = await errorFrom(
      fake.resolveAccount({ accountNumber: "0000000000", bankCode: "058" }),
    );
    expect(error).toBeInstanceOf(PaystackError);
    expect((error as PaystackError).status).toBe(422);

    expect(await fake.resolveAccount({ accountNumber: ACCOUNT, bankCode: "058" })).toEqual({
      accountName: "TEST ACCOUNT",
    });
  });

  it("creates ACCT_fake_ codes that differ each time, and never logs the full number", async () => {
    const a = await fake.createSubaccount({
      businessName: "Shop",
      bankCode: "058",
      accountNumber: ACCOUNT,
    });
    const b = await fake.createSubaccount({
      businessName: "Shop",
      bankCode: "058",
      accountNumber: ACCOUNT,
    });
    expect(a.subaccountCode).toMatch(/^ACCT_fake_[a-z0-9]+$/);
    expect(a.subaccountCode).not.toBe(b.subaccountCode);
    expect(logs.join("\n")).not.toContain(ACCOUNT);
  });
});
