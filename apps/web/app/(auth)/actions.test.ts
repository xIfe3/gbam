import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { redirect, setSessionCookie, apiMock, FakeApiError } = vi.hoisted(() => {
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
    setSessionCookie: vi.fn(),
    apiMock: { login: vi.fn(), forgotPassword: vi.fn(), resetPassword: vi.fn() },
    FakeApiError,
  };
});
vi.mock("next/navigation", () => ({ redirect, unstable_rethrow: vi.fn() }));
vi.mock("@/lib/session", () => ({
  setSessionCookie,
  clearSessionCookie: vi.fn(),
  getSessionToken: vi.fn(),
}));
vi.mock("@/lib/api", () => ({ api: apiMock, ApiError: FakeApiError }));

import { forgotPasswordAction, loginAction, resetPasswordAction } from "./actions";

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

describe("loginAction", () => {
  it("sets the cookie and goes to /dashboard", async () => {
    apiMock.login.mockResolvedValue({ sessionToken: "tok", user: {} });
    await expect(loginAction({}, form({ email: "A@b.co", password: "secret123" }))).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );
    expect(setSessionCookie).toHaveBeenCalledWith("tok");
  });

  it("goes to a safe next path", async () => {
    apiMock.login.mockResolvedValue({ sessionToken: "tok", user: {} });
    await expect(
      loginAction({}, form({ email: "a@b.co", password: "x", next: "/dashboard/orders/1" })),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard/orders/1");
  });

  it("ignores an open-redirect next", async () => {
    apiMock.login.mockResolvedValue({ sessionToken: "tok", user: {} });
    await expect(
      loginAction({}, form({ email: "a@b.co", password: "x", next: "//evil.com" })),
    ).rejects.toThrow("NEXT_REDIRECT:/dashboard");
  });

  it("shows the API's message on a wrong password and keeps the email, never the password", async () => {
    apiMock.login.mockRejectedValue(
      new FakeApiError(401, { message: "That email and password don't match" }),
    );
    const state = await loginAction({}, form({ email: "a@b.co", password: "wrong-pass" }));
    expect(state.error).toBe("That email and password don't match");
    expect(state.values?.email).toBe("a@b.co");
    expect(JSON.stringify(state)).not.toContain("wrong-pass");
    expect(setSessionCookie).not.toHaveBeenCalled();
  });

  it("explains a 429 lockout with the wait time", async () => {
    apiMock.login.mockRejectedValue(
      new FakeApiError(429, {
        message: "Too many attempts, try again in 15 minutes",
        retryAfterSeconds: 900,
      }),
    );
    const state = await loginAction({}, form({ email: "a@b.co", password: "x" }));
    expect(state.error).toContain("15 minutes");
  });
});

describe("forgotPasswordAction", () => {
  it("redirects to reset with email and requestId, never a code", async () => {
    apiMock.forgotPassword.mockResolvedValue({ ok: true, requestId: "R".repeat(43) });
    await expect(forgotPasswordAction({}, form({ email: "a@b.co" }))).rejects.toThrow(
      `NEXT_REDIRECT:/reset-password?email=a%40b.co&request=${"R".repeat(43)}`,
    );
  });
});

describe("resetPasswordAction", () => {
  const good = {
    email: "a@b.co",
    requestId: "R".repeat(43),
    code: "123456",
    password: "new-password-1",
  };

  it("sends requestId and the new password, signs in, goes to the dashboard", async () => {
    apiMock.resetPassword.mockResolvedValue({ sessionToken: "tok2", user: {} });
    await expect(resetPasswordAction({}, form(good))).rejects.toThrow("NEXT_REDIRECT:/dashboard");
    expect(apiMock.resetPassword).toHaveBeenCalledWith(good);
    expect(setSessionCookie).toHaveBeenCalledWith("tok2");
  });

  it("shows a wrong-code error on the code field", async () => {
    apiMock.resetPassword.mockRejectedValue(
      new FakeApiError(400, { field: "code", message: "That code is wrong or has expired" }),
    );
    const state = await resetPasswordAction({}, form(good));
    expect(state.fieldErrors?.code).toBe("That code is wrong or has expired");
  });

  it("rejects a short password before calling the API", async () => {
    const state = await resetPasswordAction({}, form({ ...good, password: "short" }));
    expect(state.fieldErrors?.password).toBeTruthy();
    expect(apiMock.resetPassword).not.toHaveBeenCalled();
  });
});
