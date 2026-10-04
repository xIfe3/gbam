import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { apiMock, FakeApiError, refresh } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return { apiMock: { updateOrderStatus: vi.fn() }, FakeApiError, refresh: vi.fn() };
});
vi.mock("next/navigation", () => ({
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  },
}));
vi.mock("next/cache", () => ({ refresh }));
vi.mock("@/lib/api", () => ({ api: apiMock, ApiError: FakeApiError }));

import { updateOrderStatus } from "./actions";

const ID = "6cc517db-4de6-4ba4-9e4d-47cbe3a2a8dc";

function form(): FormData {
  const data = new FormData();
  data.set("orderId", ID);
  data.set("status", "paid");
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateOrderStatus", () => {
  it("lets the session-expired redirect through instead of an error message", async () => {
    apiMock.updateOrderStatus.mockRejectedValue(
      new Error("NEXT_REDIRECT:/login?next=%2Fdashboard"),
    );
    await expect(updateOrderStatus({}, form())).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("explains that a bank account is needed when the API says PAYOUT_ACCOUNT_REQUIRED", async () => {
    apiMock.updateOrderStatus.mockRejectedValue(
      new FakeApiError(409, { statusCode: 409, code: "PAYOUT_ACCOUNT_REQUIRED" }),
    );
    const state = await updateOrderStatus({}, form());
    expect(state.error).toBe("Add your bank account to start receiving payments.");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("still shows the friendly message for a 409", async () => {
    apiMock.updateOrderStatus.mockRejectedValue(new FakeApiError(409, {}));
    const state = await updateOrderStatus({}, form());
    expect(state.error).toContain("changed in the meantime");
  });
});
