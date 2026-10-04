import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { redirect, apiMock, FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return {
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    apiMock: { resolvePayoutAccount: vi.fn(), createPayoutAccount: vi.fn() },
    FakeApiError,
  };
});
// Like Next's real unstable_rethrow: redirect errors must pass through, others are ignored.
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  },
}));
vi.mock("@/lib/api", () => ({ api: apiMock, ApiError: FakeApiError }));

import { createPayoutAccountAction, resolveAccountAction } from "./actions";

const ACCOUNT = "0123456789";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("resolveAccountAction", () => {
  it("returns the account name for the seller to confirm", async () => {
    apiMock.resolvePayoutAccount.mockResolvedValue({
      accountName: "ADA OBI",
      bankName: "Guaranty Trust Bank",
    });

    const state = await resolveAccountAction({}, form({ bankCode: "058", accountNumber: ACCOUNT }));

    expect(apiMock.resolvePayoutAccount).toHaveBeenCalledWith({
      bankCode: "058",
      accountNumber: ACCOUNT,
    });
    expect(state.accountName).toBe("ADA OBI");
    expect(state.bankName).toBe("Guaranty Trust Bank");
    expect(state.values).toEqual({ bankCode: "058", accountNumber: ACCOUNT });
    expect(state.error).toBeUndefined();
  });

  it("checks the number is 10 digits before calling the API", async () => {
    const state = await resolveAccountAction({}, form({ bankCode: "058", accountNumber: "123" }));
    expect(state.fieldErrors?.accountNumber).toBe("Enter your 10-digit account number");
    expect(apiMock.resolvePayoutAccount).not.toHaveBeenCalled();
  });

  it("asks for a bank when none is chosen", async () => {
    const state = await resolveAccountAction({}, form({ bankCode: "", accountNumber: ACCOUNT }));
    expect(state.fieldErrors?.bankCode).toBe("Choose your bank from the list");
  });

  it("puts an account Paystack can't find on the account number field, keeping what was typed", async () => {
    apiMock.resolvePayoutAccount.mockRejectedValue(
      new FakeApiError(400, { field: "accountNumber", message: "We couldn't find this account" }),
    );
    const state = await resolveAccountAction({}, form({ bankCode: "058", accountNumber: ACCOUNT }));
    expect(state.fieldErrors).toEqual({ accountNumber: "We couldn't find this account" });
    expect(state.values).toEqual({ bankCode: "058", accountNumber: ACCOUNT });
    expect(state.accountName).toBeUndefined();
  });

  it("shows the API's retry message when Paystack is unavailable", async () => {
    apiMock.resolvePayoutAccount.mockRejectedValue(
      new FakeApiError(503, { message: "We couldn't check this account right now." }),
    );
    const state = await resolveAccountAction({}, form({ bankCode: "058", accountNumber: ACCOUNT }));
    expect(state.error).toBe("We couldn't check this account right now.");
  });

  it("shows the rate-limit message", async () => {
    apiMock.resolvePayoutAccount.mockRejectedValue(
      new FakeApiError(429, { message: "Too many attempts, try again in 9 minutes" }),
    );
    const state = await resolveAccountAction({}, form({ bankCode: "058", accountNumber: ACCOUNT }));
    expect(state.error).toBe("Too many attempts, try again in 9 minutes");
  });

  it("lets a session redirect from the API through", async () => {
    apiMock.resolvePayoutAccount.mockRejectedValue(new Error("NEXT_REDIRECT:/login?next=%2F"));
    await expect(
      resolveAccountAction({}, form({ bankCode: "058", accountNumber: ACCOUNT })),
    ).rejects.toThrow("NEXT_REDIRECT:/login");
  });
});

describe("createPayoutAccountAction", () => {
  it("creates the account and goes to the dashboard", async () => {
    apiMock.createPayoutAccount.mockResolvedValue({
      bankName: "Guaranty Trust Bank",
      accountLast4: "6789",
      bankAccountName: "ADA OBI",
    });
    await expect(
      createPayoutAccountAction({}, form({ bankCode: "058", accountNumber: ACCOUNT })),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(apiMock.createPayoutAccount).toHaveBeenCalledWith({
      bankCode: "058",
      accountNumber: ACCOUNT,
    });
  });

  it("goes to the dashboard when the shop already has a payout account", async () => {
    apiMock.createPayoutAccount.mockRejectedValue(
      new FakeApiError(409, { code: "PAYOUT_ACCOUNT_EXISTS", message: "Already has one" }),
    );
    await expect(
      createPayoutAccountAction({}, form({ bankCode: "058", accountNumber: ACCOUNT })),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("says setup is already under way when another request holds the lock", async () => {
    apiMock.createPayoutAccount.mockRejectedValue(
      new FakeApiError(409, { code: "PAYOUT_SETUP_IN_PROGRESS", message: "In progress" }),
    );
    const state = await createPayoutAccountAction(
      {},
      form({ bankCode: "058", accountNumber: ACCOUNT }),
    );
    expect(state.error).toBe("We're already setting this up. Refresh in a minute.");
  });

  it("shows a field error and keeps the details when the account no longer resolves", async () => {
    apiMock.createPayoutAccount.mockRejectedValue(
      new FakeApiError(400, { field: "accountNumber", message: "We couldn't find this account" }),
    );
    const state = await createPayoutAccountAction(
      {},
      form({ bankCode: "058", accountNumber: ACCOUNT }),
    );
    expect(state.fieldErrors).toEqual({ accountNumber: "We couldn't find this account" });
    expect(state.values).toEqual({ bankCode: "058", accountNumber: ACCOUNT });
  });

  it("shows a retryable message when Paystack fails (nothing was saved)", async () => {
    apiMock.createPayoutAccount.mockRejectedValue(
      new FakeApiError(503, { message: "Nothing was saved. Please try again." }),
    );
    const state = await createPayoutAccountAction(
      {},
      form({ bankCode: "058", accountNumber: ACCOUNT }),
    );
    expect(state.error).toBe("Nothing was saved. Please try again.");
  });

  it("validates before calling the API", async () => {
    const state = await createPayoutAccountAction(
      {},
      form({ bankCode: "058", accountNumber: "12345678901" }),
    );
    expect(state.fieldErrors?.accountNumber).toBeTruthy();
    expect(apiMock.createPayoutAccount).not.toHaveBeenCalled();
  });
});
