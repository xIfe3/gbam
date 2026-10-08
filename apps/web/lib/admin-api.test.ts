import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { redirect } = vi.hoisted(() => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`NEXT_REDIRECT:${url}`);
  }),
}));
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("./admin-session", () => ({ getAdminToken: async () => "admin-token" }));
vi.mock("./api", () => {
  class ApiError extends Error {
    constructor(
      readonly status: number,
      readonly body: unknown,
    ) {
      super("api");
    }
  }
  return { ApiError, apiUrl: () => "http://api.test", visitorIp: async () => undefined };
});

import { adminApi } from "./admin-api";
import { ApiError } from "./api";

function reply(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("adminApi", () => {
  it("sends the admin token in x-admin-token", async () => {
    const fetchMock = vi.fn(async () => reply(200, { rows: [], total: 0, page: 1, pageSize: 50 }));
    vi.stubGlobal("fetch", fetchMock);
    await adminApi.shops({ q: "ada" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/admin/shops?q=ada");
    expect(new Headers(init.headers).get("x-admin-token")).toBe("admin-token");
  });

  it("opening a page the role doesn't allow goes to the overview with a notice", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(403, { message: "Your role doesn't allow this" })),
    );
    await expect(adminApi.team()).rejects.toThrow("NEXT_REDIRECT:/admin?denied=1");
  });

  it("a refused change (not a page load) is an error the form can show", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(403, { message: "Your role doesn't allow this" })),
    );
    await expect(adminApi.suspendShop("s1", "Reported for fraud")).rejects.toBeInstanceOf(ApiError);
  });

  it("an ended session goes back to sign in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => reply(401, {})),
    );
    await expect(adminApi.me()).rejects.toThrow("NEXT_REDIRECT:/admin/login");
  });
});
