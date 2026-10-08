import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  currentStep,
  decryptSecret,
  encryptSecret,
  newBackupCodes,
  newTotpSecret,
  otpauthUrl,
  totpCode,
  verifyTotp,
} from "./admin-crypto.js";

// The RFC 6238 test secret: the ASCII text "12345678901234567890", written in base32.
const RFC_SECRET = "GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ";

describe("TOTP", () => {
  it("RFC 6238 test vector", () => {
    // At 59 seconds the RFC's 8-digit SHA-1 code is 94287082; we use the last 6 digits.
    expect(totpCode(RFC_SECRET, currentStep(59_000))).toBe("287082");
  });

  it("accepts the previous and next step", () => {
    const secret = newTotpSecret();
    const now = 1_700_000_000_000;
    const step = currentStep(now);
    expect(verifyTotp(secret, totpCode(secret, step - 1), now, null)).toBe(step - 1);
    expect(verifyTotp(secret, totpCode(secret, step + 1), now, null)).toBe(step + 1);
    expect(verifyTotp(secret, totpCode(secret, step + 2), now, null)).toBeNull();
  });

  it("refuses a reused step", () => {
    const secret = newTotpSecret();
    const now = 1_700_000_000_000;
    const step = currentStep(now);
    const code = totpCode(secret, step);
    expect(verifyTotp(secret, code, now, null)).toBe(step);
    // The same code again, after it already worked: refused.
    expect(verifyTotp(secret, code, now, step)).toBeNull();
  });

  it("makes an otpauth link the authenticator apps understand", () => {
    const url = otpauthUrl("ABCDEF", "chika@example.com");
    expect(url).toBe(
      "otpauth://totp/Gbam%20Admin:chika%40example.com?secret=ABCDEF&issuer=Gbam%20Admin",
    );
  });
});

describe("secret encryption", () => {
  it("encrypt round-trips and a wrong key fails", () => {
    const key = randomBytes(32).toString("base64");
    const otherKey = randomBytes(32).toString("base64");
    const encrypted = encryptSecret("SECRET123", key);
    expect(encrypted).not.toContain("SECRET123");
    expect(decryptSecret(encrypted, key)).toBe("SECRET123");
    expect(() => decryptSecret(encrypted, otherKey)).toThrow();
  });
});

describe("backup codes", () => {
  it("backup codes are 10 unique", () => {
    const codes = newBackupCodes();
    expect(codes).toHaveLength(10);
    expect(new Set(codes).size).toBe(10);
    for (const code of codes) {
      expect(code).toMatch(/^[0-9a-f]{4}-[0-9a-f]{4}$/);
    }
  });
});
