// @vitest-environment node
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/api", () => ({ apiUrl: () => "http://api.test" }));

import { POST } from "./route";

afterEach(() => {
  vi.unstubAllGlobals();
});

const S = "6f1c1f0e-2b7a-4d61-9a5e-2f5a1c9b0d11";

describe("POST /api/unsubscribe (one-click from email apps)", () => {
  it("passes the seller and token from the link to the API", async () => {
    const fetchMock = vi.fn(async () => Response.json({ ok: true }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await POST(
      new Request(`http://localhost/api/unsubscribe?s=${S}&t=token123`, {
        method: "POST",
        // What Gmail and others send for a one-click unsubscribe.
        body: "List-Unsubscribe=One-Click",
        headers: { "content-type": "application/x-www-form-urlencoded" },
      }),
    );
    expect(res.status).toBe(200);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("http://api.test/email/unsubscribe");
    expect(JSON.parse(String(init.body))).toEqual({ s: S, t: "token123" });
  });

  it("a refused link is a 400, and a missing one never reaches the API", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ message: "bad" }, { status: 400 })),
    );
    const refused = await POST(
      new Request(`http://localhost/api/unsubscribe?s=${S}&t=bad`, { method: "POST" }),
    );
    expect(refused.status).toBe(400);
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const missing = await POST(new Request("http://localhost/api/unsubscribe", { method: "POST" }));
    expect(missing.status).toBe(400);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
