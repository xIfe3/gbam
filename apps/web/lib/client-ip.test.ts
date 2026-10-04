import { describe, expect, it } from "vitest";
import { pickVisitorIp, trustedProxyHops } from "./client-ip";

describe("pickVisitorIp", () => {
  it("ignores x-real-ip, which a visitor can fake through a default proxy setup", () => {
    // pickVisitorIp has no X-Real-IP input at all; the right-most XFF entry wins.
    expect(pickVisitorIp({ forwardedFor: "1.1.1.1, 203.0.113.9", hops: 1 })).toBe("203.0.113.9");
  });

  it("uses a single x-forwarded-for entry", () => {
    expect(pickVisitorIp({ forwardedFor: "203.0.113.9", hops: 1 })).toBe(
      "203.0.113.9",
    );
  });

  it("ignores spoofed leading entries and takes the one our proxy appended", () => {
    // The visitor sent "X-Forwarded-For: 6.6.6.6, 7.7.7.7"; our proxy appended their real
    // address. Only the right-most entry can be trusted.
    expect(
      pickVisitorIp({ forwardedFor: "6.6.6.6, 7.7.7.7, 203.0.113.9", hops: 1 }),
    ).toBe("203.0.113.9");
  });

  it("counts TRUSTED_PROXY_HOPS entries from the right", () => {
    // Visitor → CDN (appends visitor) → load balancer (appends CDN) → web.
    expect(
      pickVisitorIp({ forwardedFor: "6.6.6.6, 203.0.113.9, 10.0.0.2", hops: 2 }),
    ).toBe("203.0.113.9");
  });

  it("gives up when there are fewer entries than trusted proxies", () => {
    expect(pickVisitorIp({ forwardedFor: "203.0.113.9", hops: 2 })).toBeUndefined();
  });

  it("trims spaces around entries and headers", () => {
    expect(
      pickVisitorIp({ forwardedFor: " 1.1.1.1 ,  203.0.113.9  ", hops: 1 }),
    ).toBe("203.0.113.9");
  });

  it("returns undefined when nothing usable is present", () => {
    expect(pickVisitorIp({ forwardedFor: null, hops: 1 })).toBeUndefined();
    expect(pickVisitorIp({ forwardedFor: "", hops: 1 })).toBeUndefined();
    expect(pickVisitorIp({ forwardedFor: " , ", hops: 1 })).toBeUndefined();
  });

  it("handles IPv6 addresses", () => {
    expect(pickVisitorIp({ forwardedFor: "::1, 2001:db8::7334", hops: 1 })).toBe(
      "2001:db8::7334",
    );
  });
});

describe("trustedProxyHops", () => {
  it("defaults to 1 when unset or empty", () => {
    expect(trustedProxyHops(undefined)).toBe(1);
    expect(trustedProxyHops("")).toBe(1);
  });

  it("reads a whole number of at least 1", () => {
    expect(trustedProxyHops("2")).toBe(2);
    expect(trustedProxyHops(" 3 ")).toBe(3);
  });

  it("throws for anything else, so a typo can't silently trust the wrong entry", () => {
    expect(() => trustedProxyHops("0")).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(() => trustedProxyHops("-1")).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(() => trustedProxyHops("1.5")).toThrow(/TRUSTED_PROXY_HOPS/);
    expect(() => trustedProxyHops("two")).toThrow(/TRUSTED_PROXY_HOPS/);
  });
});
