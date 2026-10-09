// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api", () => ({
  apiUrl: () => "http://api.test",
  visitorIp: async () => "102.89.1.2",
}));

import { POST } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.INTERNAL_API_SECRET;
});

describe("POST /api/beat", () => {
  it("route forwards and always answers 204", async () => {
    process.env.INTERNAL_API_SECRET = "s".repeat(40);
    const fetchMock = vi.fn(async () => new Response(null, { status: 204 }));
    vi.stubGlobal("fetch", fetchMock);
    const body = JSON.stringify({
      tabId: "t".repeat(20),
      kind: "storefront",
      shop: "ada",
      first: true,
    });
    const res = await POST(
      new Request("http://localhost/api/beat", {
        method: "POST",
        body,
        headers: { "user-agent": "Mozilla/5.0" },
      }),
    );
    expect(res.status).toBe(204);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/beat");
    const headers = new Headers(init.headers);
    expect(headers.get("user-agent")).toBe("Mozilla/5.0");
    expect(headers.get("x-client-ip")).toBe("102.89.1.2");
    expect(init.body).toBe(body);
  });

  it("still answers 204 when the API is down", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("down");
      }),
    );
    const res = await POST(
      new Request("http://localhost/api/beat", { method: "POST", body: "{}" }),
    );
    expect(res.status).toBe(204);
  });

  it("drops a body that's too big", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(
      new Request("http://localhost/api/beat", { method: "POST", body: "x".repeat(5_000) }),
    );
    expect(res.status).toBe(204);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
