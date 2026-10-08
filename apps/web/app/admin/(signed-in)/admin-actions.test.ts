import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { adminApiMock, FakeApiError, refresh } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return {
    adminApiMock: {
      suspendShop: vi.fn(),
      reopenShop: vi.fn(),
      bulkShops: vi.fn(),
      resolveRefund: vi.fn(),
      setFeeWaiver: vi.fn(),
    },
    FakeApiError,
    refresh: vi.fn(),
  };
});
vi.mock("next/cache", () => ({ refresh }));
vi.mock("next/navigation", () => ({ unstable_rethrow: () => undefined }));
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("@/lib/api", () => ({ ApiError: FakeApiError }));

import {
  bulkShopsAction,
  feeWaiverAction,
  resolveRefundAction,
  suspendShopAction,
} from "./admin-actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

const SHOP = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("admin actions", () => {
  it("suspend asks for a reason", async () => {
    const state = await suspendShopAction(SHOP, {}, form({ reason: "bad" }));
    expect(adminApiMock.suspendShop).not.toHaveBeenCalled();
    expect(state.fieldErrors?.reason).toBe("Write a short reason (at least 5 characters)");
  });

  it("suspend with a reason calls the API and refreshes the page", async () => {
    adminApiMock.suspendShop.mockResolvedValue({ ok: true });
    const state = await suspendShopAction(SHOP, {}, form({ reason: "Reported for fraud" }));
    expect(adminApiMock.suspendShop).toHaveBeenCalledWith(SHOP, "Reported for fraud");
    expect(state.notice).toBe("Shop suspended.");
    expect(refresh).toHaveBeenCalled();
  });

  it("refund resolve asks for the tick and a note", async () => {
    const noTick = await resolveRefundAction(SHOP, {}, form({ reason: "Refunded on Paystack" }));
    expect(noTick.fieldErrors?.confirmed).toBe(
      "Tick the box once the money is back with the customer",
    );
    const ok = await (async () => {
      adminApiMock.resolveRefund.mockResolvedValue({ ok: true });
      return resolveRefundAction(
        SHOP,
        {},
        form({ reason: "Refunded on Paystack", confirmed: "on" }),
      );
    })();
    expect(adminApiMock.resolveRefund).toHaveBeenCalledWith(SHOP, "Refunded on Paystack");
    expect(ok.notice).toBe("Marked as refunded.");
  });

  it("bulk shops passes the ids and note on", async () => {
    adminApiMock.bulkShops.mockResolvedValue({ done: [SHOP], skipped: [] });
    const result = await bulkShopsAction("suspend", [SHOP], "Spam wave");
    expect(adminApiMock.bulkShops).toHaveBeenCalledWith("suspend", [SHOP], "Spam wave");
    expect(result.done).toEqual([SHOP]);
  });

  it("fee waiver: a date sets it, Clear ends it", async () => {
    adminApiMock.setFeeWaiver.mockResolvedValue({ ok: true });
    await feeWaiverAction(SHOP, {}, form({ until: "2027-01-31" }));
    expect(adminApiMock.setFeeWaiver).toHaveBeenCalledWith(SHOP, "2027-01-31");
    await feeWaiverAction(SHOP, {}, form({ until: "", clear: "1" }));
    expect(adminApiMock.setFeeWaiver).toHaveBeenLastCalledWith(SHOP, null);
  });

  it("shows the API's message when it refuses", async () => {
    adminApiMock.suspendShop.mockRejectedValue(
      new FakeApiError(400, { message: "Already suspended" }),
    );
    const state = await suspendShopAction(SHOP, {}, form({ reason: "Reported for fraud" }));
    expect(state.error).toBe("Already suspended");
  });
});
