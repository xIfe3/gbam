import { MARKETING_DEFAULTS } from "@gbam/shared";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { marketingDataFromForm } from "./marketing-form-data";
import { MarketingForm } from "./marketing-form";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) {
    data.set(name, value);
  }
  return data;
}

describe("marketing page form", () => {
  it("shows the page's current words", () => {
    render(<MarketingForm page="about" fields={MARKETING_DEFAULTS.about} action={vi.fn()} />);
    expect(screen.getByRole("textbox", { name: "Headline" })).toHaveValue("Why Gbam exists");
    expect(screen.getByRole("textbox", { name: "Search engine description" })).toHaveValue(
      MARKETING_DEFAULTS.about.seoDescription,
    );
  });

  it("features tiles can be added and removed", () => {
    render(<MarketingForm page="features" fields={MARKETING_DEFAULTS.features} action={vi.fn()} />);
    expect(screen.getAllByRole("textbox", { name: /^Tile \d+ title$/ })).toHaveLength(10);
    fireEvent.click(screen.getByRole("button", { name: "Add a tile" }));
    expect(screen.getAllByRole("textbox", { name: /^Tile \d+ title$/ })).toHaveLength(11);
    fireEvent.click(screen.getAllByRole("button", { name: /Remove tile/ })[0] as HTMLElement);
    expect(screen.getAllByRole("textbox", { name: /^Tile \d+ title$/ })).toHaveLength(10);
  });

  it("the form's fields become the page's data", () => {
    const data = marketingDataFromForm(
      "features",
      form({
        seoDescription: "Everything you need",
        "header.eyebrow": "Features",
        "header.title": "All you need",
        "header.lead": "Lead",
        "header.photoSrc": "/images/pages/features.webp",
        "header.photoAlt": "A seller",
        "header.ctaLabel": "",
        "tiles.0.eyebrow": "New",
        "tiles.0.title": "Zones",
        "tiles.0.text": "Delivery fees",
        "tiles.1.eyebrow": "Pay",
        "tiles.1.title": "Paystack",
        "tiles.1.text": "Safe payments",
      }),
    );
    expect(data).toEqual({
      seoDescription: "Everything you need",
      header: {
        eyebrow: "Features",
        title: "All you need",
        lead: "Lead",
        photoSrc: "/images/pages/features.webp",
        photoAlt: "A seller",
        ctaLabel: "",
      },
      tiles: [
        { eyebrow: "New", title: "Zones", text: "Delivery fees" },
        { eyebrow: "Pay", title: "Paystack", text: "Safe payments" },
      ],
    });
    const home = marketingDataFromForm(
      "home",
      form({
        seoDescription: "s",
        heroSubtitle: "Sub",
        primaryButton: "Go",
        secondaryButton: "More",
        heroSmallPrint: "Small",
      }),
    );
    expect(home).toEqual({
      seoDescription: "s",
      heroSubtitle: "Sub",
      primaryButton: "Go",
      secondaryButton: "More",
      heroSmallPrint: "Small",
    });
  });
});
