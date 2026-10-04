import { describe, expect, it } from "vitest";
import {
  codeSchema,
  contactMessageSchema,
  emailSchema,
  forgotPasswordSchema,
  loginSchema,
  passwordSchema,
  payoutAccountSchema,
  resetPasswordSchema,
  signupSchema,
} from "./schemas";

const valid = { name: "Ada", email: "ada@example.com", message: "Hello, I have a question." };

describe("emailSchema", () => {
  it("trims and lowercases", () => {
    expect(emailSchema.parse("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("rejects a non-email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
  });
});

describe("auth schemas", () => {
  const signup = {
    businessName: "Ada's Cakes",
    slug: "adas-cakes",
    phone: "0803 123 4567",
    email: " Ada@Example.com ",
    password: "longenough",
  };

  it("emailSchema normalises", () => {
    expect(emailSchema.parse(" Ada@Example.com ")).toBe("ada@example.com");
  });

  it("passwordSchema enforces 8 to 200 characters", () => {
    expect(passwordSchema.safeParse("1234567").success).toBe(false);
    expect(passwordSchema.safeParse("12345678").success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(200)).success).toBe(true);
    expect(passwordSchema.safeParse("a".repeat(201)).success).toBe(false);
  });

  it("codeSchema needs exactly 6 digits", () => {
    expect(codeSchema.safeParse("012345").success).toBe(true);
    expect(codeSchema.safeParse("12345").success).toBe(false);
    expect(codeSchema.safeParse("1234567").success).toBe(false);
    expect(codeSchema.safeParse("12345a").success).toBe(false);
  });

  it("signupSchema normalises email and phone, rejects reserved slugs", () => {
    const parsed = signupSchema.parse(signup);
    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.phone).toBe("2348031234567");
    expect(signupSchema.safeParse({ ...signup, slug: "admin" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...signup, businessName: "" }).success).toBe(false);
    expect(signupSchema.safeParse({ ...signup, businessName: "x".repeat(121) }).success).toBe(
      false,
    );
  });

  it("loginSchema takes email and password", () => {
    expect(loginSchema.parse({ email: " A@B.com", password: "12345678" }).email).toBe("a@b.com");
    expect(loginSchema.safeParse({ email: "a@b.com", password: "" }).success).toBe(false);
  });

  it("loginSchema does not apply the signup password policy, only a size cap", () => {
    // Older or shorter passwords must still be able to log in; the policy is for new ones.
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x" }).success).toBe(true);
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x".repeat(200) }).success).toBe(
      true,
    );
    expect(loginSchema.safeParse({ email: "a@b.com", password: "x".repeat(201) }).success).toBe(
      false,
    );
  });

  it("forgotPasswordSchema normalises the email", () => {
    expect(forgotPasswordSchema.parse({ email: " Ada@B.com " }).email).toBe("ada@b.com");
    expect(forgotPasswordSchema.safeParse({ email: "nope" }).success).toBe(false);
  });

  it("resetPasswordSchema needs email, requestId, a 6-digit code and a policy-compliant password", () => {
    const ok = {
      email: "A@b.com",
      requestId: "abcDEF0123456789_-abcDEF0123456789_-abcDEF0",
      code: "012345",
      password: "new password",
    };
    expect(resetPasswordSchema.parse(ok).email).toBe("a@b.com");
    expect(resetPasswordSchema.parse(ok).requestId).toBe(ok.requestId);
    expect(resetPasswordSchema.safeParse({ ...ok, code: "12345" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...ok, password: "short" }).success).toBe(false);
    const { requestId: _omitted, ...withoutRequestId } = ok;
    expect(resetPasswordSchema.safeParse(withoutRequestId).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...ok, requestId: "short" }).success).toBe(false);
    expect(resetPasswordSchema.safeParse({ ...ok, requestId: "a".repeat(42) + "!" }).success).toBe(
      false,
    );
  });
});

describe("contactMessageSchema", () => {
  it("accepts a minimal message and normalises the email", () => {
    const parsed = contactMessageSchema.parse({ ...valid, email: " ADA@Example.com " });
    expect(parsed.email).toBe("ada@example.com");
    expect(parsed.phone).toBeUndefined();
  });

  it("normalises an optional phone", () => {
    expect(contactMessageSchema.parse({ ...valid, phone: "0803 123 4567" }).phone).toBe(
      "2348031234567",
    );
  });

  it("rejects a name with a newline (it goes into an email subject)", () => {
    expect(contactMessageSchema.safeParse({ ...valid, name: "Ada\nBcc: x@y.com" }).success).toBe(
      false,
    );
  });

  it("enforces name and message lengths", () => {
    expect(contactMessageSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...valid, name: "a".repeat(121) }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...valid, message: "too short" }).success).toBe(false);
    expect(contactMessageSchema.safeParse({ ...valid, message: "a".repeat(3001) }).success).toBe(
      false,
    );
  });
});

describe("payoutAccountSchema", () => {
  it("accepts a bank code and a 10-digit account number, trimming spaces", () => {
    const parsed = payoutAccountSchema.parse({ bankCode: "058", accountNumber: " 0123456789 " });
    expect(parsed).toEqual({ bankCode: "058", accountNumber: "0123456789" });
    // Real Paystack codes are not all digits (e.g. "035A", "MFB50094").
    const letters = payoutAccountSchema.safeParse({
      bankCode: "MFB50094",
      accountNumber: "0123456789",
    });
    expect(letters.success).toBe(true);
  });

  it("rejects account numbers that are not exactly 10 digits", () => {
    for (const accountNumber of ["012345678", "01234567890", "01234abcde", ""]) {
      const result = payoutAccountSchema.safeParse({ bankCode: "058", accountNumber });
      expect(result.success).toBe(false);
    }
  });

  it("rejects a missing or odd bank code", () => {
    for (const bankCode of ["", "05 8", "x".repeat(21), "../x"]) {
      const result = payoutAccountSchema.safeParse({ bankCode, accountNumber: "0123456789" });
      expect(result.success).toBe(false);
    }
  });
});
