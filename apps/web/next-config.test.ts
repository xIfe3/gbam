// @vitest-environment node
import { describe, expect, it } from "vitest";
import nextConfig from "./next.config";

describe("next.config security headers", () => {
  it("doesn't announce the framework", () => {
    expect(nextConfig.poweredByHeader).toBe(false);
  });

  it("sends the safety headers on every page", async () => {
    if (!nextConfig.headers) {
      throw new Error("next.config has no headers()");
    }
    const rules = await nextConfig.headers();
    const everyPage = rules.find((rule) => rule.source === "/:path*");
    const sent = new Map<string, string>();
    for (const header of everyPage?.headers ?? []) {
      sent.set(header.key, header.value);
    }
    expect(sent.get("Strict-Transport-Security")).toBe("max-age=31536000; includeSubDomains");
    expect(sent.get("X-Frame-Options")).toBe("DENY");
    expect(sent.get("X-Content-Type-Options")).toBe("nosniff");
    expect(sent.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
  });
});
