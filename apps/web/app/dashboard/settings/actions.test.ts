import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { apiMock, FakeApiError, refresh, redirect, clearSessionCookie } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return {
    apiMock: {
      updateShopSettings: vi.fn(),
      updateEmailSettings: vi.fn(),
      changePassword: vi.fn(),
      closeAccount: vi.fn(),
    },
    FakeApiError,
    refresh: vi.fn(),
    // Like Next's redirect: it stops the action by throwing.
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    clearSessionCookie: vi.fn(async () => {}),
  };
});
vi.mock("next/navigation", () => ({
  redirect,
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("NEXT_REDIRECT")) {
      throw error;
    }
  },
}));
vi.mock("next/cache", () => ({ refresh }));
vi.mock("@/lib/api", () => ({ api: apiMock, ApiError: FakeApiError }));
vi.mock("@/lib/session", () => ({ clearSessionCookie }));

import {
  changePasswordAction,
  closeAccountAction,
  updateEmailsAction,
  updateShopAction,
} from "./actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("updateEmailsAction", () => {
  it("a ticked box turns new-order emails on", async () => {
    apiMock.updateEmailSettings.mockResolvedValue({});
    const state = await updateEmailsAction({}, form({ newOrderEmails: "on" }));
    expect(apiMock.updateEmailSettings).toHaveBeenCalledWith({ newOrderEmails: true });
    expect(state.notice).toContain("We'll email you");
  });

  it("an unticked box (missing from the form) turns them off", async () => {
    apiMock.updateEmailSettings.mockResolvedValue({});
    const state = await updateEmailsAction({}, form({}));
    expect(apiMock.updateEmailSettings).toHaveBeenCalledWith({ newOrderEmails: false });
    expect(state.notice).toContain("won't email you");
  });
});

describe("updateShopAction", () => {
  it("saves and says so", async () => {
    apiMock.updateShopSettings.mockResolvedValue({});
    const state = await updateShopAction(
      {},
      form({ businessName: "Ada Bakes", phone: "08031234567" }),
    );
    expect(apiMock.updateShopSettings).toHaveBeenCalledWith({
      businessName: "Ada Bakes",
      phone: "2348031234567",
    });
    expect(state.notice).toBe("Saved.");
    expect(refresh).toHaveBeenCalled();
  });

  it("puts the API's 'number already used' message on the phone field", async () => {
    apiMock.updateShopSettings.mockRejectedValue(
      new FakeApiError(409, { field: "phone", message: "That phone number is already used" }),
    );
    const state = await updateShopAction(
      {},
      form({ businessName: "Ada Bakes", phone: "08031234567" }),
    );
    expect(state.fieldErrors).toEqual({ phone: "That phone number is already used" });
  });
});

describe("changePasswordAction", () => {
  it("shows a wrong current password on its field and never sends passwords back", async () => {
    apiMock.changePassword.mockRejectedValue(
      new FakeApiError(400, { field: "currentPassword", message: "That password isn't right" }),
    );
    const state = await changePasswordAction(
      {},
      form({ currentPassword: "wrong", newPassword: "a new password" }),
    );
    expect(state.fieldErrors).toEqual({ currentPassword: "That password isn't right" });
    expect(state.values).toBeUndefined();
  });
});

describe("closeAccountAction", () => {
  it("signs this browser out and goes to the login page with a note", async () => {
    apiMock.closeAccount.mockResolvedValue({ ok: true });
    await expect(
      closeAccountAction({}, form({ businessName: "Ada Bakes", password: "secret pass" })),
    ).rejects.toThrow("NEXT_REDIRECT:/login?closed=1");
    expect(clearSessionCookie).toHaveBeenCalled();
  });

  it("keeps the session when the API refuses (wrong name)", async () => {
    apiMock.closeAccount.mockRejectedValue(
      new FakeApiError(400, { field: "businessName", message: "Type your shop name exactly" }),
    );
    const state = await closeAccountAction(
      {},
      form({ businessName: "Wrong", password: "secret pass" }),
    );
    expect(state.fieldErrors).toEqual({ businessName: "Type your shop name exactly" });
    expect(clearSessionCookie).not.toHaveBeenCalled();
  });
});
