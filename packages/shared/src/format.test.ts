import { describe, expect, it } from "vitest";
import { formatNaira, normalizeNigerianPhone } from "./format";
import { slugSchema } from "./schemas";

describe("formatNaira", () => {
  it("formats whole naira without kobo", () => {
    expect(formatNaira(350_000)).toBe("₦3,500");
    expect(formatNaira(0)).toBe("₦0");
  });

  it("shows kobo when present", () => {
    expect(formatNaira(350_050)).toBe("₦3,500.50");
  });
});

describe("normalizeNigerianPhone", () => {
  it.each([
    ["08031234567", "2348031234567"],
    ["0803 123 4567", "2348031234567"],
    ["+234 803 123 4567", "2348031234567"],
    ["2348031234567", "2348031234567"],
    ["8031234567", "2348031234567"],
    ["07012345678", "2347012345678"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeNigerianPhone(input)).toBe(expected);
  });

  it.each(["", "12345", "0603123456", "080312345678", "abc08031234567"])("rejects %j", (input) => {
    expect(normalizeNigerianPhone(input)).toBeNull();
  });
});

describe("slugSchema", () => {
  it("accepts normal store slugs", () => {
    expect(slugSchema.safeParse("mama-ngozi").success).toBe(true);
  });

  it("rejects slugs that collide with app routes", () => {
    expect(slugSchema.safeParse("dashboard").success).toBe(false);
    expect(slugSchema.safeParse("api").success).toBe(false);
  });
});
