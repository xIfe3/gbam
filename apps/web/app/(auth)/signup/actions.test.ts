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
    apiMock: {
      signup: vi.fn(),
      slugAvailable: vi.fn(),
      verifyEmail: vi.fn(),
      resendCode: vi.fn(),
    },
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
vi.mock("@/lib/session", () => ({ setSessionCookie }));
vi.mock("@/lib/api", () => ({ api: apiMock, ApiError: FakeApiError }));

import { checkSlugAction, resendCodeAction, signupAction, verifyEmailAction } from "./actions";

function form(values: Record<string, string>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(values)) {
    data.set(key, value);
  }
  return data;
}

const goodSignup = {
  businessName: "Mama's Kitchen",
  slug: "mamas-kitchen",
  phone: "08031234567",
  email: "a@b.co",
  password: "long-enough-pw",
};

beforeEach(() => {
  vi.clearAllMocks();
});

describe("signupAction", () => {
  it("signs in and goes to verify on success", async () => {
    apiMock.signup.mockResolvedValue({ sessionToken: "tok", user: {} });
    await expect(signupAction({}, form(goodSignup))).rejects.toThrow(
      "NEXT_REDIRECT:/signup/verify",
    );
    expect(setSessionCookie).toHaveBeenCalledWith("tok");
  });

  it("puts a 409 on the field the API names", async () => {
    for (const field of ["email", "slug", "phone"]) {
      apiMock.signup.mockRejectedValue(new FakeApiError(409, { field, message: `${field} used` }));
      const state = await signupAction({}, form(goodSignup));
      expect(state.fieldErrors).toEqual({ [field]: `${field} used` });
      // Typed values come back, the password never does.
      expect(state.values?.businessName).toBe("Mama's Kitchen");
      expect(JSON.stringify(state)).not.toContain("long-enough-pw");
    }
  });

  it("validates before calling the API", async () => {
    const state = await signupAction({}, form({ ...goodSignup, email: "nope" }));
    expect(state.fieldErrors?.email).toBeTruthy();
    expect(apiMock.signup).not.toHaveBeenCalled();
  });
});

describe("checkSlugAction", () => {
  it("maps API answers", async () => {
    apiMock.slugAvailable.mockResolvedValue({ available: true });
    expect(await checkSlugAction("free-shop")).toEqual({ status: "available" });
    apiMock.slugAvailable.mockResolvedValue({ available: false, reason: "taken" });
    expect(await checkSlugAction("taken-shop")).toEqual({ status: "taken" });
    apiMock.slugAvailable.mockResolvedValue({ available: false, reason: "reserved" });
    expect(await checkSlugAction("some-shop")).toEqual({ status: "reserved" });
  });

  it("answers invalid without calling the API", async () => {
    expect(await checkSlugAction("No Good!")).toEqual({ status: "invalid" });
    expect(apiMock.slugAvailable).not.toHaveBeenCalled();
  });

  it("answers error (not a crash) when the API fails or limits", async () => {
    apiMock.slugAvailable.mockRejectedValue(new FakeApiError(429, {}));
    expect(await checkSlugAction("free-shop")).toEqual({ status: "error" });
  });
});

describe("verifyEmailAction", () => {
  it("lets a session redirect from the API through instead of showing an error", async () => {
    apiMock.verifyEmail.mockRejectedValue(new Error("NEXT_REDIRECT:/login?next=%2Fdashboard"));
    await expect(verifyEmailAction({}, form({ code: "123456" }))).rejects.toThrow(
      "NEXT_REDIRECT:/login",
    );
  });

  it("shows a wrong code on the code field", async () => {
    apiMock.verifyEmail.mockRejectedValue(
      new FakeApiError(400, { field: "code", message: "That code is wrong or has expired" }),
    );
    const state = await verifyEmailAction({}, form({ code: "123456" }));
    expect(state.fieldErrors?.code).toBe("That code is wrong or has expired");
  });

  it("goes on after a good code", async () => {
    apiMock.verifyEmail.mockResolvedValue({ ok: true });
    await expect(verifyEmailAction({}, form({ code: "123456" }))).rejects.toThrow(
      "NEXT_REDIRECT:/dashboard",
    );
  });
});

describe("resendCodeAction", () => {
  it("explains a 429 with the wait time", async () => {
    apiMock.resendCode.mockRejectedValue(
      new FakeApiError(429, { message: "Too many", retryAfterSeconds: 42 }),
    );
    const state = await resendCodeAction();
    expect(state.error).toContain("42 seconds");
  });

  it("lets a session redirect through", async () => {
    apiMock.resendCode.mockRejectedValue(new Error("NEXT_REDIRECT:/login?next=%2Fdashboard"));
    await expect(resendCodeAction()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("confirms when sent", async () => {
    apiMock.resendCode.mockResolvedValue({ ok: true });
    expect((await resendCodeAction()).notice).toBeTruthy();
  });
});
