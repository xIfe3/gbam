import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadEnv, PRODUCTION_REQUIRED_KEYS } from "./env.js";

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
  R2_ACCOUNT_ID: "acct",
  R2_ACCESS_KEY_ID: "key",
  R2_SECRET_ACCESS_KEY: "secret",
  R2_BUCKET: "bucket",
  PHOTOS_PUBLIC_URL: "https://photos.gbam.app",
};

describe("loadEnv photo storage", () => {
  it("lists R2_BUCKET as required in production when it is missing", () => {
    const withoutBucket: Record<string, string> = { ...base, ...productionKeys };
    delete withoutBucket.R2_BUCKET;
    withoutBucket.INTERNAL_API_SECRET = "x".repeat(40);
    expect(() => loadEnv(withoutBucket)).toThrow(/Required in production[\s\S]*at R2_BUCKET/);
  });

  it("defaults PHOTOS_LOCAL_DIR to uploads/photos", () => {
    expect(loadEnv({ ...base }).PHOTOS_LOCAL_DIR).toBe("uploads/photos");
  });
});

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

  it("must be at least 32 characters in production", () => {
    const tooShort = "x".repeat(31);
    const shortEnv = { ...base, ...productionKeys, INTERNAL_API_SECRET: tooShort };
    expect(() => loadEnv(shortEnv)).toThrow(/at least 32 characters/);
    expect(() => loadEnv(shortEnv)).toThrow(/INTERNAL_API_SECRET/);
    const justRight = "x".repeat(32);
    expect(
      loadEnv({ ...base, ...productionKeys, INTERNAL_API_SECRET: justRight }).INTERNAL_API_SECRET,
    ).toBe(justRight);
  });

  it("may be short in development", () => {
    expect(loadEnv({ ...base, INTERNAL_API_SECRET: "dev" }).INTERNAL_API_SECRET).toBe("dev");
  });
});

/**
 * The production stack can only start if docker/docker-compose.prod.yml passes every
 * production-required variable to the API, and .env.production.example tells the owner to
 * set it. These tests read both files so they can't drift from env.ts again.
 */
describe("production deploy files", () => {
  const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
  const compose = readFileSync(path.join(repoRoot, "docker/docker-compose.prod.yml"), "utf8");
  const example = readFileSync(path.join(repoRoot, ".env.production.example"), "utf8");

  it("passes every production-required API variable in the compose file", () => {
    for (const key of PRODUCTION_REQUIRED_KEYS) {
      expect(compose, `${key} missing from docker-compose.prod.yml`).toContain(`${key}:`);
    }
    expect(compose).toContain("WEB_URL:");
    expect(compose).toContain("EMAIL_FROM:");
  });

  it("lists every production-required API variable in .env.production.example", () => {
    for (const key of PRODUCTION_REQUIRED_KEYS) {
      expect(example, `${key} missing from .env.production.example`).toMatch(
        new RegExp(`^${key}=`, "m"),
      );
    }
  });

  it("passes the web app's optional settings to the web service", () => {
    expect(compose).toContain("GBAM_WHATSAPP_NUMBER:");
    expect(compose).toContain("TRUSTED_PROXY_HOPS:");
    expect(example).toMatch(/^TRUSTED_PROXY_HOPS=/m);
  });

  it("runs the content sync after migrations", () => {
    expect(compose).toContain("dist/migrate.js && node node_modules/@gbam/db/dist/sync-content.js");
  });
});
