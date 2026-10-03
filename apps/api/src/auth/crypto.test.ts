import { describe, expect, it } from "vitest";
import { hashPassword, hashToken, newEmailCode, newSessionToken, verifyPassword } from "./crypto.js";

describe("password hashing", () => {
  it("hashes to an Argon2id string that differs from the password", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(hash).not.toBe("correct horse battery");
    expect(hash.startsWith("$argon2id$")).toBe(true);
  });

  it("verifies the right password and rejects a wrong one", async () => {
    const hash = await hashPassword("correct horse battery");
    expect(await verifyPassword(hash, "correct horse battery")).toBe(true);
    expect(await verifyPassword(hash, "wrong password")).toBe(false);
  });

  it("salts: the same password hashes differently each time", async () => {
    expect(await hashPassword("same-password")).not.toBe(await hashPassword("same-password"));
  });

  it("returns false (does not throw) for a malformed hash", async () => {
    expect(await verifyPassword("not-a-hash", "whatever")).toBe(false);
    expect(await verifyPassword("", "whatever")).toBe(false);
  });
});

describe("session tokens", () => {
  it("are unique, 43 chars, base64url", () => {
    const a = newSessionToken();
    const b = newSessionToken();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(43);
    expect(a).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });

  it("hashToken is stable, 64 hex chars, and differs per input", () => {
    expect(hashToken("abc")).toBe(hashToken("abc"));
    expect(hashToken("abc")).toMatch(/^[0-9a-f]{64}$/);
    expect(hashToken("abc")).not.toBe(hashToken("abd"));
  });
});

describe("email codes", () => {
  it("are always 6 digits", () => {
    for (let i = 0; i < 1000; i++) {
      expect(newEmailCode()).toMatch(/^\d{6}$/);
    }
  });
});
