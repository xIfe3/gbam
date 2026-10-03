import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip.js";

function fakeRequest(headers: Record<string, string | string[]>, remote?: string): Request {
  return { headers, socket: { remoteAddress: remote } } as unknown as Request;
}

describe("clientIp", () => {
  it("prefers the x-client-ip header the web app forwards", () => {
    expect(clientIp(fakeRequest({ "x-client-ip": "41.1.2.3" }, "10.0.0.5"))).toBe("41.1.2.3");
  });

  it("falls back to the socket address", () => {
    expect(clientIp(fakeRequest({}, "10.0.0.5"))).toBe("10.0.0.5");
  });

  it("ignores a blank header", () => {
    expect(clientIp(fakeRequest({ "x-client-ip": "  " }, "10.0.0.5"))).toBe("10.0.0.5");
  });

  it("returns 'unknown' when nothing is available", () => {
    expect(clientIp(fakeRequest({}))).toBe("unknown");
  });
});
