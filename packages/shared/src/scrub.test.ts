import { describe, expect, it } from "vitest";
import { scrubText } from "./scrub";

describe("scrubText", () => {
  it("hides email addresses", () => {
    expect(scrubText("Could not email ada@example.com")).toBe("Could not email [email]");
  });

  it("hides phone numbers, with or without +", () => {
    expect(scrubText("send to 2348031234567 failed")).toBe("send to [phone] failed");
    expect(scrubText("send to +2348031234567 failed")).toBe("send to [phone] failed");
  });

  it("hides the secret key in a tracking link but keeps the rest", () => {
    expect(scrubText("GET /track/GB-7K3Q?k=Zx9_abc-123")).toBe("GET /track/GB-7K3Q?k=[key]");
  });

  it("leaves order codes, amounts and short numbers alone", () => {
    expect(scrubText("Order GB-7K3Q total 450000 kobo")).toBe("Order GB-7K3Q total 450000 kobo");
  });
});
