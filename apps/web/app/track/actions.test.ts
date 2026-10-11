import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { apiMock, FakeApiError } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      let message = "api";
      if (typeof body === "object" && body !== null && "message" in body) {
        message = String(body.message);
      }
      super(message);
    }
  }
  return { apiMock: { trackDirectPay: vi.fn() }, FakeApiError };
});
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined, redirect: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: apiMock, ApiError: FakeApiError }));

import { directPayAction } from "./actions";

const KEY = "secret-key-abcdefghijklmnop";

describe("directPayAction", () => {
  beforeEach(() => {
    apiMock.trackDirectPay.mockReset();
  });

  it("returns the account to show", async () => {
    const payment = { method: "bank_transfer", accountNumber: "1260367879" };
    apiMock.trackDirectPay.mockResolvedValue(payment);
    expect(await directPayAction("GB-7B2Q", KEY, { method: "bank_transfer" })).toEqual({
      payment,
    });
  });

  it("refuses a made-up choice without calling the API", async () => {
    const result = await directPayAction("GB-7B2Q", KEY, { method: "card" } as never);
    expect(result.error).toBeDefined();
    expect(apiMock.trackDirectPay).not.toHaveBeenCalled();
  });

  it("too little time left: the API's message, and a pointer to card", async () => {
    apiMock.trackDirectPay.mockRejectedValue(
      new FakeApiError(409, { code: "NOT_ENOUGH_TIME", message: "Pay by card instead." }),
    );
    expect(await directPayAction("GB-7B2Q", KEY, { method: "bank_transfer" })).toEqual({
      error: "Pay by card instead.",
      useCard: true,
    });
  });

  it("Paystack can't set it up: offer Paystack's own window", async () => {
    apiMock.trackDirectPay.mockRejectedValue(
      new FakeApiError(503, { code: "PAYSTACK_UNAVAILABLE" }),
    );
    const result = await directPayAction("GB-7B2Q", KEY, { method: "ussd", bank: "737" });
    expect(result.useCheckout).toBe(true);
    expect(result.error).toMatch(/Paystack's secure window/);
  });
});
