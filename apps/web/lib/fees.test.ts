import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPlatformInfo } = vi.hoisted(() => ({ getPlatformInfo: vi.fn() }));
vi.mock("./platform-info", () => ({ getPlatformInfo }));

import { liveFees } from "./fees";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("liveFees", () => {
  it("uses the rates from Admin → Settings", async () => {
    getPlatformInfo.mockResolvedValue({ feePercentBasisPoints: 200, feeCapKobo: 150_000 });
    expect(await liveFees()).toEqual({
      percent: 2,
      cap: "₦1,500",
      rates: { percentBasisPoints: 200, capKobo: 150_000 },
    });
  });

  it("falls back to the defaults when the API can't be reached", async () => {
    getPlatformInfo.mockResolvedValue(null);
    expect(await liveFees()).toEqual({
      percent: 1.5,
      cap: "₦1,000",
      rates: { percentBasisPoints: 150, capKobo: 100_000 },
    });
  });
});
