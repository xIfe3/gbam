import { describe, expect, it } from "vitest";
import { siteUrlFrom } from "./site";

describe("siteUrlFrom", () => {
  it("defaults to the real domain when unset or blank", () => {
    expect(siteUrlFrom(undefined)).toBe("https://gbam.app");
    expect(siteUrlFrom("  ")).toBe("https://gbam.app");
  });

  it("uses the configured address without a trailing slash", () => {
    expect(siteUrlFrom("https://gbam.zephra.dev/")).toBe("https://gbam.zephra.dev");
    expect(siteUrlFrom(" http://localhost:3000 ")).toBe("http://localhost:3000");
  });

  it("refuses something that isn't a web address, so a typo fails the build loudly", () => {
    expect(() => siteUrlFrom("gbam.zephra.dev")).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(() => siteUrlFrom("ftp://gbam.app")).toThrow(/NEXT_PUBLIC_SITE_URL/);
  });
});
