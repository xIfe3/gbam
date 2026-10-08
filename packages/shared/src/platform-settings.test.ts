import { describe, expect, it } from "vitest";
import { calculatePlatformFee, PLATFORM_FEE } from "./fees";
import {
  DEFAULT_PLATFORM_SETTINGS,
  maintenanceSchema,
  platformSettingsSchema,
} from "./platform-settings";

describe("platform settings", () => {
  it("defaults match today's values", () => {
    expect(DEFAULT_PLATFORM_SETTINGS).toEqual({
      feePercentBasisPoints: 150,
      feeCapKobo: 100_000,
      foundingWaiverDays: 90,
      reminderAfterHours: 24,
      cancelAfterHours: 48,
      supportEmail: "support@gbam.app",
      contactEmail: "hello@gbam.app",
      privacyEmail: "privacy@gbam.app",
      whatsappNumber: null,
      signupsOpen: true,
    });
    expect(DEFAULT_PLATFORM_SETTINGS.feePercentBasisPoints).toBe(PLATFORM_FEE.percentBasisPoints);
    expect(platformSettingsSchema.safeParse(DEFAULT_PLATFORM_SETTINGS).success).toBe(true);
  });

  it("reminder must come before cancel", () => {
    const result = platformSettingsSchema.safeParse({
      ...DEFAULT_PLATFORM_SETTINGS,
      reminderAfterHours: 48,
      cancelAfterHours: 48,
    });
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.path).toEqual(["reminderAfterHours"]);
  });

  it("fee above 5% refused", () => {
    const result = platformSettingsSchema.safeParse({
      ...DEFAULT_PLATFORM_SETTINGS,
      feePercentBasisPoints: 900,
    });
    expect(result.success).toBe(false);
  });

  it("a blank WhatsApp number becomes null", () => {
    const parsed = platformSettingsSchema.parse({
      ...DEFAULT_PLATFORM_SETTINGS,
      whatsappNumber: "",
    });
    expect(parsed.whatsappNumber).toBeNull();
  });

  it("maintenance needs a known level", () => {
    expect(
      maintenanceSchema.safeParse({ level: "full", message: null, backBy: null }).success,
    ).toBe(true);
    expect(
      maintenanceSchema.safeParse({ level: "half", message: null, backBy: null }).success,
    ).toBe(false);
  });
});

describe("calculatePlatformFee with rates", () => {
  it("fee uses the given rates", () => {
    // 2% of ₦10,000 = ₦200, under a ₦5,000 cap.
    expect(
      calculatePlatformFee(1_000_000, null, new Date(), {
        percentBasisPoints: 200,
        capKobo: 500_000,
      }),
    ).toBe(20_000);
    // Without rates: today's 1.5%.
    expect(calculatePlatformFee(1_000_000, null)).toBe(15_000);
  });
});
