import { describe, expect, it } from "vitest";
import { cleanSignupSource } from "./signup-source";

describe("cleanSignupSource", () => {
  it("keeps a normal tag, in lowercase", () => {
    expect(cleanSignupSource("shop-mama-ngozi")).toBe("shop-mama-ngozi");
    expect(cleanSignupSource("Instagram")).toBe("instagram");
  });

  it("drops anything that isn't a letter, digit, dash, underscore, dot or colon", () => {
    expect(cleanSignupSource("<script>x</script>")).toBe("scriptxscript");
    expect(cleanSignupSource("whatsapp status")).toBe("whatsappstatus");
  });

  it("cuts a long value to 60 characters", () => {
    expect(cleanSignupSource("a".repeat(200))).toHaveLength(60);
  });

  it("gives null for nothing usable", () => {
    expect(cleanSignupSource(undefined)).toBeNull();
    expect(cleanSignupSource("")).toBeNull();
    expect(cleanSignupSource("   ")).toBeNull();
    expect(cleanSignupSource("!!!")).toBeNull();
  });
});
