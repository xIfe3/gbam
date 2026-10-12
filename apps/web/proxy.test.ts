// @vitest-environment node
import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

// The maintenance status the proxy reads (from the API in real life).
const { getPlatformInfo } = vi.hoisted(() => ({ getPlatformInfo: vi.fn() }));
vi.mock("./lib/platform-info", () => ({ getPlatformInfo }));

import { config, proxy } from "./proxy";

function maintenance(level: "off" | "full" | "pause") {
  return {
    whatsappNumber: null,
    signupsOpen: true,
    feePercentBasisPoints: 150,
    feeCapKobo: 100_000,
    maintenance: { level, message: null, backBy: null },
  };
}

beforeEach(() => {
  getPlatformInfo.mockResolvedValue(maintenance("off"));
});

describe("proxy", () => {
  it("only runs on the dashboard and the get-paid step", async () => {
    // Every page (for maintenance mode), but not Next's own files, the API proxy or files.
    expect(config.matcher).toEqual(["/((?!_next/|api/|.*\\..*).*)"]);
  });

  it("admin pages without the cookie go to /admin/login", async () => {
    const res = await proxy(new NextRequest("http://localhost:3000/admin/shops"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/login");
  });

  it("a seller cookie doesn't open admin pages", async () => {
    const res = await proxy(
      new NextRequest("http://localhost:3000/admin", { headers: { cookie: "gbam_session=abc" } }),
    );
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/login");
  });

  it("admin sign-in and invite pages are open without the cookie", async () => {
    for (const path of ["/admin/login", "/admin/invite/some-token"]) {
      const res = await proxy(new NextRequest(`http://localhost:3000${path}`));
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("admin pages with the admin cookie go through, without touching gbam_session", async () => {
    const res = await proxy(
      new NextRequest("http://localhost:3000/admin/shops", {
        headers: { cookie: "gbam_admin=xyz" },
      }),
    );
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("gbam_session")).toBeUndefined();
  });

  it("sends a logged-out visitor on get-paid to /login with next=/signup/get-paid", async () => {
    const res = await proxy(new NextRequest("http://localhost:3000/signup/get-paid"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fsignup%2Fget-paid",
    );
  });

  it("redirects to /login with the original path when there is no session cookie", async () => {
    const res = await proxy(new NextRequest("http://localhost:3000/dashboard/orders/1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fdashboard%2Forders%2F1",
    );
  });

  it("keeps the query string in next", async () => {
    const res = await proxy(new NextRequest("http://localhost:3000/dashboard?status=paid"));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fdashboard%3Fstatus%3Dpaid",
    );
  });

  it("treats an empty cookie as no cookie", async () => {
    const res = await proxy(
      new NextRequest("http://localhost:3000/dashboard", { headers: { cookie: "gbam_session=" } }),
    );
    expect(res.status).toBe(307);
  });

  it("re-sets gbam_session with the same attributes and a fresh 30-day maxAge", async () => {
    const res = await proxy(
      new NextRequest("http://localhost:3000/dashboard", {
        headers: { cookie: "gbam_session=abc" },
      }),
    );
    const cookie = res.cookies.get("gbam_session");
    expect(cookie?.value).toBe("abc");
    expect(cookie?.httpOnly).toBe(true);
    expect(cookie?.sameSite).toBe("lax");
    expect(cookie?.path).toBe("/");
    expect(cookie?.maxAge).toBe(60 * 60 * 24 * 30);
  });

  it("sets no cookie when redirecting to login", async () => {
    const res = await proxy(new NextRequest("http://localhost:3000/dashboard"));
    expect(res.cookies.get("gbam_session")).toBeUndefined();
  });

  it("overwrites a client-sent x-gbam-path", async () => {
    const res = await proxy(
      new NextRequest("http://localhost:3000/dashboard/orders/1", {
        headers: { cookie: "gbam_session=abc", "x-gbam-path": "//evil.com" },
      }),
    );
    expect(res.headers.get("x-middleware-request-x-gbam-path")).toBe("/dashboard/orders/1");
  });

  it("passes through when the cookie is present", async () => {
    const res = await proxy(
      new NextRequest("http://localhost:3000/dashboard/orders/1", {
        headers: { cookie: "gbam_session=abc" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // NextResponse.next() marks pass-through with this header.
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });

  it("full rewrites a shop page to the maintenance page", async () => {
    getPlatformInfo.mockResolvedValue(maintenance("full"));
    const res = await proxy(new NextRequest("http://localhost:3000/ada"));
    expect(res.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/maintenance");
  });

  it("admin pages are not rewritten in full maintenance", async () => {
    getPlatformInfo.mockResolvedValue(maintenance("full"));
    const res = await proxy(
      new NextRequest("http://localhost:3000/admin/shops", { headers: { cookie: "gbam_admin=x" } }),
    );
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("pause rewrites checkout but not the shop", async () => {
    getPlatformInfo.mockResolvedValue(maintenance("pause"));
    const checkout = await proxy(new NextRequest("http://localhost:3000/ada/order"));
    expect(checkout.headers.get("x-middleware-rewrite")).toBe("http://localhost:3000/maintenance");
    const shop = await proxy(new NextRequest("http://localhost:3000/ada"));
    expect(shop.headers.get("x-middleware-rewrite")).toBeNull();
  });

  it("fails open when the status can't be loaded", async () => {
    getPlatformInfo.mockResolvedValue(null);
    const res = await proxy(new NextRequest("http://localhost:3000/ada"));
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
    expect(res.headers.get("location")).toBeNull();
  });

  it("public pages pass straight through when maintenance is off", async () => {
    const res = await proxy(new NextRequest("http://localhost:3000/pricing"));
    expect(res.headers.get("location")).toBeNull();
    expect(res.headers.get("x-middleware-rewrite")).toBeNull();
  });

  describe("remembering where a visitor came from", () => {
    it("saves ?ref= in the gbam_ref cookie for 30 days", async () => {
      const res = await proxy(new NextRequest("http://localhost:3000/?ref=shop-mama-ngozi"));
      const cookie = res.cookies.get("gbam_ref");
      expect(cookie?.value).toBe("shop-mama-ngozi");
      expect(cookie?.maxAge).toBe(30 * 24 * 60 * 60);
      expect(cookie?.httpOnly).toBe(true);
    });

    it("saves ?utm_source= when there's no ?ref=", async () => {
      const res = await proxy(new NextRequest("http://localhost:3000/pricing?utm_source=tiktok"));
      expect(res.cookies.get("gbam_ref")?.value).toBe("tiktok");
    });

    it("keeps the first source: a later link doesn't replace it", async () => {
      const res = await proxy(
        new NextRequest("http://localhost:3000/?ref=instagram", {
          headers: { cookie: "gbam_ref=shop-mama-ngozi" },
        }),
      );
      expect(res.cookies.get("gbam_ref")).toBeUndefined();
    });

    it("cleans what it saves, and saves nothing for nothing usable", async () => {
      const dirty = await proxy(new NextRequest("http://localhost:3000/?ref=%3Cb%3EHi%3C%2Fb%3E"));
      expect(dirty.cookies.get("gbam_ref")?.value).toBe("bhib");
      const empty = await proxy(new NextRequest("http://localhost:3000/?ref=%21%21"));
      expect(empty.cookies.get("gbam_ref")).toBeUndefined();
    });
  });
});
