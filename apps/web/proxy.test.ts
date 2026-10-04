// @vitest-environment node
import { NextRequest } from "next/server";
import { describe, expect, it } from "vitest";
import { config, proxy } from "./proxy";

describe("proxy", () => {
  it("only runs on the dashboard", () => {
    expect(config.matcher).toEqual(["/dashboard/:path*"]);
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
