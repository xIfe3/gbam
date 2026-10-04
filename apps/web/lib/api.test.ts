import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { jar, incoming, redirect } = vi.hoisted(() => ({
  jar: { set: vi.fn(), get: vi.fn(), delete: vi.fn() },
  incoming: new Map<string, string>(),
  // redirect() really throws a special error; mimic that so code after it does not run.
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/headers", () => ({
  cookies: async () => jar,
  headers: async () => ({ get: (name: string) => incoming.get(name) ?? null }),
}));
vi.mock("next/navigation", () => ({ redirect, unstable_rethrow: vi.fn() }));

import { api } from "./api";

const fetchMock = vi.fn();

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  jar.set.mockReset();
  jar.get.mockReset();
  jar.delete.mockReset();
  redirect.mockClear();
  incoming.clear();
  vi.stubGlobal("fetch", fetchMock);
});

function sentHeaders(): Headers {
  const init = fetchMock.mock.calls[0]?.[1] as RequestInit;
  return init.headers as Headers;
}

describe("api session handling", () => {
  it("sends the session cookie as a Bearer token and never x-seller-id", async () => {
    jar.get.mockReturnValue({ value: "tok" });
    fetchMock.mockResolvedValue(jsonResponse(200, []));
    await api.listOrders();
    expect(sentHeaders().get("authorization")).toBe("Bearer tok");
    expect(sentHeaders().get("x-seller-id")).toBeNull();
  });

  it("on 401 clears the cookie and redirects to /login with next", async () => {
    jar.get.mockReturnValue({ value: "expired" });
    fetchMock.mockResolvedValue(jsonResponse(401, { message: "Unauthorized" }));
    await expect(api.listOrders()).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fdashboard");
    expect(jar.delete).toHaveBeenCalledWith("gbam_session");
  });

  it("uses the page path the proxy recorded as next, if it is safe", async () => {
    jar.get.mockReturnValue({ value: "expired" });
    incoming.set("x-gbam-path", "/dashboard/orders/1");
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    await expect(api.getOrder("1")).rejects.toThrow(
      "NEXT_REDIRECT:/login?next=%2Fdashboard%2Forders%2F1",
    );
  });

  it("ignores an unsafe recorded path", async () => {
    jar.get.mockReturnValue({ value: "expired" });
    incoming.set("x-gbam-path", "//evil.com");
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    await expect(api.listOrders()).rejects.toThrow("NEXT_REDIRECT:/login?next=%2Fdashboard");
  });

  it("still redirects to /login when clearing the cookie is not allowed (page render)", async () => {
    jar.get.mockReturnValue({ value: "expired" });
    jar.delete.mockImplementation(() => {
      throw new Error("Cookies can only be modified in a Server Action or Route Handler");
    });
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    await expect(api.listOrders()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("redirects without calling the API when a session route has no cookie", async () => {
    jar.get.mockReturnValue(undefined);
    await expect(api.listOrders()).rejects.toThrow("NEXT_REDIRECT:/login?next=");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("sends unverified users to /signup/verify on 403 EMAIL_NOT_VERIFIED", async () => {
    jar.get.mockReturnValue({ value: "tok" });
    fetchMock.mockResolvedValue(jsonResponse(403, { code: "EMAIL_NOT_VERIFIED" }));
    await expect(api.listOrders()).rejects.toThrow("NEXT_REDIRECT:/signup/verify");
  });

  it("does not redirect on a wrong-password 401 from login", async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(401, { message: "That email and password don't match" }),
    );
    await expect(api.login({ email: "a@b.co", password: "x" })).rejects.toMatchObject({
      status: 401,
    });
    expect(redirect).not.toHaveBeenCalled();
    expect(jar.delete).not.toHaveBeenCalled();
    expect(sentHeaders().get("authorization")).toBeNull();
  });

  it("currentUserOrNull returns null on 401 instead of redirecting", async () => {
    jar.get.mockReturnValue({ value: "stale" });
    fetchMock.mockResolvedValue(jsonResponse(401, {}));
    expect(await api.currentUserOrNull()).toBeNull();
    expect(redirect).not.toHaveBeenCalled();
  });

  it("currentUserOrNull returns null without calling the API when there is no cookie", async () => {
    jar.get.mockReturnValue(undefined);
    expect(await api.currentUserOrNull()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
