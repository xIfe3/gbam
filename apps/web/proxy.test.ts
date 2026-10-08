// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

describe("proxy", () => {
  it("only runs on the dashboard and the get-paid step", () => {
    expect(config.matcher).toEqual(["/dashboard/:path*", "/signup/get-paid", "/admin/:path*"]);
  });

  it("admin pages without the cookie go to /admin/login", () => {
    const res = proxy(new NextRequest("http://localhost:3000/admin/shops"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/login");
  });

  it("a seller cookie doesn't open admin pages", () => {
    const res = proxy(
      new NextRequest("http://localhost:3000/admin", { headers: { cookie: "gbam_session=abc" } }),
    );
    expect(res.headers.get("location")).toBe("http://localhost:3000/admin/login");
  });

  it("admin sign-in and invite pages are open without the cookie", () => {
    for (const path of ["/admin/login", "/admin/invite/some-token"]) {
      const res = proxy(new NextRequest(`http://localhost:3000${path}`));
      expect(res.headers.get("location")).toBeNull();
    }
  });

  it("admin pages with the admin cookie go through, without touching gbam_session", () => {
    const res = proxy(
      new NextRequest("http://localhost:3000/admin/shops", {
        headers: { cookie: "gbam_admin=xyz" },
      }),
    );
    expect(res.headers.get("location")).toBeNull();
    expect(res.cookies.get("gbam_session")).toBeUndefined();
  });

  it("sends a logged-out visitor on get-paid to /login with next=/signup/get-paid", () => {
    const res = proxy(new NextRequest("http://localhost:3000/signup/get-paid"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fsignup%2Fget-paid",
    );
  });

  it("redirects to /login with the original path when there is no session cookie", () => {
    const res = proxy(new NextRequest("http://localhost:3000/dashboard/orders/1"));
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fdashboard%2Forders%2F1",
    );
  });

  it("keeps the query string in next", () => {
    const res = proxy(new NextRequest("http://localhost:3000/dashboard?status=paid"));
    expect(res.headers.get("location")).toBe(
      "http://localhost:3000/login?next=%2Fdashboard%3Fstatus%3Dpaid",
    );
  });

  it("treats an empty cookie as no cookie", () => {
    const res = proxy(
      new NextRequest("http://localhost:3000/dashboard", { headers: { cookie: "gbam_session=" } }),
    );
    expect(res.status).toBe(307);
  });

  it("re-sets gbam_session with the same attributes and a fresh 30-day maxAge", () => {
    const res = proxy(
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

  it("sets no cookie when redirecting to login", () => {
    const res = proxy(new NextRequest("http://localhost:3000/dashboard"));
    expect(res.cookies.get("gbam_session")).toBeUndefined();
  });

  it("overwrites a client-sent x-gbam-path", () => {
    const res = proxy(
      new NextRequest("http://localhost:3000/dashboard/orders/1", {
        headers: { cookie: "gbam_session=abc", "x-gbam-path": "//evil.com" },
      }),
    );
    expect(res.headers.get("x-middleware-request-x-gbam-path")).toBe("/dashboard/orders/1");
  });

  it("passes through when the cookie is present", () => {
    const res = proxy(
      new NextRequest("http://localhost:3000/dashboard/orders/1", {
        headers: { cookie: "gbam_session=abc" },
      }),
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("location")).toBeNull();
    // NextResponse.next() marks pass-through with this header.
    expect(res.headers.get("x-middleware-next")).toBe("1");
  });
});
