import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// "server-only" throws outside Next's server build; an empty stand-in lets tests import it.
vi.mock("server-only", () => ({}));

const { jar } = vi.hoisted(() => ({
  jar: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
}));
vi.mock("next/headers", () => ({ cookies: async () => jar }));

import { clearSessionCookie, getSessionToken, setSessionCookie } from "./session";

beforeEach(() => {
  jar.set.mockReset();
  jar.get.mockReset();
  jar.delete.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("setSessionCookie", () => {
  it("sets gbam_session with the required attributes (production)", async () => {
    vi.stubEnv("NODE_ENV", "production");
    await setSessionCookie("tok123");
    expect(jar.set).toHaveBeenCalledTimes(1);
    expect(jar.set).toHaveBeenCalledWith("gbam_session", "tok123", {
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      maxAge: 60 * 60 * 24 * 30,
      path: "/",
    });
  });

  it("is not Secure outside production so http://localhost works", async () => {
    vi.stubEnv("NODE_ENV", "development");
    await setSessionCookie("tok123");
    expect(jar.set.mock.calls[0]?.[2]).toMatchObject({ secure: false, httpOnly: true });
  });
});

describe("getSessionToken", () => {
  it("returns the cookie value", async () => {
    jar.get.mockReturnValue({ name: "gbam_session", value: "abc" });
    expect(await getSessionToken()).toBe("abc");
    expect(jar.get).toHaveBeenCalledWith("gbam_session");
  });

  it("returns null when there is no cookie or it is empty", async () => {
    jar.get.mockReturnValue(undefined);
    expect(await getSessionToken()).toBeNull();
    jar.get.mockReturnValue({ name: "gbam_session", value: "" });
    expect(await getSessionToken()).toBeNull();
  });
});

describe("clearSessionCookie", () => {
  it("deletes gbam_session", async () => {
    await clearSessionCookie();
    expect(jar.delete).toHaveBeenCalledWith("gbam_session");
  });
});
