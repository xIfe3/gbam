import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getPlatformInfo } = vi.hoisted(() => ({ getPlatformInfo: vi.fn() }));
vi.mock("@/lib/platform-info", () => ({ getPlatformInfo }));
vi.mock("next/server", () => ({ connection: async () => undefined }));

import MaintenancePage from "./page";

function info(level: "off" | "full" | "pause", message: string | null, backBy: string | null) {
  return {
    whatsappNumber: null,
    signupsOpen: true,
    feePercentBasisPoints: 150,
    feeCapKobo: 100_000,
    maintenance: { level, message, backBy },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("maintenance page", () => {
  it("maintenance page shows the message and back-by time", async () => {
    getPlatformInfo.mockResolvedValue(info("full", "Upgrading payments", "2026-10-09T15:00:00Z"));
    render(await MaintenancePage());
    expect(
      screen.getByRole("heading", { name: "Gbam is down for a short update" }),
    ).toBeInTheDocument();
    expect(screen.getByText("Upgrading payments")).toBeInTheDocument();
    expect(screen.getByText(/Back by/)).toBeInTheDocument();
  });

  it("explains a pause differently", async () => {
    getPlatformInfo.mockResolvedValue(info("pause", null, null));
    render(await MaintenancePage());
    expect(
      screen.getByRole("heading", { name: "Ordering is paused for a short while" }),
    ).toBeInTheDocument();
  });

  it("says we're back once maintenance is off", async () => {
    getPlatformInfo.mockResolvedValue(info("off", null, null));
    render(await MaintenancePage());
    expect(screen.getByRole("link", { name: "Go to Gbam" })).toHaveAttribute("href", "/");
  });
});
