import { describe, expect, it } from "vitest";
import { contactMessageSchema, emailSchema } from "./schemas";

const valid = { name: "Ada", email: "ada@example.com", message: "Hello, I have a question." };

describe("emailSchema", () => {
  it("trims and lowercases", () => {
    expect(emailSchema.parse("  Ada@Example.COM ")).toBe("ada@example.com");
  });

  it("rejects a non-email", () => {
    expect(emailSchema.safeParse("not-an-email").success).toBe(false);
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
