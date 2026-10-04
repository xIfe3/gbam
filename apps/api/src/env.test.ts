import { describe, expect, it } from "vitest";
import { loadEnv } from "./env.js";

const base = {
  DATABASE_URL: "postgres://gbam:gbam@localhost:5433/gbam",
  REDIS_URL: "redis://localhost:6379/1",
};

const productionKeys = {
  NODE_ENV: "production",
  PAYSTACK_SECRET_KEY: "sk_test",
  WHATSAPP_ACCESS_TOKEN: "token",
  WHATSAPP_PHONE_NUMBER_ID: "123",
  WHATSAPP_APP_SECRET: "secret",
  WHATSAPP_WEBHOOK_VERIFY_TOKEN: "verify",
  RESEND_API_KEY: "re_test",
};

describe("loadEnv INTERNAL_API_SECRET", () => {
  it("is optional in development", () => {
    expect(loadEnv({ ...base }).INTERNAL_API_SECRET).toBeUndefined();
  });

  it("is required in production", () => {
    expect(() => loadEnv({ ...base, ...productionKeys })).toThrow(/INTERNAL_API_SECRET/);
    const secret = "x".repeat(40);
    expect(
      loadEnv({ ...base, ...productionKeys, INTERNAL_API_SECRET: secret }).INTERNAL_API_SECRET,
    ).toBe(secret);
  });
});
