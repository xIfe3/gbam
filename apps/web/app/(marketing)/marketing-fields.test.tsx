import { MARKETING_DEFAULTS } from "@gbam/shared";
import { render, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

const { getMarketing } = vi.hoisted(() => ({ getMarketing: vi.fn() }));
vi.mock("@/lib/marketing", async () => {
  const real = await vi.importActual<typeof import("@/lib/marketing")>("@/lib/marketing");
  return { ...real, getMarketing };
});
vi.mock("server-only", () => ({}));

import AboutPage from "./about/page";
import FeaturesPage from "./features/page";

describe("marketing pages read their editable fields", () => {
  it("features shows the published tiles and header", async () => {
    getMarketing.mockResolvedValue({
      ...MARKETING_DEFAULTS.features,
      header: { ...MARKETING_DEFAULTS.features.header, title: "All you need to sell" },
      tiles: [{ eyebrow: "New", title: "Delivery zones", text: "Set a fee for each area." }],
    });
    render(await FeaturesPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("All you need to sell");
    expect(screen.getByText("Delivery zones")).toBeInTheDocument();
    expect(screen.queryByText("One link for your whole shop")).toBeNull();
    expect(getMarketing).toHaveBeenCalledWith("features");
  });

  it("an empty button label means no header button", async () => {
    getMarketing.mockResolvedValue(MARKETING_DEFAULTS.about);
    render(await AboutPage());
    expect(screen.getByRole("heading", { level: 1 })).toHaveTextContent("Why Gbam exists");
    // The page's own header has no button (the band lower down still has its link).
    const header = screen.getByRole("banner");
    expect(within(header).queryByRole("link")).toBeNull();
  });
});
