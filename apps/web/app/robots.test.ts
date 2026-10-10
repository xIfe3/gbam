import { afterEach, describe, expect, it, vi } from "vitest";
import robots from "./robots";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("robots.txt", () => {
  it("the live site lets search engines in, except private pages", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "production");
    const result = robots();
    expect(result.rules).toMatchObject({ userAgent: "*", allow: "/" });
    expect(result.sitemap).toBeDefined();
  });

  it("staging keeps every search engine out", () => {
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "staging");
    const result = robots();
    expect(result.rules).toEqual({ userAgent: "*", disallow: "/" });
    expect(result.sitemap).toBeUndefined();
  });
});
