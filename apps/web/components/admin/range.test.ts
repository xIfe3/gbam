import { describe, expect, it } from "vitest";
import { rangeFromParams, rangePresets } from "./range";

describe("report ranges", () => {
  it("range presets set from/to", () => {
    // 2026-10-09 at 23:30 UTC is already 2026-10-10 in Lagos (UTC+1).
    const presets = rangePresets(new Date("2026-10-09T23:30:00Z"));
    expect(presets).toEqual([
      { label: "Today", from: "2026-10-10", to: "2026-10-10" },
      { label: "7 days", from: "2026-10-04", to: "2026-10-10" },
      { label: "30 days", from: "2026-09-11", to: "2026-10-10" },
    ]);
  });

  it("reads from/to from the address, ignoring anything that isn't a date", () => {
    expect(rangeFromParams({ from: "2026-10-01", to: "2026-10-05" })).toEqual({
      from: "2026-10-01",
      to: "2026-10-05",
    });
    expect(rangeFromParams({ from: "yesterday", to: ["2026-10-05", "x"] })).toEqual({
      from: undefined,
      to: "2026-10-05",
    });
  });
});
