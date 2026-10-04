import type { Request } from "express";
import { describe, expect, it } from "vitest";
import { clientIp } from "./client-ip.js";

const SECRET = "a-long-random-internal-secret-for-tests-0123456789";

function fakeRequest(headers: Record<string, string | string[]>, remote?: string): Request {
  return { headers, socket: { remoteAddress: remote } } as unknown as Request;
}

describe("clientIp", () => {
  it("trusts x-client-ip when the web app's internal secret matches", () => {
    const req = fakeRequest({ "x-client-ip": "41.1.2.3", "x-internal-secret": SECRET }, "10.0.0.5");
    expect(clientIp(req, SECRET)).toBe("41.1.2.3");
  });

  it("ignores x-client-ip without the secret", () => {
    expect(clientIp(fakeRequest({ "x-client-ip": "41.1.2.3" }, "10.0.0.5"), SECRET)).toBe(
      "10.0.0.5",
    );
  });

  it("ignores x-client-ip with a wrong secret, including one of a different length", () => {
    const wrongSameLength = "b" + SECRET.slice(1);
    const sameLength = fakeRequest(
      { "x-client-ip": "41.1.2.3", "x-internal-secret": wrongSameLength },
      "10.0.0.5",
    );
    expect(clientIp(sameLength, SECRET)).toBe("10.0.0.5");
    const shorter = fakeRequest(
      { "x-client-ip": "41.1.2.3", "x-internal-secret": "short" },
      "10.0.0.5",
    );
    expect(clientIp(shorter, SECRET)).toBe("10.0.0.5");
  });

  it("ignores x-client-ip when no secret is configured, even if the caller sends one", () => {
    const req = fakeRequest({ "x-client-ip": "41.1.2.3", "x-internal-secret": "" }, "10.0.0.5");
    expect(clientIp(req, undefined)).toBe("10.0.0.5");
    const withAny = fakeRequest(
      { "x-client-ip": "41.1.2.3", "x-internal-secret": SECRET },
      "10.0.0.5",
    );
    expect(clientIp(withAny, undefined)).toBe("10.0.0.5");
  });

  it("ignores a blank header even with the secret", () => {
    const req = fakeRequest({ "x-client-ip": "  ", "x-internal-secret": SECRET }, "10.0.0.5");
    expect(clientIp(req, SECRET)).toBe("10.0.0.5");
  });

  it("returns 'unknown' when nothing is available", () => {
    expect(clientIp(fakeRequest({}), SECRET)).toBe("unknown");
  });
});
