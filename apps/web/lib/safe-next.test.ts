import { describe, expect, it } from "vitest";
import { safeNextPath } from "./safe-next";

describe("safeNextPath", () => {
  it("accepts a local path, with query", () => {
    expect(safeNextPath("/dashboard/orders/1")).toBe("/dashboard/orders/1");
    expect(safeNextPath("/dashboard?status=paid")).toBe("/dashboard?status=paid");
  });

  it("rejects anything that could leave the site", () => {
    const bad = [
      "//evil.com",
      "/\\evil.com",
      "https://evil.com",
      "evil.com",
      "javascript:alert(1)",
      "/\t/evil.com", // browsers drop the tab, leaving //evil.com
      "/\n/evil.com",
      "",
    ];
    for (const value of bad) {
      expect(safeNextPath(value)).toBeNull();
    }
  });

  it("rejects non-strings", () => {
    expect(safeNextPath(undefined)).toBeNull();
    expect(safeNextPath(["/dashboard"])).toBeNull();
    expect(safeNextPath(null)).toBeNull();
  });
});
