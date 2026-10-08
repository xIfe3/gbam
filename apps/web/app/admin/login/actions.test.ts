import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { adminApiMock, FakeApiError, redirect, setAdminCookie } = vi.hoisted(() => {
  class FakeApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return {
    adminApiMock: { login: vi.fn(), verify: vi.fn() },
    FakeApiError,
    // Like Next's redirect: it stops the action by throwing.
    redirect: vi.fn((url: string) => {
      throw new Error(`NEXT_REDIRECT:${url}`);
    }),
    setAdminCookie: vi.fn(async () => {}),
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
vi.mock("@/lib/admin-api", () => ({ adminApi: adminApiMock }));
vi.mock("@/lib/api", () => ({ ApiError: FakeApiError }));
vi.mock("@/lib/admin-session", () => ({ setAdminCookie }));

import { adminLoginAction } from "./actions";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

const START = { step: "password" as const };

beforeEach(() => {
  vi.clearAllMocks();
});

describe("adminLoginAction", () => {
  it("login asks for the code after the password", async () => {
    adminApiMock.login.mockResolvedValue({ challengeToken: "c1" });
    const state = await adminLoginAction(
      START,
      form({ email: "chika@example.com", password: "a long admin password" }),
    );
    expect(adminApiMock.login).toHaveBeenCalledWith({
      email: "chika@example.com",
      password: "a long admin password",
    });
    expect(state).toMatchObject({ step: "code", challengeToken: "c1" });
  });

  it("a wrong password stays on the password step", async () => {
    adminApiMock.login.mockRejectedValue(
      new FakeApiError(401, { message: "That email and password don't match" }),
    );
    const state = await adminLoginAction(
      START,
      form({ email: "chika@example.com", password: "wrong one" }),
    );
    expect(state.step).toBe("password");
    expect(state.error).toBe("That email and password don't match");
  });

  it("the right code signs in and goes to the admin area", async () => {
    adminApiMock.verify.mockResolvedValue({ sessionToken: "s1" });
    await expect(
      adminLoginAction(
        { step: "code", challengeToken: "c1" },
        form({ challengeToken: "c1", code: "123456" }),
      ),
    ).rejects.toThrow("NEXT_REDIRECT:/admin");
    expect(setAdminCookie).toHaveBeenCalledWith("s1");
  });

  it("wrong code shows an error and stays on the code step", async () => {
    adminApiMock.verify.mockRejectedValue(
      new FakeApiError(401, { field: "code", message: "That code isn't right." }),
    );
    const state = await adminLoginAction(
      { step: "code", challengeToken: "c1" },
      form({ challengeToken: "c1", code: "000000" }),
    );
    expect(state).toMatchObject({ step: "code", challengeToken: "c1" });
    expect(state.fieldErrors?.code).toBe("That code isn't right.");
  });

  it("a timed-out sign-in goes back to the password step", async () => {
    adminApiMock.verify.mockRejectedValue(
      new FakeApiError(401, { message: "Sign-in timed out. Please start again." }),
    );
    const state = await adminLoginAction(
      { step: "code", challengeToken: "c1" },
      form({ challengeToken: "c1", code: "123456" }),
    );
    expect(state.step).toBe("password");
    expect(state.error).toBe("Sign-in timed out. Please start again.");
  });
});
