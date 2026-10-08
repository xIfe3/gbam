import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { maintenanceRewrites } from "./maintenance-paths";
import { clearPlatformInfoCache, getPlatformInfo } from "./platform-info";

const INFO = {
  whatsappNumber: "2348012345678",
  signupsOpen: true,
  feePercentBasisPoints: 150,
  feeCapKobo: 100_000,
  maintenance: { level: "off", message: null, backBy: null },
};

describe("getPlatformInfo", () => {
  beforeEach(() => {
    clearPlatformInfoCache();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("reuses the answer for 10 seconds", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(INFO), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await getPlatformInfo()).toEqual(INFO);
    expect(await getPlatformInfo()).toEqual(INFO);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("fails open when the status can't be loaded", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("API down");
      }),
    );
    expect(await getPlatformInfo()).toBeNull();
  });
});

describe("maintenanceRewrites", () => {
  it("full rewrites a shop page but not admin pages", () => {
    expect(maintenanceRewrites("full", "/ada")).toBe(true);
    expect(maintenanceRewrites("full", "/")).toBe(true);
    expect(maintenanceRewrites("full", "/admin")).toBe(false);
    expect(maintenanceRewrites("full", "/admin/shops")).toBe(false);
    expect(maintenanceRewrites("full", "/maintenance")).toBe(false);
  });

  it("pause rewrites checkout but not the shop", () => {
    expect(maintenanceRewrites("pause", "/ada/order")).toBe(true);
    expect(maintenanceRewrites("pause", "/pay/GB-7K2Q")).toBe(true);
    expect(maintenanceRewrites("pause", "/login")).toBe(true);
    expect(maintenanceRewrites("pause", "/signup/verify")).toBe(true);
    expect(maintenanceRewrites("pause", "/dashboard/orders")).toBe(true);
    expect(maintenanceRewrites("pause", "/ada")).toBe(false);
    expect(maintenanceRewrites("pause", "/ada/puff-puff")).toBe(false);
    expect(maintenanceRewrites("pause", "/track/GB-7K2Q")).toBe(false);
    expect(maintenanceRewrites("pause", "/")).toBe(false);
  });

  it("off rewrites nothing", () => {
    expect(maintenanceRewrites("off", "/ada/order")).toBe(false);
  });
});
